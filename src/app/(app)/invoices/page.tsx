import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus } from "@/lib/invoice-status";
import { redirect } from "next/navigation";
import InvoicesTable, { InvoiceRow } from "@/components/InvoicesTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices — Settlewise" };

export default async function InvoicesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Rule 4: Scoped by userId
  const invoices = await prisma.invoice.findMany({
    where: { userId: session.user.id },
    include: {
      customer: { select: { id: true, name: true, companyName: true } },
      payments: { select: { amountPaise: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const invoiceRows: InvoiceRow[] = invoices.map((inv) => {
    const status = deriveInvoiceStatus({
      state: inv.state,
      viewedAt: inv.viewedAt,
      dueDate: inv.dueDate,
      totalPaise: inv.totalPaise,
      payments: inv.payments,
    });

    const paidPaise = inv.payments.reduce((s, p) => s + p.amountPaise, 0);

    return {
      id: inv.id,
      number: inv.number,
      customerName: inv.customer.name,
      customerCompany: inv.customer.companyName,
      customerId: inv.customer.id,
      dueDate: inv.dueDate.toISOString(),
      dueDateFormatted: inv.dueDate.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      invoiceDate: inv.invoiceDate.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      totalPaise: inv.totalPaise,
      paidPaise,
      currency: inv.currency,
      status,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track receivables, record client payments, and monitor overdue accounts.
          </p>
        </div>
      </div>

      {invoiceRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">No invoices yet</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1">
            Ask Claude to generate your first invoice via the MCP endpoint, or visit Settings to copy your MCP URL.
          </p>
        </div>
      ) : (
        <InvoicesTable invoices={invoiceRows} />
      )}
    </div>
  );
}
