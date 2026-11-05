import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { deriveInvoiceStatus, STATUS_META } from "@/lib/invoice-status";
import { formatPaise } from "@/lib/money";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import crypto from "crypto";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Rule 2: Fetch invoice with related data, excluding internal secrets
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: {
      customer: {
        select: {
          name: true,
          companyName: true,
          email: true,
          phone: true,
          billingAddress: true,
        },
      },
      items: {
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPricePaise: true,
          totalPaise: true,
        },
      },
      payments: {
        select: {
          id: true,
          amountPaise: true,
          paymentDate: true,
          method: true,
          reference: true,
        },
        orderBy: { paymentDate: "asc" },
      },
      user: {
        select: {
          name: true,
          businessName: true,
          businessSettings: {
            select: {
              businessName: true,
              businessEmail: true,
              address: true,
              taxInfo: true,
              paymentInstructions: true,
            },
          },
        },
      },
    },
  });

  // Rule 2: Return 404 for drafts and unknown tokens
  if (!invoice || invoice.state === "draft") {
    notFound();
  }

  // View tracking: Ignore owner's own views if logged in
  const session = await auth();
  const isOwner = session?.user?.email && session.user.name && invoice.user.name === session.user.name;

  if (!isOwner) {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") ?? headersList.get("x-real-ip") ?? "unknown";
    const ua = headersList.get("user-agent") ?? "";
    const visitorHash = crypto
      .createHash("sha256")
      .update(`${ip}:${ua}`)
      .digest("hex")
      .slice(0, 16);

    // Track view asynchronously
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
  }

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

  const businessSettings = invoice.user.businessSettings;
  const businessName =
    businessSettings?.businessName || invoice.user.businessName || invoice.user.name;
  const businessEmail = businessSettings?.businessEmail;
  const businessAddress = businessSettings?.address;
  const taxInfo = businessSettings?.taxInfo;
  const paymentInstructions = businessSettings?.paymentInstructions;

  return (
    <div className="min-h-screen bg-gray-50/70 py-8 px-4 sm:px-6 print:bg-white print:py-0 print:px-0">
      <div className="max-w-3xl mx-auto space-y-6 print:max-w-none print:space-y-4">
        {/* Top Action Bar (hidden when printing) */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Hosted Invoice
            </span>
          </div>
          <PrintButton />
        </div>

        {/* Invoice Container */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-8 sm:p-10 print:border-none print:shadow-none print:p-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between pb-8 border-b border-gray-100 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                {businessName}
              </h1>
              {businessEmail && (
                <p className="text-xs text-gray-500 mt-1">{businessEmail}</p>
              )}
              {businessAddress && (
                <p className="text-xs text-gray-500 whitespace-pre-line mt-0.5 max-w-sm">
                  {businessAddress}
                </p>
              )}
              {taxInfo && (
                <p className="text-xs text-gray-500 font-mono mt-1">
                  GSTIN / PAN: <span className="font-semibold text-gray-700">{taxInfo}</span>
                </p>
              )}
            </div>

            <div className="sm:text-right">
              <div className="flex sm:justify-end items-center gap-2.5 mb-1">
                <span className="text-xl font-bold font-mono text-gray-900">
                  {invoice.number}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}
                >
                  {meta.label}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Issued on{" "}
                {invoice.invoiceDate.toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Bill To & Due Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-gray-100 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Billed To
              </p>
              <p className="font-bold text-gray-900">{invoice.customer.name}</p>
              {invoice.customer.companyName && (
                <p className="text-gray-600 font-medium">{invoice.customer.companyName}</p>
              )}
              <p className="text-gray-500 text-xs mt-0.5">{invoice.customer.email}</p>
              {invoice.customer.phone && (
                <p className="text-gray-500 text-xs">{invoice.customer.phone}</p>
              )}
              {invoice.customer.billingAddress && (
                <p className="text-gray-600 text-xs whitespace-pre-line mt-1.5 leading-relaxed">
                  {invoice.customer.billingAddress}
                </p>
              )}
            </div>

            <div className="sm:text-right space-y-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Due Date
                </p>
                <p
                  className={`text-base font-bold ${
                    status === "overdue" ? "text-red-600" : "text-gray-900"
                  }`}
                >
                  {invoice.dueDate.toLocaleDateString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>

              {balancePaise > 0 ? (
                <div className="inline-block sm:text-right bg-indigo-50/80 border border-indigo-100 rounded-xl px-4 py-2.5 mt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 block">
                    Amount Due
                  </span>
                  <span className="text-2xl font-bold font-mono text-indigo-950">
                    {formatPaise(balancePaise, invoice.currency)}
                  </span>
                </div>
              ) : (
                <div className="inline-block sm:text-right bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 mt-2">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                    ✓ Paid in Full
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Line items table */}
          <div className="py-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="pb-3">Description</th>
                  <th className="pb-3 w-16 text-center">Qty</th>
                  <th className="pb-3 w-28 text-right">Unit Price</th>
                  <th className="pb-3 w-28 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoice.items.map((item) => (
                  <tr key={item.id} className="text-sm">
                    <td className="py-3 text-gray-800 font-medium">{item.description}</td>
                    <td className="py-3 text-gray-600 text-center">{item.quantity}</td>
                    <td className="py-3 text-gray-600 text-right font-mono">
                      {formatPaise(item.unitPricePaise, invoice.currency)}
                    </td>
                    <td className="py-3 text-gray-900 text-right font-semibold font-mono">
                      {formatPaise(item.totalPaise, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Financial Breakdown */}
            <div className="pt-4 border-t border-gray-200 flex flex-col items-end space-y-1.5 text-sm">
              <div className="flex justify-between w-64 text-gray-600">
                <span>Subtotal</span>
                <span className="font-mono">{formatPaise(invoice.subtotalPaise, invoice.currency)}</span>
              </div>
              {invoice.discountPaise > 0 && (
                <div className="flex justify-between w-64 text-emerald-700">
                  <span>Discount</span>
                  <span className="font-mono">−{formatPaise(invoice.discountPaise, invoice.currency)}</span>
                </div>
              )}
              {invoice.taxPaise > 0 && (
                <div className="flex justify-between w-64 text-gray-600">
                  <span>Tax (GST)</span>
                  <span className="font-mono">{formatPaise(invoice.taxPaise, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between w-64 text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>Total</span>
                <span className="font-mono text-indigo-700">{formatPaise(invoice.totalPaise, invoice.currency)}</span>
              </div>
              {paidPaise > 0 && (
                <div className="flex justify-between w-64 text-sm font-semibold text-emerald-700 pt-1">
                  <span>Amount Paid</span>
                  <span className="font-mono">−{formatPaise(paidPaise, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between w-64 text-base font-bold text-gray-900 pt-2 border-t-2 border-gray-900">
                <span>Balance Due</span>
                <span className="font-mono">{formatPaise(balancePaise, invoice.currency)}</span>
              </div>
            </div>
          </div>

          {/* Payment Instructions / Bank Details */}
          {paymentInstructions && (
            <div className="mt-4 pt-6 border-t border-gray-100">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Payment Instructions / How to Settle
              </h2>
              <div className="bg-gray-50/70 border border-gray-200/80 rounded-xl p-4 font-mono text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                {paymentInstructions}
              </div>
            </div>
          )}

          {/* Payments Received Audit Log */}
          {invoice.payments.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Payments Received
              </h2>
              <div className="space-y-2">
                {invoice.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-gray-50 border border-gray-100 text-gray-700"
                  >
                    <div>
                      <span className="font-medium text-gray-900">
                        {p.paymentDate.toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {p.method && (
                        <span className="ml-2 capitalize text-gray-500">
                          via {p.method.replace("_", " ")}
                        </span>
                      )}
                      {p.reference && (
                        <span className="ml-2 font-mono text-gray-400">
                          (Ref: {p.reference})
                        </span>
                      )}
                      <span className="ml-2 italic text-gray-400">Manually recorded</span>
                    </div>
                    <span className="font-mono font-semibold text-emerald-700">
                      +{formatPaise(p.amountPaise, invoice.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Notes
              </h2>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Footer branding */}
          <div className="mt-8 pt-6 border-t border-gray-100 text-center text-xs text-gray-400 print:hidden">
            Powered by Settlewise — Simple, collections-focused invoicing
          </div>
        </div>
      </div>
    </div>
  );
}
