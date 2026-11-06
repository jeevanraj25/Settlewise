import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPaise } from "@/lib/money";
import { deriveInvoiceStatus, STATUS_META, todayIST } from "@/lib/invoice-status";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview — Settlewise" };

export default async function OverviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [invoices, recentPayments, userSettings] = await Promise.all([
    prisma.invoice.findMany({
      where: { userId },
      include: {
        customer: { select: { id: true, name: true, companyName: true, email: true } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { invoice: { userId } },
      include: {
        invoice: {
          include: { customer: { select: { name: true, companyName: true } } },
        },
      },
      orderBy: { paymentDate: "desc" },
      take: 5,
    }),
    prisma.businessSettings.findUnique({
      where: { userId },
      select: { defaultCurrency: true, businessName: true },
    }),
  ]);

  const currency = userSettings?.defaultCurrency || "INR";
  const today = todayIST();

  // Metrics computation
  let totalInvoicedPaise = 0;
  let totalCollectedPaise = 0;
  let totalOutstandingPaise = 0;
  let totalOverduePaise = 0;

  let countCreated = 0;
  let countPaid = 0;
  let countPending = 0;
  let countOverdue = 0;

  type EnrichedInvoice = typeof invoices[0] & {
    derivedStatus: ReturnType<typeof deriveInvoiceStatus>;
    paidPaise: number;
    balancePaise: number;
    daysOverdue: number;
  };

  const enrichedInvoices: EnrichedInvoice[] = invoices.map((inv) => {
    const status = deriveInvoiceStatus({
      state: inv.state,
      viewedAt: inv.viewedAt,
      dueDate: inv.dueDate,
      totalPaise: inv.totalPaise,
      payments: inv.payments,
    });

    const paidPaise = inv.payments.reduce((sum, p) => sum + p.amountPaise, 0);
    const balancePaise = Math.max(0, inv.totalPaise - paidPaise);

    const dueDateStr = inv.dueDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    let daysOverdue = 0;
    if (status === "overdue") {
      const diffMs = new Date(today).getTime() - new Date(dueDateStr).getTime();
      daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    if (inv.state !== "cancelled") {
      countCreated++;
      totalInvoicedPaise += inv.totalPaise;
      totalCollectedPaise += paidPaise;
      totalOutstandingPaise += balancePaise;

      if (status === "paid") {
        countPaid++;
      } else if (status === "overdue") {
        countOverdue++;
        totalOverduePaise += balancePaise;
      } else if (status === "sent" || status === "viewed" || status === "partially_paid") {
        countPending++;
      }
    }

    return {
      ...inv,
      derivedStatus: status,
      paidPaise,
      balancePaise,
      daysOverdue,
    };
  });

  // Filtered sub-lists
  const overdueInvoices = enrichedInvoices
    .filter((inv) => inv.derivedStatus === "overdue")
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 5);

  const recentInvoices = enrichedInvoices.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Overview</h1>
          <p className="text-xs text-gray-500 mt-1">
            Real-time receivables, cash collection performance, and overdue tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
          >
            <span>+</span> Create Invoice
          </Link>
        </div>
      </div>

      {/* 2. Connect Claude Banner (Requirement 5) */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-white p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-950">Connect Claude to Settlewise</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                10 MCP Tools Ready
              </span>
            </div>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Let Claude query receivables, issue invoices, log client payments, and run automated reminder schedules.
            </p>
          </div>
        </div>
        <Link
          href="/settings#mcp"
          className="inline-flex items-center justify-center text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 px-3 py-1.5 rounded-lg shadow-2xs hover:bg-indigo-50 transition-colors whitespace-nowrap"
        >
          View MCP Settings →
        </Link>
      </div>

      {/* 3. Financial Metric Cards (Requirement 1 & 3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Invoiced */}
        <Link
          href="/invoices?status=all"
          className="group bg-white p-5 rounded-xl border border-gray-200 hover:border-gray-300 transition-all shadow-xs hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Invoiced
            </span>
            <span className="text-[11px] font-mono text-gray-400 group-hover:text-indigo-600 transition-colors">
              {countCreated} invoices →
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-gray-900">
            {formatPaise(totalInvoicedPaise, currency)}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            All issued bills across accounts
          </div>
        </Link>

        {/* Collected (Green) */}
        <Link
          href="/invoices?status=paid"
          className="group bg-white p-5 rounded-xl border border-gray-200 hover:border-emerald-300 transition-all shadow-xs hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Collected
            </span>
            <span className="text-[11px] font-mono text-gray-400 group-hover:text-emerald-700 transition-colors">
              {countPaid} settled →
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-600">
            {formatPaise(totalCollectedPaise, currency)}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            Verified received payments
          </div>
        </Link>

        {/* Outstanding (Orange/Amber) */}
        <Link
          href="/invoices?status=partially_paid"
          className="group bg-white p-5 rounded-xl border border-gray-200 hover:border-amber-300 transition-all shadow-xs hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Outstanding
            </span>
            <span className="text-[11px] font-mono text-gray-400 group-hover:text-amber-700 transition-colors">
              {countPending} pending →
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-600">
            {formatPaise(totalOutstandingPaise, currency)}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            Awaiting client remittance
          </div>
        </Link>

        {/* Overdue (Red) */}
        <Link
          href="/invoices?status=overdue"
          className="group bg-white p-5 rounded-xl border border-gray-200 hover:border-rose-300 transition-all shadow-xs hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Overdue
            </span>
            <span className="text-[11px] font-mono text-gray-400 group-hover:text-rose-700 transition-colors">
              {countOverdue} late →
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-600">
            {formatPaise(totalOverduePaise, currency)}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            Past agreed maturity terms
          </div>
        </Link>
      </div>

      {/* Tables Section: Overdue & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue Accounts Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Critical Overdue Accounts
                </h2>
              </div>
              <Link
                href="/invoices?status=overdue"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
              >
                View all ({countOverdue}) →
              </Link>
            </div>

            {overdueInvoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                🎉 No overdue invoices! All payments are currently up to date.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 text-xs">
                {overdueInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3.5 flex items-center justify-between hover:bg-gray-50/60 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-mono font-bold text-indigo-600 hover:underline"
                        >
                          {inv.number}
                        </Link>
                        <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                          {inv.daysOverdue}d overdue
                        </span>
                      </div>
                      <div className="text-gray-900 font-medium mt-0.5">
                        {inv.customer.name}
                        {inv.customer.companyName && (
                          <span className="text-gray-400 ml-1">({inv.customer.companyName})</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-gray-900">
                        {formatPaise(inv.balancePaise, inv.currency)}
                      </div>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800"
                      >
                        Record payment →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recently Paid Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Recently Collected Payments
                </h2>
              </div>
              <Link
                href="/invoices?status=paid"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
              >
                View settled →
              </Link>
            </div>

            {recentPayments.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                No payments recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 text-xs">
                {recentPayments.map((p) => {
                  const paymentDateFormatted = new Date(p.paymentDate).toLocaleDateString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  return (
                    <div
                      key={p.id}
                      className="p-3.5 flex items-center justify-between hover:bg-gray-50/60 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/invoices/${p.invoice.id}`}
                            className="font-mono font-bold text-indigo-600 hover:underline"
                          >
                            {p.invoice.number}
                          </Link>
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded capitalize">
                            {p.method.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="text-gray-900 font-medium mt-0.5">
                          {p.invoice.customer.name}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {paymentDateFormatted} • {p.reference || "No Ref"}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-mono font-bold text-emerald-600">
                          +{formatPaise(p.amountPaise, p.invoice.currency)}
                        </div>
                        <span className="text-[10px] text-gray-400">
                          Manually recorded
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6. Recent Invoices Full Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
            Recent Invoices
          </h2>
          <Link
            href="/invoices"
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
          >
            All invoices →
          </Link>
        </div>

        {recentInvoices.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">
            No invoices created yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50/80 text-gray-500 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-4 text-left">Invoice #</th>
                  <th className="py-2.5 px-4 text-left">Client</th>
                  <th className="py-2.5 px-4 text-left">Due Date</th>
                  <th className="py-2.5 px-4 text-left">Status</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentInvoices.map((inv) => {
                  const meta = STATUS_META[inv.derivedStatus];
                  const dueDateFormatted = new Date(inv.dueDate).toLocaleDateString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-indigo-600">
                        <Link href={`/invoices/${inv.id}`} className="hover:underline">
                          {inv.number}
                        </Link>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{inv.customer.name}</div>
                        {inv.customer.companyName && (
                          <div className="text-[10px] text-gray-400">{inv.customer.companyName}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-gray-600">
                        {dueDateFormatted}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.color}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-bold text-gray-900">
                        {formatPaise(inv.totalPaise, inv.currency)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
