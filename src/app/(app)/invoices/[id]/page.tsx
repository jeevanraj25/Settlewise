import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus, STATUS_META } from "@/lib/invoice-status";
import { formatPaise } from "@/lib/money";
import { getBaseUrl } from "@/lib/utils";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Rule #4: always scope by userId
  const invoice = await prisma.invoice.findFirst({
    where: { id, userId: session.user.id },
    include: {
      customer: true,
      items: true,
      payments: { orderBy: { paymentDate: "asc" } },
    },
  });

  if (!invoice) notFound();

  const status = deriveInvoiceStatus({
    state: invoice.state,
    viewedAt: invoice.viewedAt,
    dueDate: invoice.dueDate,
    totalPaise: invoice.totalPaise,
    payments: invoice.payments,
  });
  const meta = STATUS_META[status];
  const paidPaise = invoice.payments.reduce((s, p) => s + p.amountPaise, 0);
  const balancePaise = invoice.totalPaise - paidPaise;

  const appUrl = getBaseUrl();
  const publicUrl = `${appUrl}/i/${invoice.publicToken}`;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back */}
      <Link href="/invoices" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ← Back to invoices
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{invoice.number}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Issued:{" "}
              {invoice.invoiceDate.toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${meta.color}`}>
            {meta.label}
          </span>
        </div>

        {/* Customer */}
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Bill To</p>
          <p className="font-medium text-gray-900">{invoice.customer.name}</p>
          {invoice.customer.companyName && (
            <p className="text-sm text-gray-600">{invoice.customer.companyName}</p>
          )}
          <p className="text-sm text-gray-600">{invoice.customer.email}</p>
        </div>

        {/* Due date */}
        <div className="flex items-center gap-6 text-sm text-gray-600 mb-4">
          <div>
            <span className="font-medium">Due:</span>{" "}
            {invoice.dueDate.toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
          <div>
            <span className="font-medium">Views:</span> {invoice.viewCount}
          </div>
        </div>

        {/* Public link */}
        <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600 font-mono break-all">
          {publicUrl}
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {["Description", "Qty", "Unit Price", "Total"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-sm text-gray-700">{item.description}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.quantity}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {formatPaise(item.unitPricePaise, invoice.currency)}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {formatPaise(item.totalPaise, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="border-t border-gray-200 px-4 py-3 space-y-1">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>{formatPaise(invoice.subtotalPaise, invoice.currency)}</span>
          </div>
          {invoice.discountPaise > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Discount</span>
              <span>−{formatPaise(invoice.discountPaise, invoice.currency)}</span>
            </div>
          )}
          {invoice.taxPaise > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tax</span>
              <span>{formatPaise(invoice.taxPaise, invoice.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
            <span>Total</span>
            <span>{formatPaise(invoice.totalPaise, invoice.currency)}</span>
          </div>
        </div>
      </div>

      {/* Payments */}
      {invoice.payments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <h2 className="text-sm font-semibold uppercase text-gray-400 mb-3">Payments</h2>
          <div className="space-y-2">
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-700">
                    {p.paymentDate.toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  {p.method && (
                    <span className="ml-2 text-gray-500 capitalize">{p.method.replace("_", " ")}</span>
                  )}
                  {/* Rule #7: always label manually recorded payments */}
                  <span className="ml-2 text-xs text-gray-400 italic">Manually recorded</span>
                </div>
                <span className="font-medium text-green-700">
                  {formatPaise(p.amountPaise, invoice.currency)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-sm font-medium">
            <span>Balance due</span>
            <span className={balancePaise <= 0 ? "text-green-700" : "text-gray-900"}>
              {formatPaise(Math.max(0, balancePaise), invoice.currency)}
            </span>
          </div>
        </div>
      )}

      {/* Notes */}
      {invoice.notes && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold uppercase text-gray-400 mb-2">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}
    </div>
  );
}
