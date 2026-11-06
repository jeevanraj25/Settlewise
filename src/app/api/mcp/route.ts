/**
 * Settlewise MCP Server — Streamable HTTP (stateless)
 *
 * Endpoint: GET/POST /api/mcp?key=TOKEN
 *
 * Hard Rules:
 * Rule #1: No AI inside the app. MCP tool server only.
 * Rule #3: Totals computed server-side in integer paise only.
 * Rule #4: All DB operations strictly scoped by resolved userId.
 * Rule #5: Invoice statuses derived at read time using shared deriveInvoiceStatus().
 * Rule #6: Dates treated in Asia/Kolkata timezone.
 * Rule #7: Honest labelling: "Manually recorded" on payments, "Simulated (test mode)" on reminders.
 */

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeInvoiceTotals, rupeesToPaise, formatPaise } from "@/lib/money";
import { generateToken, formatInvoiceNumber, getBaseUrl } from "@/lib/utils";
import { todayIST, deriveInvoiceStatus, STATUS_META, InvoiceStatus } from "@/lib/invoice-status";
import { scheduleInvoiceReminders } from "@/lib/reminders";
import type { AuthInfo } from "@modelcontextprotocol/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helper: Resolve invoice by ID or Number scoped to user
// ---------------------------------------------------------------------------
async function findUserInvoice(
  userId: string,
  params: { invoice_id?: string; invoice_number?: string }
) {
  if (params.invoice_id) {
    return prisma.invoice.findFirst({
      where: { id: params.invoice_id, userId },
      include: { customer: true, payments: true, items: true },
    });
  }
  if (params.invoice_number) {
    return prisma.invoice.findFirst({
      where: { number: params.invoice_number.trim(), userId },
      include: { customer: true, payments: true, items: true },
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// MCP Server Initialization
// ---------------------------------------------------------------------------
const mcpHandler = createMcpHandler(
  (server) => {
    // -----------------------------------------------------------------------
    // 1. Tool: find_customer
    // -----------------------------------------------------------------------
    server.registerTool(
      "find_customer",
      {
        title: "Find Customer",
        description: `
Search for existing customers by contact name, company name, or email address.
Use this tool before creating an invoice when you need to check if a customer already exists
or when you need a customer_id for updating records.
        `.trim(),
        inputSchema: z.object({
          query: z.string().min(1).describe("Search term matching customer name, company, or email"),
        }),
      },
      async (input, ctx) => {
        const userId = (ctx as any)?.http?.authInfo?.extra?.userId;
        if (!userId) {
          return { isError: true, content: [{ type: "text", text: "Unauthorized: Invalid or missing token." }] };
        }

        const q = input.query.trim();
        const customers = await prisma.customer.findMany({
          where: {
            userId,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { companyName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          include: {
            _count: { select: { invoices: true } },
          },
          take: 10,
        });

        if (customers.length === 0) {
          return { content: [{ type: "text", text: `No customers found matching "${q}".` }] };
        }

        const formatted = customers.map((c) => {
          const comp = c.companyName ? ` (${c.companyName})` : "";
          const phone = c.phone ? ` | Phone: ${c.phone}` : "";
          return `• ${c.name}${comp} — ${c.email}${phone} [ID: ${c.id}] (${c._count.invoices} invoices)`;
        });

        return {
          content: [{
            type: "text",
            text: `Found ${customers.length} customer(s):\n\n${formatted.join("\n")}`,
          }],
        };
      }
    );

    // -----------------------------------------------------------------------
    // 2. Tool: create_customer
    // -----------------------------------------------------------------------
    server.registerTool(
      "create_customer",
      {
        title: "Create Customer",
        description: `
Add a new customer to Settlewise.
Email must be unique within your account (case-insensitive).
Use this tool to register a client before billing or when onboarding a new account.
        `.trim(),
        inputSchema: z.object({
          name: z.string().min(1).describe("Customer contact name (e.g. Anita Desai)"),
          email: z.string().email().describe("Customer billing email address"),
          company_name: z.string().optional().describe("Company or business name"),
          phone: z.string().optional().describe("Contact phone number"),
          billing_address: z.string().optional().describe("Physical or billing address"),
        }),
      },
      async (input, ctx) => {
        const userId = (ctx as any)?.http?.authInfo?.extra?.userId;
        if (!userId) {
          return { isError: true, content: [{ type: "text", text: "Unauthorized: Invalid or missing token." }] };
        }

        const email = input.email.trim().toLowerCase();

        // Prevent duplicates scoped by userId
        const existing = await prisma.customer.findFirst({
          where: { userId, email },
        });
        if (existing) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Customer with email "${email}" already exists: ${existing.name} (ID: ${existing.id})`,
            }],
          };
        }

        const customer = await prisma.customer.create({
          data: {
            userId,
            name: input.name.trim(),
            companyName: input.company_name?.trim() ?? "",
            email,
            phone: input.phone?.trim() ?? "",
            billingAddress: input.billing_address?.trim() ?? "",
          },
        });

        return {
          content: [{
            type: "text",
            text: [
              `✅ Customer created successfully!`,
              `ID:       ${customer.id}`,
              `Name:     ${customer.name}`,
              `Company:  ${customer.companyName || "N/A"}`,
              `Email:    ${customer.email}`,
              `Phone:    ${customer.phone || "N/A"}`,
            ].join("\n"),
          }],
        };
      }
    );

    // -----------------------------------------------------------------------
    // 3. Tool: create_invoice (Phase 1 Slice)
    // -----------------------------------------------------------------------
    server.registerTool(
      "create_invoice",
      {
        title: "Create Invoice",
        description: `
Create and issue a new invoice. Line item prices must be in RUPEES (not paise).
All totals, taxes, and discounts are computed strictly server-side in integer paise.
DATES: invoice_date defaults to today (Asia/Kolkata). Provide due_in_days OR due_date.
RETURNS: invoice number, customer, total, due date, derived status, and the public hosted link.
        `.trim(),
        inputSchema: z.object({
          customer_id: z.string().optional().describe("Existing customer ID. Use this OR customer_name+customer_email."),
          customer_name: z.string().optional().describe("Customer name when auto-creating."),
          customer_email: z.string().email().optional().describe("Customer email when auto-creating."),
          invoice_date: z.string().optional().describe("Invoice date YYYY-MM-DD (defaults to today in IST)."),
          due_in_days: z.number().int().positive().optional().describe("Days until due (defaults to 30)."),
          due_date: z.string().optional().describe("Explicit due date YYYY-MM-DD."),
          currency: z.string().default("INR").describe("Currency code, default INR"),
          line_items: z.array(z.object({
            description: z.string(),
            quantity: z.number().int().positive(),
            unit_price: z.number().positive().describe("Unit price in RUPEES (e.g. 15000 for ₹15,000)"),
          })).min(1).describe("List of line items"),
          tax_percent: z.number().min(0).max(100).default(0).describe("Tax percentage (e.g. 18 for 18% GST)"),
          discount: z.number().min(0).default(0).describe("Flat discount in RUPEES"),
          notes: z.string().optional().describe("Invoice notes or payment terms"),
        }),
      },
      async (input, ctx) => {
        const userId = (ctx as any)?.http?.authInfo?.extra?.userId;
        if (!userId) {
          return { isError: true, content: [{ type: "text", text: "Unauthorized: Invalid or missing token." }] };
        }

        // Customer resolution
        let customerId: string;
        if (input.customer_id) {
          const c = await prisma.customer.findFirst({ where: { id: input.customer_id, userId } });
          if (!c) return { isError: true, content: [{ type: "text", text: `Customer not found: ${input.customer_id}` }] };
          customerId = c.id;
        } else if (input.customer_email) {
          const email = input.customer_email.trim().toLowerCase();
          const existing = await prisma.customer.findFirst({ where: { userId, email } });
          if (existing) {
            customerId = existing.id;
          } else {
            if (!input.customer_name) {
              return { isError: true, content: [{ type: "text", text: "customer_name is required when creating a new customer." }] };
            }
            const created = await prisma.customer.create({
              data: { userId, name: input.customer_name.trim(), email },
            });
            customerId = created.id;
          }
        } else {
          return { isError: true, content: [{ type: "text", text: "Provide customer_id OR customer_email + customer_name." }] };
        }

        const invoiceDateStr = input.invoice_date ?? todayIST();
        let dueDateStr: string;
        if (input.due_date) {
          dueDateStr = input.due_date;
        } else {
          const days = input.due_in_days ?? 30;
          const d = new Date(`${invoiceDateStr}T00:00:00+05:30`);
          d.setDate(d.getDate() + days);
          dueDateStr = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        }

        const lineItems = input.line_items.map((li) => ({
          description: li.description.trim(),
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

        const count = await prisma.invoice.count({ where: { userId } });
        const invoiceNumber = formatInvoiceNumber(count + 1);
        const publicToken = generateToken(24);

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

        // Auto-schedule reminders if enabled (Phase 5 Requirement 2)
        await scheduleInvoiceReminders(invoice.id).catch((err) =>
          console.error("[scheduleInvoiceReminders error]", err)
        );

        const status = deriveInvoiceStatus({
          state: invoice.state,
          viewedAt: null,
          dueDate: invoice.dueDate,
          totalPaise: invoice.totalPaise,
          payments: [],
        });

        const hostedUrl = `${getBaseUrl()}/i/${invoice.publicToken}`;
        const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

        return {
          content: [{
            type: "text",
            text: [
              `✅ Invoice created and issued!`,
              `Invoice #:  ${invoice.number}`,
              `Customer:   ${customer.name}${customer.companyName ? ` (${customer.companyName})` : ""}`,
              `Total:      ${formatPaise(totalPaise, invoice.currency)}`,
              `Due Date:   ${dueDateStr}`,
              `Status:     ${status}`,
              `Public URL: ${hostedUrl}`,
            ].join("\n"),
          }],
        };
      }
    );

    // -----------------------------------------------------------------------
    // 4. Tool: get_invoices & list_invoices (alias for backward compatibility)
    // -----------------------------------------------------------------------
    const getInvoicesSchema = z.object({
      status: z.enum([
        "all", "overdue", "sent", "viewed", "partially_paid", "paid", "draft", "cancelled"
      ]).default("all"),
      customer_id: z.string().optional().describe("Filter by specific customer ID"),
      search: z.string().optional().describe("Search term for customer name or invoice number"),
      overdue_by_days_min: z.number().int().min(1).optional().describe("Minimum days overdue"),
      from_date: z.string().optional().describe("Filter invoices from date YYYY-MM-DD"),
      to_date: z.string().optional().describe("Filter invoices up to date YYYY-MM-DD"),
      limit: z.number().int().min(1).max(50).default(20),
    });

    const queryInvoices = async (
      input: {
        status: "all" | "overdue" | "sent" | "viewed" | "partially_paid" | "paid" | "draft" | "cancelled";
        customer_id?: string;
        search?: string;
        overdue_by_days_min?: number;
        from_date?: string;
        to_date?: string;
        limit: number;
      },
      ctx: any
    ) => {
      const userId = ctx?.http?.authInfo?.extra?.userId;
      if (!userId) {
        return { isError: true, content: [{ type: "text" as const, text: "Unauthorized: Invalid or missing token." }] };
      }

      const where: any = { userId };
      if (input.customer_id) where.customerId = input.customer_id;
      if (input.from_date || input.to_date) {
        where.invoiceDate = {};
        if (input.from_date) where.invoiceDate.gte = new Date(`${input.from_date}T00:00:00+05:30`);
        if (input.to_date) where.invoiceDate.lte = new Date(`${input.to_date}T23:59:59+05:30`);
      }

      const invoices = await prisma.invoice.findMany({
        where,
        include: { customer: true, payments: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      const today = todayIST();

      const rows = invoices
        .map((inv) => {
          const status = deriveInvoiceStatus({
            state: inv.state,
            viewedAt: inv.viewedAt,
            dueDate: inv.dueDate,
            totalPaise: inv.totalPaise,
            payments: inv.payments,
          });
          const paidPaise = inv.payments.reduce((s, p) => s + p.amountPaise, 0);
          const balancePaise = Math.max(0, inv.totalPaise - paidPaise);
          const dueDateStr = inv.dueDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

          // Calculate days overdue
          let daysOverdue = 0;
          if (status === "overdue") {
            const diffMs = new Date(today).getTime() - new Date(dueDateStr).getTime();
            daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          }

          return { inv, status, paidPaise, balancePaise, dueDateStr, daysOverdue };
        })
        .filter(({ inv, status, daysOverdue }) => {
          if (input.status !== "all" && status !== input.status) return false;
          if (input.overdue_by_days_min !== undefined && daysOverdue < input.overdue_by_days_min) return false;
          if (input.search) {
            const q = input.search.toLowerCase();
            const matchNum = inv.number.toLowerCase().includes(q);
            const matchCust = inv.customer.name.toLowerCase().includes(q);
            const matchComp = (inv.customer.companyName || "").toLowerCase().includes(q);
            if (!matchNum && !matchCust && !matchComp) return false;
          }
          return true;
        })
        .slice(0, input.limit);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No invoices matched your query." }] };
      }

      const baseUrl = getBaseUrl();
      const lines = rows.map(({ inv, status, paidPaise, balancePaise, dueDateStr, daysOverdue }) => {
        const overdueNote = daysOverdue > 0 ? ` (${daysOverdue}d overdue)` : "";
        return [
          `${inv.number} | ${inv.customer.name} | Total: ${formatPaise(inv.totalPaise, inv.currency)} | Paid: ${formatPaise(paidPaise, inv.currency)} | Balance: ${formatPaise(balancePaise, inv.currency)}`,
          `  Due: ${dueDateStr}${overdueNote} | Status: [${status}]`,
          `  Link: ${baseUrl}/i/${inv.publicToken}`,
        ].join("\n");
      });

      return {
        content: [{
          type: "text" as const,
          text: `Found ${rows.length} invoice(s):\n\n${lines.join("\n\n")}`,
        }],
      };
    };

    server.registerTool(
      "get_invoices",
      {
        title: "Get Invoices",
        description: `
Query and filter invoices in Settlewise.
Filters:
- status: filter by derived status (all, overdue, sent, viewed, partially_paid, paid, draft, cancelled)
- customer_id: filter by customer ID
- search: text search by invoice # or customer name
- overdue_by_days_min: filter invoices overdue by at least N days
- from_date / to_date: filter by issue date range YYYY-MM-DD
Returns: invoice number, customer, total, paid, balance, due date, derived status, hosted link.
        `.trim(),
        inputSchema: getInvoicesSchema,
      },
      async (input, ctx) => queryInvoices(input, ctx)
    );

    // Backward-compatibility alias for connectors cached with 'list_invoices'
    server.registerTool(
      "list_invoices",
      {
        title: "List Invoices (Alias)",
        description: `Query and filter invoices in Settlewise (alias for get_invoices).`,
        inputSchema: getInvoicesSchema,
      },
      async (input, ctx) => queryInvoices(input, ctx)
    );

    // -----------------------------------------------------------------------
    // 5. Tool: update_invoice
    // -----------------------------------------------------------------------
    server.registerTool(
      "update_invoice",
      {
        title: "Update Invoice",
        description: `
Update an existing invoice's due date, notes, discount, tax, line items, or cancel it.
Pass invoice_id OR invoice_number (e.g. "INV-0001").
If cancel: true is passed, the invoice is marked as Cancelled.
Line item unit prices must be in RUPEES. Totals recalculate strictly in integer paise.
        `.trim(),
        inputSchema: z.object({
          invoice_id: z.string().optional().describe("Invoice ID"),
          invoice_number: z.string().optional().describe("Invoice number (e.g. INV-0001)"),
          cancel: z.boolean().optional().describe("Set true to cancel this invoice"),
          due_date: z.string().optional().describe("New due date YYYY-MM-DD"),
          notes: z.string().optional().describe("Updated invoice notes"),
          tax_percent: z.number().min(0).max(100).optional().describe("New tax percentage"),
          discount: z.number().min(0).optional().describe("New discount in RUPEES"),
          line_items: z.array(z.object({
            description: z.string(),
            quantity: z.number().int().positive(),
            unit_price: z.number().positive().describe("Unit price in RUPEES"),
          })).optional().describe("Complete replacement list of line items"),
        }),
      },
      async (input, ctx) => {
        const userId = (ctx as any)?.http?.authInfo?.extra?.userId;
        if (!userId) {
          return { isError: true, content: [{ type: "text", text: "Unauthorized: Invalid or missing token." }] };
        }

        const invoice = await findUserInvoice(userId, input);
        if (!invoice) {
          return { isError: true, content: [{ type: "text", text: "Invoice not found or access denied." }] };
        }

        // Handle cancellation
        if (input.cancel === true) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { state: "cancelled" },
          });
          return {
            content: [{ type: "text", text: `Invoice ${invoice.number} has been cancelled successfully.` }],
          };
        }

        const dataToUpdate: any = {};
        if (input.notes !== undefined) dataToUpdate.notes = input.notes.trim();
        if (input.due_date) {
          dataToUpdate.dueDate = new Date(`${input.due_date}T00:00:00+05:30`);
        }

        // If line items or pricing changed, recompute totals in paise (Rule #3)
        if (input.line_items || input.tax_percent !== undefined || input.discount !== undefined) {
          const itemsToProcess = input.line_items
            ? input.line_items.map((li) => ({
                description: li.description.trim(),
                quantity: li.quantity,
                unitPricePaise: rupeesToPaise(li.unit_price),
                totalPaise: li.quantity * rupeesToPaise(li.unit_price),
              }))
            : invoice.items;

          const taxPercent = input.tax_percent ?? (
            invoice.subtotalPaise - invoice.discountPaise > 0
              ? Math.round((invoice.taxPaise / (invoice.subtotalPaise - invoice.discountPaise)) * 100)
              : 0
          );
          const discountPaise = input.discount !== undefined
            ? rupeesToPaise(input.discount)
            : invoice.discountPaise;

          const { subtotalPaise, taxPaise, totalPaise } = computeInvoiceTotals(
            itemsToProcess,
            taxPercent,
            discountPaise
          );

          dataToUpdate.subtotalPaise = subtotalPaise;
          dataToUpdate.taxPaise = taxPaise;
          dataToUpdate.discountPaise = discountPaise;
          dataToUpdate.totalPaise = totalPaise;

          await prisma.$transaction(async (tx) => {
            if (input.line_items) {
              await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
              await tx.invoiceItem.createMany({
                data: itemsToProcess.map((li) => ({
                  invoiceId: invoice.id,
                  description: li.description,
                  quantity: li.quantity,
                  unitPricePaise: li.unitPricePaise,
                  totalPaise: li.totalPaise,
                })),
              });
            }
            await tx.invoice.update({
              where: { id: invoice.id },
              data: dataToUpdate,
            });
          });
        } else if (Object.keys(dataToUpdate).length > 0) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: dataToUpdate,
          });
        }

        const updated = await prisma.invoice.findUniqueOrThrow({
          where: { id: invoice.id },
          include: { payments: true },
        });

        const status = deriveInvoiceStatus({
          state: updated.state,
          viewedAt: updated.viewedAt,
          dueDate: updated.dueDate,
          totalPaise: updated.totalPaise,
          payments: updated.payments,
        });

        return {
          content: [{
            type: "text",
            text: [
              `✅ Invoice ${updated.number} updated successfully!`,
              `Total:      ${formatPaise(updated.totalPaise, updated.currency)}`,
              `Due Date:   ${updated.dueDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`,
              `Status:     ${status}`,
            ].join("\n"),
          }],
        };
      }
    );

    // -----------------------------------------------------------------------
    // 6. Tool: record_payment
    // -----------------------------------------------------------------------
    server.registerTool(
      "record_payment",
      {
        title: "Record Payment",
        description: `
Record a client payment against an invoice.
Amount must be in RUPEES (e.g. 10000 for ₹10,000).
Rejects payments that exceed the remaining balance.
Supports partial and multiple payments in an atomic database transaction.
Automatically labelled "Manually recorded" in accordance with financial audit rules.
        `.trim(),
        inputSchema: z.object({
          invoice_id: z.string().optional().describe("Invoice ID"),
          invoice_number: z.string().optional().describe("Invoice number (e.g. INV-0001)"),
          amount: z.number().positive().describe("Payment amount in RUPEES"),
          payment_date: z.string().optional().describe("Payment date YYYY-MM-DD (defaults to today IST)"),
          method: z.string().default("bank_transfer").describe("Payment method (bank_transfer, upi, card, cash, cheque)"),
          reference: z.string().optional().describe("Transaction reference, UTR, or check number"),
        }),
      },
      async (input, ctx) => {
        const userId = (ctx as any)?.http?.authInfo?.extra?.userId;
        if (!userId) {
          return { isError: true, content: [{ type: "text", text: "Unauthorized: Invalid or missing token." }] };
        }

        const invoice = await findUserInvoice(userId, input);
        if (!invoice) {
          return { isError: true, content: [{ type: "text", text: "Invoice not found or access denied." }] };
        }

        if (invoice.state === "cancelled") {
          return { isError: true, content: [{ type: "text", text: `Cannot record payment on cancelled invoice ${invoice.number}.` }] };
        }

        const paymentAmountPaise = rupeesToPaise(input.amount);
        const paymentDateStr = input.payment_date ?? todayIST();

        try {
          const result = await prisma.$transaction(async (tx) => {
            const current = await tx.invoice.findUniqueOrThrow({
              where: { id: invoice.id },
              include: { payments: true },
            });

            const currentPaidPaise = current.payments.reduce((s, p) => s + p.amountPaise, 0);
            const remainingBalancePaise = current.totalPaise - currentPaidPaise;

            if (paymentAmountPaise > remainingBalancePaise) {
              throw new Error(
                `Payment of ${formatPaise(paymentAmountPaise, invoice.currency)} exceeds remaining balance of ${formatPaise(remainingBalancePaise, invoice.currency)}.`
              );
            }

            const payment = await tx.payment.create({
              data: {
                invoiceId: invoice.id,
                amountPaise: paymentAmountPaise,
                paymentDate: new Date(`${paymentDateStr}T00:00:00+05:30`),
                method: input.method ?? "bank_transfer",
                reference: input.reference?.trim() ?? "",
                verification: "manual",
              },
            });

            // If invoice is fully settled, skip remaining pending reminders
            if (paymentAmountPaise >= remainingBalancePaise) {
              await tx.reminder.updateMany({
                where: { invoiceId: invoice.id, status: "pending" },
                data: { status: "skipped" },
              });
            }

            const newPaidPaise = currentPaidPaise + paymentAmountPaise;
            const newBalancePaise = Math.max(0, current.totalPaise - newPaidPaise);

            const newStatus = deriveInvoiceStatus({
              state: current.state,
              viewedAt: current.viewedAt,
              dueDate: current.dueDate,
              totalPaise: current.totalPaise,
              payments: [...current.payments, payment],
            });

            return { payment, newPaidPaise, newBalancePaise, newStatus };
          });

          return {
            content: [{
              type: "text",
              text: [
                `✅ Payment recorded successfully!`,
                `Invoice:       ${invoice.number}`,
                `Amount Paid:   ${formatPaise(paymentAmountPaise, invoice.currency)}`,
                `Method:        ${input.method} (${input.reference || "No Ref"})`,
                `Total Paid:    ${formatPaise(result.newPaidPaise, invoice.currency)}`,
                `Balance Due:   ${formatPaise(result.newBalancePaise, invoice.currency)}`,
                `New Status:    [${result.newStatus}]`,
                `Audit Label:   "Manually recorded"`,
              ].join("\n"),
            }],
          };
        } catch (err: any) {
          return { isError: true, content: [{ type: "text", text: err.message || "Failed to record payment." }] };
        }
      }
    );

    // -----------------------------------------------------------------------
    // 7. Tool: get_collection_summary
    // -----------------------------------------------------------------------
    server.registerTool(
      "get_collection_summary",
      {
        title: "Get Collection Summary",
        description: `
Generate an executive financial collections report for the user's business.
Calculates: total invoiced, total collected, outstanding balance, overdue amount,
breakdown by invoice status, and the overall collection rate percentage.
Optionally filter by issue date range with from_date and to_date.
        `.trim(),
        inputSchema: z.object({
          from_date: z.string().optional().describe("Filter invoices from date YYYY-MM-DD"),
          to_date: z.string().optional().describe("Filter invoices to date YYYY-MM-DD"),
        }),
      },
      async (input, ctx) => {
        const userId = (ctx as any)?.http?.authInfo?.extra?.userId;
        if (!userId) {
          return { isError: true, content: [{ type: "text", text: "Unauthorized: Invalid or missing token." }] };
        }

        const where: any = { userId };
        if (input.from_date || input.to_date) {
          where.invoiceDate = {};
          if (input.from_date) where.invoiceDate.gte = new Date(`${input.from_date}T00:00:00+05:30`);
          if (input.to_date) where.invoiceDate.lte = new Date(`${input.to_date}T23:59:59+05:30`);
        }

        const invoices = await prisma.invoice.findMany({
          where,
          include: { payments: true },
        });

        let totalInvoicedPaise = 0;
        let totalCollectedPaise = 0;
        let totalOverduePaise = 0;
        const statusCounts: Record<InvoiceStatus, number> = {
          paid: 0,
          partially_paid: 0,
          overdue: 0,
          sent: 0,
          viewed: 0,
          draft: 0,
          cancelled: 0,
        };

        for (const inv of invoices) {
          const status = deriveInvoiceStatus({
            state: inv.state,
            viewedAt: inv.viewedAt,
            dueDate: inv.dueDate,
            totalPaise: inv.totalPaise,
            payments: inv.payments,
          });
          statusCounts[status]++;

          if (inv.state !== "cancelled") {
            totalInvoicedPaise += inv.totalPaise;
            const paid = inv.payments.reduce((s, p) => s + p.amountPaise, 0);
            totalCollectedPaise += paid;

            if (status === "overdue") {
              totalOverduePaise += Math.max(0, inv.totalPaise - paid);
            }
          }
        }

        const totalOutstandingPaise = Math.max(0, totalInvoicedPaise - totalCollectedPaise);
        const collectionRate = totalInvoicedPaise > 0
          ? ((totalCollectedPaise / totalInvoicedPaise) * 100).toFixed(1)
          : "0.0";

        return {
          content: [{
            type: "text",
            text: [
              `📊 Collections Summary Report`,
              `────────────────────────────────────────`,
              `Total Invoiced:      ${formatPaise(totalInvoicedPaise)}`,
              `Total Collected:     ${formatPaise(totalCollectedPaise)}`,
              `Outstanding Balance: ${formatPaise(totalOutstandingPaise)}`,
              `Currently Overdue:   ${formatPaise(totalOverduePaise)}`,
              `Collection Rate:     ${collectionRate}%`,
              ``,
              `Invoice Status Counts:`,
              `• Paid:           ${statusCounts.paid}`,
              `• Partially Paid: ${statusCounts.partially_paid}`,
              `• Overdue:        ${statusCounts.overdue}`,
              `• Sent / Unopened:${statusCounts.sent}`,
              `• Viewed by client:${statusCounts.viewed}`,
              `• Drafts:         ${statusCounts.draft}`,
              `• Cancelled:      ${statusCounts.cancelled}`,
            ].join("\n"),
          }],
        };
      }
    );

    // -----------------------------------------------------------------------
    // 8. Tool: get_customer_history
    // -----------------------------------------------------------------------
    server.registerTool(
      "get_customer_history",
      {
        title: "Get Customer History",
        description: `
Retrieve the complete billing, payment, and collections track record for a specific customer.
Finds customer by customer_id OR customer_name.
Calculates: total invoiced, total paid, outstanding balance, list of all invoices,
number of late payments, and average days taken to pay invoices.
        `.trim(),
        inputSchema: z.object({
          customer_id: z.string().optional().describe("Customer ID"),
          customer_name: z.string().optional().describe("Customer contact or company name"),
        }),
      },
      async (input, ctx) => {
        const userId = (ctx as any)?.http?.authInfo?.extra?.userId;
        if (!userId) {
          return { isError: true, content: [{ type: "text", text: "Unauthorized: Invalid or missing token." }] };
        }

        let customer: any = null;
        if (input.customer_id) {
          customer = await prisma.customer.findFirst({
            where: { id: input.customer_id, userId },
            include: {
              invoices: {
                include: { payments: true },
                orderBy: { invoiceDate: "desc" },
              },
            },
          });
        } else if (input.customer_name) {
          const q = input.customer_name.trim();
          customer = await prisma.customer.findFirst({
            where: {
              userId,
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { companyName: { contains: q, mode: "insensitive" } },
              ],
            },
            include: {
              invoices: {
                include: { payments: true },
                orderBy: { invoiceDate: "desc" },
              },
            },
          });
        }

        if (!customer) {
          return { isError: true, content: [{ type: "text", text: "Customer not found." }] };
        }

        let totalInvoicedPaise = 0;
        let totalPaidPaise = 0;
        let latePaymentCount = 0;
        const daysToPayList: number[] = [];

        const invoiceLines: string[] = [];

        for (const inv of customer.invoices) {
          const status = deriveInvoiceStatus({
            state: inv.state,
            viewedAt: inv.viewedAt,
            dueDate: inv.dueDate,
            totalPaise: inv.totalPaise,
            payments: inv.payments,
          });

          if (inv.state !== "cancelled") {
            totalInvoicedPaise += inv.totalPaise;
            const invPaid = inv.payments.reduce((s: number, p: any) => s + p.amountPaise, 0);
            totalPaidPaise += invPaid;

            // Check late payments & days to pay
            for (const p of inv.payments) {
              if (p.paymentDate.getTime() > inv.dueDate.getTime()) {
                latePaymentCount++;
              }
              const days = Math.round(
                (p.paymentDate.getTime() - inv.invoiceDate.getTime()) / (1000 * 60 * 60 * 24)
              );
              if (days >= 0) daysToPayList.push(days);
            }
          }

          const dueDateStr = inv.dueDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
          invoiceLines.push(
            `• ${inv.number}: Total ${formatPaise(inv.totalPaise, inv.currency)} | Due: ${dueDateStr} | Status: [${status}]`
          );
        }

        const outstandingPaise = Math.max(0, totalInvoicedPaise - totalPaidPaise);
        const avgDaysToPay = daysToPayList.length > 0
          ? Math.round(daysToPayList.reduce((a, b) => a + b, 0) / daysToPayList.length)
          : null;

        return {
          content: [{
            type: "text",
            text: [
              `👤 Customer Profile: ${customer.name}${customer.companyName ? ` (${customer.companyName})` : ""}`,
              `Email: ${customer.email} | Phone: ${customer.phone || "N/A"}`,
              `────────────────────────────────────────`,
              `Total Invoiced:       ${formatPaise(totalInvoicedPaise)}`,
              `Total Paid:           ${formatPaise(totalPaidPaise)}`,
              `Outstanding Balance:  ${formatPaise(outstandingPaise)}`,
              `Average Days to Pay:  ${avgDaysToPay !== null ? `${avgDaysToPay} days` : "No completed payments yet"}`,
              `Late Payments Count:  ${latePaymentCount}`,
              ``,
              `Invoice History (${customer.invoices.length}):`,
              invoiceLines.length > 0 ? invoiceLines.join("\n") : "No invoices issued.",
            ].join("\n"),
          }],
        };
      }
    );

    // -----------------------------------------------------------------------
    // 9. Tool: schedule_reminder
    // -----------------------------------------------------------------------
    server.registerTool(
      "schedule_reminder",
      {
        title: "Schedule Reminder",
        description: `
Schedule an automated payment reminder to be sent on a future date.
Pass invoice_id OR invoice_number.
Reminder types: "due_soon", "due_today", "overdue_3d", "overdue_7d", "first_reminder", "final_notice".
Stores reminder in the database marked as Simulated (test mode).
        `.trim(),
        inputSchema: z.object({
          invoice_id: z.string().optional().describe("Invoice ID"),
          invoice_number: z.string().optional().describe("Invoice number (e.g. INV-0001)"),
          scheduled_date: z.string().describe("Date to send reminder YYYY-MM-DD"),
          type: z.string().default("overdue_3d").describe("Reminder type tag (e.g. due_soon, overdue_3d)"),
          subject: z.string().optional().describe("Optional email subject"),
          message: z.string().optional().describe("Optional custom reminder message"),
        }),
      },
      async (input, ctx) => {
        const userId = (ctx as any)?.http?.authInfo?.extra?.userId;
        if (!userId) {
          return { isError: true, content: [{ type: "text", text: "Unauthorized: Invalid or missing token." }] };
        }

        const invoice = await findUserInvoice(userId, input);
        if (!invoice) {
          return { isError: true, content: [{ type: "text", text: "Invoice not found or access denied." }] };
        }

        const scheduledAt = new Date(`${input.scheduled_date}T09:00:00+05:30`);

        // Upsert reminder on invoiceId + type
        const reminder = await prisma.reminder.upsert({
          where: {
            invoiceId_type: {
              invoiceId: invoice.id,
              type: input.type,
            },
          },
          create: {
            invoiceId: invoice.id,
            type: input.type,
            scheduledAt,
            status: "pending",
            subject: input.subject ?? `Friendly reminder: Invoice ${invoice.number} is due`,
            message: input.message ?? "",
            simulated: true, // Rule #7: simulated in test mode
          },
          update: {
            scheduledAt,
            status: "pending",
            subject: input.subject ?? `Friendly reminder: Invoice ${invoice.number} is due`,
            message: input.message ?? "",
          },
        });

        return {
          content: [{
            type: "text",
            text: [
              `⏰ Reminder scheduled!`,
              `Invoice:        ${invoice.number}`,
              `Customer:       ${invoice.customer.name}`,
              `Type:           ${reminder.type}`,
              `Scheduled Date: ${input.scheduled_date}`,
              `Status:         Pending`,
              `Execution Mode: Simulated (test mode)`,
            ].join("\n"),
          }],
        };
      }
    );

    // -----------------------------------------------------------------------
    // 10. Tool: send_payment_reminder
    // -----------------------------------------------------------------------
    server.registerTool(
      "send_payment_reminder",
      {
        title: "Send Payment Reminder",
        description: `
Dispatch an immediate payment reminder to the client for an invoice.
Pass invoice_id OR invoice_number.
Skips invoices that are already Paid or Cancelled.
Uses custom_subject / custom_message (max 1000 chars) if provided; otherwise formats a professional template.
Always returns clearly whether the notification was actually sent or simulated (test mode).
        `.trim(),
        inputSchema: z.object({
          invoice_id: z.string().optional().describe("Invoice ID"),
          invoice_number: z.string().optional().describe("Invoice number (e.g. INV-0001)"),
          custom_subject: z.string().optional().describe("Custom email subject line"),
          custom_message: z.string().max(1000).optional().describe("Custom message body (max 1000 chars)"),
        }),
      },
      async (input, ctx) => {
        const userId = (ctx as any)?.http?.authInfo?.extra?.userId;
        if (!userId) {
          return { isError: true, content: [{ type: "text", text: "Unauthorized: Invalid or missing token." }] };
        }

        const invoice = await findUserInvoice(userId, input);
        if (!invoice) {
          return { isError: true, content: [{ type: "text", text: "Invoice not found or access denied." }] };
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { businessSettings: true },
        });

        const status = deriveInvoiceStatus({
          state: invoice.state,
          viewedAt: invoice.viewedAt,
          dueDate: invoice.dueDate,
          totalPaise: invoice.totalPaise,
          payments: invoice.payments,
        });

        // Skip paid or cancelled invoices
        if (status === "paid" || status === "cancelled") {
          return {
            content: [{
              type: "text",
              text: `Skipped sending reminder: Invoice ${invoice.number} is already marked as [${status}].`,
            }],
          };
        }

        const paidPaise = invoice.payments.reduce((s, p) => s + p.amountPaise, 0);
        const balancePaise = Math.max(0, invoice.totalPaise - paidPaise);
        const dueDateStr = invoice.dueDate.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        const hostedUrl = `${getBaseUrl()}/i/${invoice.publicToken}`;
        const businessName = user?.businessSettings?.businessName || user?.businessName || user?.name || "Settlewise";

        const subject = input.custom_subject || `Reminder: Invoice ${invoice.number} from ${businessName}`;
        const message = input.custom_message
          ? input.custom_message.slice(0, 1000)
          : [
              `Dear ${invoice.customer.name},`,
              ``,
              `This is a friendly reminder that invoice ${invoice.number} for ${formatPaise(invoice.totalPaise, invoice.currency)} was due on ${dueDateStr}.`,
              `The current remaining balance is ${formatPaise(balancePaise, invoice.currency)}.`,
              ``,
              `You can review the invoice and complete payment at:`,
              `${hostedUrl}`,
              ``,
              `Thank you for your prompt attention.`,
              `Best regards,`,
              `${businessName}`,
            ].join("\n");

        // Record reminder log in database
        const reminderType = status === "overdue" ? "overdue_reminder" : "payment_reminder";
        await prisma.reminder.upsert({
          where: {
            invoiceId_type: {
              invoiceId: invoice.id,
              type: reminderType,
            },
          },
          create: {
            invoiceId: invoice.id,
            type: reminderType,
            scheduledAt: new Date(),
            status: "sent",
            sentAt: new Date(),
            subject,
            message,
            simulated: true, // Rule #7: simulated in test mode
          },
          update: {
            status: "sent",
            sentAt: new Date(),
            subject,
            message,
          },
        });

        return {
          content: [{
            type: "text",
            text: [
              `📧 Payment reminder simulated successfully!`,
              `────────────────────────────────────────`,
              `Invoice:        ${invoice.number}`,
              `Recipient:      ${invoice.customer.name} <${invoice.customer.email}>`,
              `Subject:        ${subject}`,
              `Outstanding:    ${formatPaise(balancePaise, invoice.currency)}`,
              `Delivery Mode:  Simulated (test mode)`,
              ``,
              `Preview Message:`,
              `----------------------------------------`,
              message,
              `----------------------------------------`,
            ].join("\n"),
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
// HTTP Auth & Request Pipeline (No OAuth — simple token auth per Rule 4)
// ---------------------------------------------------------------------------
async function handleMcpRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Allow token from query param (?key=...) OR Bearer header
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const key = url.searchParams.get("key") || bearerToken;

  if (!key) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized: Missing authentication key (?key=TOKEN or Bearer token)",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  const user = await prisma.user.findUnique({
    where: { mcpToken: key },
    select: { id: true, email: true },
  });

  if (!user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized: Invalid authentication key",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // Attach auth context so MCP tool callbacks can read ctx.http.authInfo.extra.userId
  const authInfo: AuthInfo = {
    token: key,
    clientId: user.id,
    scopes: [],
    extra: { userId: user.id },
  };
  (req as any).auth = authInfo;

  try {
    const res = await mcpHandler(req);
    const headers = new Headers(res.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, x-mcp-version, mcp-session-id"
    );
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (error) {
    console.error("MCP handler error:", error);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Accept, x-mcp-version, mcp-session-id",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export { handleMcpRequest as GET, handleMcpRequest as POST };
