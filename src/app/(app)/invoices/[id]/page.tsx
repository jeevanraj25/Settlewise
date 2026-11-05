import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus, STATUS_META } from "@/lib/invoice-status";
import { formatPaise } from "@/lib/money";
import { getBaseUrl } from "@/lib/utils";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import RecordPaymentModal from "@/components/RecordPaymentModal";
import InvoiceActions from "@/components/InvoiceActions";

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
      user: { include: { businessSettings: true } },
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
  const balancePaise = Math.max(0, invoice.totalPaise - paidPaise);

  const appUrl = getBaseUrl();
  const publicUrl = `${appUrl}/i/${invoice.publicToken}`;
  const paymentInstructions = invoice.user.businessSettings?.paymentInstructions;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link href="/invoices" className="text-sm font-medium text-indigo-600 hover:underline">
          ← Back to invoices
        </Link>
        <div className="flex items-center gap-2">
          {balancePaise > 0 && invoice.state !== "cancelled" && (
            <RecordPaymentModal
              invoiceId={invoice.id}
              invoiceNumber={invoice.number}
              currency={invoice.currency}
              balancePaise={balancePaise}
            />
          )}
          <InvoiceActions
            invoiceId={invoice.id}
            invoiceNumber={invoice.number}
            state={invoice.state}
          />
        </div>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{invoice.number}</h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}>
                {meta.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Issued:{" "}
              {invoice.invoiceDate.toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs uppercase tracking-wide text-gray-400 block font-semibold">
              Total Amount
            </span>
            <span className="text-2xl font-bold text-gray-900 font-mono">
              {formatPaise(invoice.totalPaise, invoice.currency)}
            </span>
          </div>
        </div>

        {/* Customer & Due Date Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-t border-b border-gray-100 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Bill To</p>
            <Link
              href={`/customers/${invoice.customerId}`}
              className="font-medium text-gray-900 hover:text-indigo-600 hover:underline"
            >
              {invoice.customer.name}
            </Link>
            {invoice.customer.companyName && (
              <p className="text-sm text-gray-600">{invoice.customer.companyName}</p>
            )}
            <p className="text-sm text-gray-600">{invoice.customer.email}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Payment Schedule</p>
            <div className="text-sm text-gray-700 space-y-1">
              <div>
                <span className="text-gray-400">Due Date:</span>{" "}
                <span className={status === "overdue" ? "text-red-600 font-semibold" : "font-medium text-gray-900"}>
                  {invoice.dueDate.toLocaleDateString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Client Views: <span className="font-semibold text-gray-800">{invoice.viewCount}</span>
                {invoice.viewedAt && (
                  <span className="text-gray-400 ml-1">
                    (first viewed{" "}
                    {invoice.viewedAt.toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric",
                      month: "short",
                    })}
                    )
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Public link banner */}
        <div className="mt-4 flex items-center justify-between bg-gray-50/80 rounded-lg border border-gray-200 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-gray-400 shrink-0 font-medium">Public link:</span>
            <span className="font-mono text-gray-700 truncate">{publicUrl}</span>
          </div>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-indigo-600 hover:text-indigo-800 font-medium ml-3 hover:underline"
          >
            Open ↗
          </a>
        </div>
      </div>

      {/* Line items card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50/70">
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
                <td className="px-4 py-3 text-sm font-medium text-gray-900 font-mono">
                  {formatPaise(item.totalPaise, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals computation */}
        <div className="border-t border-gray-200 px-6 py-4 space-y-1.5 bg-gray-50/30">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span className="font-mono">{formatPaise(invoice.subtotalPaise, invoice.currency)}</span>
          </div>
          {invoice.discountPaise > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Discount</span>
              <span className="font-mono">−{formatPaise(invoice.discountPaise, invoice.currency)}</span>
            </div>
          )}
          {invoice.taxPaise > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tax (GST)</span>
              <span className="font-mono">{formatPaise(invoice.taxPaise, invoice.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
            <span>Total</span>
            <span className="font-mono text-indigo-700">{formatPaise(invoice.totalPaise, invoice.currency)}</span>
          </div>
        </div>
      </div>

      {/* Payments Card (Rule #3, Rule #7) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">Payments & Balance</h2>
            <span className="text-xs text-gray-400">({invoice.payments.length} recorded)</span>
          </div>
          {balancePaise > 0 && invoice.state !== "cancelled" && (
            <RecordPaymentModal
              invoiceId={invoice.id}
              invoiceNumber={invoice.number}
              currency={invoice.currency}
              balancePaise={balancePaise}
            />
          )}
        </div>

        {invoice.payments.length === 0 ? (
          <p className="text-sm text-gray-500 py-3 text-center bg-gray-50 rounded-lg">
            No payments received yet. Outstanding balance is {formatPaise(balancePaise, invoice.currency)}.
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {invoice.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100 text-sm"
              >
                <div>
                  <span className="font-medium text-gray-800">
                    {p.paymentDate.toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  {p.method && (
                    <span className="ml-2 text-xs text-gray-500 capitalize px-2 py-0.5 rounded bg-white border border-gray-200">
                      {p.method.replace("_", " ")}
                    </span>
                  )}
                  {p.reference && (
                    <span className="ml-2 text-xs text-gray-500 font-mono">
                      Ref: {p.reference}
                    </span>
                  )}
                  {/* Rule #7: Honest labelling */}
                  <span className="ml-2 text-xs text-gray-400 italic">
                    Manually recorded
                  </span>
                </div>
                <span className="font-mono font-semibold text-emerald-700">
                  +{formatPaise(p.amountPaise, invoice.currency)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Balance summary */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
          <div>
            <span className="text-gray-500">Total Paid: </span>
            <span className="font-semibold text-emerald-700 font-mono">
              {formatPaise(paidPaise, invoice.currency)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Remaining Balance: </span>
            <span className={`font-bold font-mono text-base ${balancePaise === 0 ? "text-emerald-700" : "text-gray-900"}`}>
              {formatPaise(balancePaise, invoice.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Notes and Payment Instructions */}
      {(invoice.notes || paymentInstructions) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {invoice.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
              <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">Notes</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
          {paymentInstructions && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
              <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">How to Pay</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{paymentInstructions}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
