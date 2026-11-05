/**
 * Settlewise MCP Server — Streamable HTTP (stateless)
 *
 * Endpoint: GET/POST /api/mcp?key=TOKEN
 * No OAuth. The ?key= query param is resolved to a user on every request.
 *
 * Rule #1: No AI SDK. This is a plain MCP tool server.
 * Rule #3: Totals computed server-side only.
 * Rule #4: All DB operations scoped by resolved userId.
 *
 * Auth pattern: withMcpAuth reads req.url for ?key=, resolves the user,
 * and embeds userId in authInfo.extra so tool callbacks can retrieve it.
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeInvoiceTotals, rupeesToPaise } from "@/lib/money";
import { generateToken, formatInvoiceNumber } from "@/lib/utils";
import { todayIST, deriveInvoiceStatus } from "@/lib/invoice-status";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// MCP Handler (stateless — built once, handles all requests)
// ---------------------------------------------------------------------------
const mcpHandler = createMcpHandler(
  (server) => {
    // -----------------------------------------------------------------------
    // Tool: create_invoice
    // -----------------------------------------------------------------------
    server.registerTool(
      "create_invoice",
      {
        title: "Create Invoice",
        description: `
Create a new invoice for the authenticated Settlewise user and issue it immediately.

CUSTOMER: Pass an existing customer_id, OR provide customer_name + customer_email
to find-or-create a customer. Email matching is case-insensitive to avoid duplicates.

PRICES: All line item prices must be in RUPEES (not paise).
The server converts to paise and computes all totals — do NOT pass a total field.

DATES: invoice_date defaults to today (Asia/Kolkata). Provide due_in_days (days from invoice_date)
OR an explicit due_date (YYYY-MM-DD).

RETURNS: invoice number, customer, total amount, due date, derived status, and
the hosted public URL the customer can open to view and pay the invoice.
        `.trim(),
        inputSchema: z.object({
          customer_id: z.string().optional().describe(
            "Existing customer ID. Use this OR customer_name+customer_email."
          ),
          customer_name: z.string().optional().describe(
            "Customer display name. Required when creating a new customer."
          ),
          customer_email: z.string().email().optional().describe(
            "Customer email. Used to find-or-create the customer."
          ),
          invoice_date: z.string().optional().describe(
            "Invoice date as YYYY-MM-DD. Defaults to today in Asia/Kolkata."
          ),
          due_in_days: z.number().int().positive().optional().describe(
            "Days until due from invoice_date. Use this OR due_date. Defaults to 30."
          ),
          due_date: z.string().optional().describe(
            "Explicit due date as YYYY-MM-DD. Use this OR due_in_days."
          ),
          currency: z.string().default("INR").describe("Currency code, default INR"),
          line_items: z.array(z.object({
            description: z.string(),
            quantity: z.number().int().positive(),
            unit_price: z.number().positive().describe(
              "Unit price in RUPEES. E.g. 5000 for ₹5,000."
            ),
          })).min(1).describe("At least one line item is required"),
          tax_percent: z.number().min(0).max(100).default(0).describe(
            "Tax percentage applied after discount. E.g. 18 for 18% GST."
          ),
          discount: z.number().min(0).default(0).describe(
            "Flat discount in RUPEES applied before tax."
          ),
          notes: z.string().optional().describe("Optional notes or payment terms"),
        }),
      },
      async (input, ctx) => {
        // In MCP SDK v2, authInfo is located at ctx.http.authInfo
        const authInfo = (ctx as any)?.http?.authInfo ?? (ctx as any)?.authInfo;
        const userId = authInfo?.extra?.userId as string | undefined;
        if (!userId) {
          return {
            isError: true,
            content: [{ type: "text", text: "Unauthorized: invalid or missing MCP token." }],
          };
        }

        // --- Resolve or find-or-create customer ---
        let customerId: string;
        if (input.customer_id) {
          const existing = await prisma.customer.findFirst({
            where: { id: input.customer_id, userId },
          });
          if (!existing) {
            return {
              isError: true,
              content: [{ type: "text", text: `Customer not found: ${input.customer_id}` }],
            };
          }
          customerId = existing.id;
        } else if (input.customer_email) {
          const email = input.customer_email.toLowerCase();
          const existing = await prisma.customer.findFirst({
            where: { userId, email },
          });
          if (existing) {
            customerId = existing.id;
          } else {
            if (!input.customer_name) {
              return {
                isError: true,
                content: [{ type: "text", text: "customer_name is required when creating a new customer." }],
              };
            }
            const created = await prisma.customer.create({
              data: { userId, name: input.customer_name, email },
            });
            customerId = created.id;
          }
        } else {
          return {
            isError: true,
            content: [{ type: "text", text: "Provide either customer_id or customer_email (+ customer_name for new customers)." }],
          };
        }

        // --- Dates ---
        const invoiceDateStr = input.invoice_date ?? todayIST();
        let dueDateStr: string;
        if (input.due_date) {
          dueDateStr = input.due_date;
        } else {
          const daysAhead = input.due_in_days ?? 30;
          const base = new Date(`${invoiceDateStr}T00:00:00+05:30`);
          base.setDate(base.getDate() + daysAhead);
          dueDateStr = base.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        }

        // --- Server-side total computation (Rule #3) ---
        const lineItems = input.line_items.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPricePaise: rupeesToPaise(li.unit_price),
          totalPaise: li.quantity * rupeesToPaise(li.unit_price),
        }));
        const discountPaise = rupeesToPaise(input.discount ?? 0);
        const { subtotalPaise, taxPaise, totalPaise } = computeInvoiceTotals(
          lineItems,
          input.tax_percent ?? 0,
          discountPaise
        );

        // --- Sequential invoice number per user ---
        const existingCount = await prisma.invoice.count({ where: { userId } });
        const invoiceNumber = formatInvoiceNumber(existingCount + 1);
        const publicToken = generateToken(24);

        // --- Create invoice + items atomically ---
        const invoice = await prisma.$transaction(async (tx) => {
          const inv = await tx.invoice.create({
            data: {
              userId,
              customerId,
              number: invoiceNumber,
              publicToken,
              invoiceDate: new Date(`${invoiceDateStr}T00:00:00+05:30`),
              dueDate: new Date(`${dueDateStr}T00:00:00+05:30`),
              currency: input.currency ?? "INR",
              subtotalPaise,
              taxPaise,
              discountPaise,
              totalPaise,
              state: "issued",
              notes: input.notes ?? "",
            },
          });
          await tx.invoiceItem.createMany({
            data: lineItems.map((li) => ({
              invoiceId: inv.id,
              description: li.description,
              quantity: li.quantity,
              unitPricePaise: li.unitPricePaise,
              totalPaise: li.totalPaise,
            })),
          });
          return inv;
        });

        // --- Derive status ---
        const status = deriveInvoiceStatus({
          state: invoice.state,
          viewedAt: invoice.viewedAt,
          dueDate: invoice.dueDate,
          totalPaise: invoice.totalPaise,
          payments: [],
        });

        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        const hostedUrl = `${appUrl}/i/${invoice.publicToken}`;
        const totalDisplay = new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: input.currency ?? "INR",
        }).format(totalPaise / 100);

        // Fetch customer name for the response
        const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

        return {
          content: [{
            type: "text",
            text: [
              `✅ Invoice created!`,
              ``,
              `Invoice #:  ${invoiceNumber}`,
              `Customer:   ${customer.name}${customer.companyName ? ` (${customer.companyName})` : ""}`,
              `Total:      ${totalDisplay}`,
              `Due date:   ${dueDateStr}`,
              `Status:     ${status}`,
              ``,
              `Public URL: ${hostedUrl}`,
            ].join("\n"),
          }],
        };
      }
    );

    // -----------------------------------------------------------------------
    // Tool: list_invoices
    // -----------------------------------------------------------------------
    server.registerTool(
      "list_invoices",
      {
        title: "List Invoices",
        description: "List recent invoices. Returns number, customer, total, due date, and derived status.",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(50).default(20),
          status_filter: z.enum([
            "all", "overdue", "sent", "paid", "draft", "cancelled", "partially_paid", "viewed"
          ]).default("all"),
        }),
      },
      async (input, ctx) => {
        const authInfo = (ctx as any)?.http?.authInfo ?? (ctx as any)?.authInfo;
        const userId = authInfo?.extra?.userId as string | undefined;
        if (!userId) {
          return {
            isError: true,
            content: [{ type: "text", text: "Unauthorized: invalid or missing MCP token." }],
          };
        }

        const invoices = await prisma.invoice.findMany({
          where: { userId },
          include: { customer: true, payments: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        });

        const rows = invoices
          .map((inv) => ({
            inv,
            status: deriveInvoiceStatus({
              state: inv.state,
              viewedAt: inv.viewedAt,
              dueDate: inv.dueDate,
              totalPaise: inv.totalPaise,
              payments: inv.payments,
            }),
          }))
          .filter(({ status }) => input.status_filter === "all" || status === input.status_filter)
          .slice(0, input.limit);

        if (rows.length === 0) {
          return { content: [{ type: "text", text: "No invoices found." }] };
        }

        const lines = rows.map(({ inv, status }) => {
          const total = new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: inv.currency,
          }).format(inv.totalPaise / 100);
          const due = inv.dueDate.toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "numeric", month: "short", year: "numeric",
          });
          return `${inv.number}  ${inv.customer.name.padEnd(20)}  ${total.padStart(14)}  Due: ${due}  [${status}]`;
        });

        return {
          content: [{
            type: "text",
            text: `Showing ${rows.length} invoice(s):\n\n${lines.join("\n")}`,
          }],
        };
      }
    );
  },
  {
    serverInfo: { name: "settlewise", version: "1.0.0" },
  }
);

// ---------------------------------------------------------------------------
// Auth wrapper — reads ?key= query param, resolves to user, sets authInfo
// ---------------------------------------------------------------------------
async function verifyToken(req: Request): Promise<AuthInfo | undefined> {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) return undefined;

  const user = await prisma.user.findUnique({
    where: { mcpToken: key },
    select: { id: true, email: true },
  });
  if (!user) return undefined;

  return {
    token: key,
    clientId: user.id,
    scopes: [],
    extra: { userId: user.id },
  };
}

const authenticatedHandler = withMcpAuth(mcpHandler, verifyToken, {
  required: true,
});

export { authenticatedHandler as GET, authenticatedHandler as POST };
