import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus, STATUS_META } from "@/lib/invoice-status";
import { formatPaise } from "@/lib/money";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices — Collectly" };

export default async function InvoicesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const invoices = await prisma.invoice.findMany({
    where: { userId: session.user.id },
    include: {
      customer: { select: { name: true, companyName: true } },
      payments: { select: { amountPaise: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg font-medium">No invoices yet</p>
          <p className="text-sm mt-1">Ask Claude to create your first invoice using the MCP URL in Settings.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Invoice #", "Customer", "Due Date", "Total", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => {
                const status = deriveInvoiceStatus({
                  state: inv.state,
                  viewedAt: inv.viewedAt,
                  dueDate: inv.dueDate,
                  totalPaise: inv.totalPaise,
                  payments: inv.payments,
                });
                const meta = STATUS_META[status];
                const customerName =
                  inv.customer.companyName || inv.customer.name;

                return (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-mono text-sm text-indigo-600 hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {customerName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {inv.dueDate.toLocaleDateString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {formatPaise(inv.totalPaise, inv.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
