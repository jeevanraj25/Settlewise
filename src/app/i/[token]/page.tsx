import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus, STATUS_META } from "@/lib/invoice-status";
import { formatPaise } from "@/lib/money";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: {
      customer: true,
      items: true,
      payments: { orderBy: { paymentDate: "asc" } },
      user: {
        include: { businessSettings: true },
      },
    },
  });

  if (!invoice) notFound();

  // --- Track view ---
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? headersList.get("x-real-ip") ?? "unknown";
  const ua = headersList.get("user-agent") ?? "";
  const visitorHash = crypto
    .createHash("sha256")
    .update(`${ip}:${ua}`)
    .digest("hex")
    .slice(0, 16);

  // Fire-and-forget view tracking (don't block render)
  prisma.invoiceView
    .create({ data: { invoiceId: invoice.id, visitorHash } })
    .then(() =>
      prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          viewCount: { increment: 1 },
          viewedAt: invoice.viewedAt ?? new Date(),
        },
      })
    )
    .catch(() => {});

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

  const businessName =
    invoice.user.businessSettings?.businessName || invoice.user.businessName || invoice.user.name;
  const paymentInstructions = invoice.user.businessSettings?.paymentInstructions ?? "";

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-4">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{businessName}</h1>
              <p className="text-sm text-gray-500 mt-1">Invoice {invoice.number}</p>
            </div>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${meta.color}`}>
              {meta.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <p className="font-semibold text-gray-400 uppercase text-xs mb-1">From</p>
              <p className="text-gray-900">{businessName}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-400 uppercase text-xs mb-1">Bill To</p>
              <p className="text-gray-900">{invoice.customer.name}</p>
              {invoice.customer.companyName && (
                <p className="text-gray-600">{invoice.customer.companyName}</p>
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-400 uppercase text-xs mb-1">Invoice Date</p>
              <p className="text-gray-900">
                {invoice.invoiceDate.toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "numeric", month: "long", year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-400 uppercase text-xs mb-1">Due Date</p>
              <p className={`font-medium ${status === "overdue" ? "text-red-600" : "text-gray-900"}`}>
                {invoice.dueDate.toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "numeric", month: "long", year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Description", "Qty", "Rate", "Amount"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
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
                  <td className="px-4 py-3 text-sm text-gray-700">{formatPaise(item.unitPricePaise, invoice.currency)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatPaise(item.totalPaise, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-gray-200 px-4 py-4 space-y-1.5">
            <Row label="Subtotal" value={formatPaise(invoice.subtotalPaise, invoice.currency)} />
            {invoice.discountPaise > 0 && (
              <Row label="Discount" value={`−${formatPaise(invoice.discountPaise, invoice.currency)}`} />
            )}
            {invoice.taxPaise > 0 && (
              <Row label="Tax" value={formatPaise(invoice.taxPaise, invoice.currency)} />
            )}
            <div className="flex justify-between pt-2 border-t border-gray-200 text-base font-bold text-gray-900">
              <span>Total</span>
              <span>{formatPaise(invoice.totalPaise, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {/* Amount due */}
        {balancePaise > 0 && (
          <div className="bg-indigo-600 text-white rounded-xl p-6 mb-4 flex justify-between items-center">
            <div>
              <p className="text-sm text-indigo-200">Amount Due</p>
              <p className="text-3xl font-bold">{formatPaise(balancePaise, invoice.currency)}</p>
            </div>
          </div>
        )}

        {/* Payment instructions */}
        {paymentInstructions && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <h2 className="text-xs font-semibold uppercase text-gray-400 mb-2">How to Pay</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{paymentInstructions}</p>
          </div>
        )}

        {/* Payments recorded */}
        {invoice.payments.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <h2 className="text-xs font-semibold uppercase text-gray-400 mb-3">Payments Received</h2>
            <div className="space-y-2">
              {invoice.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {p.paymentDate.toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric", month: "short", year: "numeric",
                    })}
                    {p.method && <span className="ml-2 text-gray-400 capitalize">{p.method.replace("_", " ")}</span>}
                    {/* Rule #7: label manually recorded payments */}
                    <span className="ml-2 text-xs text-gray-400 italic">Manually recorded</span>
                  </span>
                  <span className="font-medium text-green-700">{formatPaise(p.amountPaise, invoice.currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xs font-semibold uppercase text-gray-400 mb-2">Notes</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">Powered by Settlewise</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-gray-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
