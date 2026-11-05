import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPaise } from "@/lib/money";
import { deriveInvoiceStatus, STATUS_META } from "@/lib/invoice-status";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import CustomerModal from "@/components/CustomerModal";
import DeleteCustomerButton from "@/components/DeleteCustomerButton";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Rule 4: Scoped by userId
  const customer = await prisma.customer.findFirst({
    where: { id, userId },
    include: {
      invoices: {
        include: {
          payments: { orderBy: { paymentDate: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) notFound();

  // Compute metrics in integer paise (Rule 3)
  let totalInvoicedPaise = 0;
  let totalPaidPaise = 0;
  const allPayments: Array<{
    id: string;
    invoiceNumber: string;
    invoiceId: string;
    amountPaise: number;
    paymentDate: Date;
    method: string;
    reference: string;
  }> = [];

  for (const inv of customer.invoices) {
    totalInvoicedPaise += inv.totalPaise;
    for (const p of inv.payments) {
      totalPaidPaise += p.amountPaise;
      allPayments.push({
        id: p.id,
        invoiceNumber: inv.number,
        invoiceId: inv.id,
        amountPaise: p.amountPaise,
        paymentDate: p.paymentDate,
        method: p.method,
        reference: p.reference,
      });
    }
  }

  // Sort payment history descending
  allPayments.sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
  const outstandingPaise = Math.max(0, totalInvoicedPaise - totalPaidPaise);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          ← Back to customers
        </Link>
      </div>

      {/* Header & Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            {customer.companyName && (
              <span className="text-sm px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                {customer.companyName}
              </span>
            )}
          </div>
          <div className="mt-2 text-sm text-gray-600 space-y-1">
            <div>
              <span className="text-gray-400">Email:</span> {customer.email}
            </div>
            {customer.phone && (
              <div>
                <span className="text-gray-400">Phone:</span> {customer.phone}
              </div>
            )}
            {customer.billingAddress && (
              <div>
                <span className="text-gray-400">Billing Address:</span>{" "}
                <span className="whitespace-pre-line">{customer.billingAddress}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <CustomerModal
            customer={{
              id: customer.id,
              name: customer.name,
              companyName: customer.companyName,
              email: customer.email,
              phone: customer.phone,
              billingAddress: customer.billingAddress,
            }}
            triggerLabel="Edit Details"
            triggerClassName="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 border border-gray-300 transition-colors"
          />
          <DeleteCustomerButton
            customerId={customer.id}
            customerName={customer.name}
            invoiceCount={customer.invoices.length}
            redirectOnSuccess={true}
          />
        </div>
      </div>

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total Invoiced
          </span>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatPaise(totalInvoicedPaise)}
          </p>
          <span className="text-xs text-gray-400 mt-0.5 block">
            Across {customer.invoices.length} invoice(s)
          </span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total Paid
          </span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {formatPaise(totalPaidPaise)}
          </p>
          <span className="text-xs text-gray-400 mt-0.5 block">
            {allPayments.length} payment transaction(s)
          </span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Outstanding Balance
          </span>
          <p className={`text-2xl font-bold mt-1 ${outstandingPaise > 0 ? "text-amber-600" : "text-gray-900"}`}>
            {formatPaise(outstandingPaise)}
          </p>
          <span className="text-xs text-gray-400 mt-0.5 block">
            {outstandingPaise === 0 ? "All invoices settled" : "Due from customer"}
          </span>
        </div>
      </div>

      {/* Invoices Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Invoices</h2>
          <span className="text-xs text-gray-500">{customer.invoices.length} total</span>
        </div>

        {customer.invoices.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No invoices issued to this customer yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Issued
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Due Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Total
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customer.invoices.map((inv) => {
                  const status = deriveInvoiceStatus({
                    state: inv.state,
                    viewedAt: inv.viewedAt,
                    dueDate: inv.dueDate,
                    totalPaise: inv.totalPaise,
                    payments: inv.payments,
                  });
                  const meta = STATUS_META[status];

                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/70">
                      <td className="px-4 py-3 font-mono">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="text-indigo-600 font-semibold hover:underline"
                        >
                          {inv.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {inv.invoiceDate.toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {inv.dueDate.toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
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

      {/* Payment History Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Payment History</h2>
          <span className="text-xs text-gray-500">{allPayments.length} recorded</span>
        </div>

        {allPayments.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No payments recorded yet for this customer.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Invoice
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Method & Reference
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Verification
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 text-gray-600">
                      {p.paymentDate.toLocaleDateString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <Link
                        href={`/invoices/${p.invoiceId}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {p.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="capitalize">{p.method ? p.method.replace("_", " ") : "Direct"}</span>
                      {p.reference && (
                        <span className="text-xs text-gray-400 font-mono ml-2">
                          (Ref: {p.reference})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/* Rule 7: Honesty label */}
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        Manually recorded
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">
                      {formatPaise(p.amountPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
