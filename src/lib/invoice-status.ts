/**
 * Invoice status derivation — Rule #5.
 *
 * Status is NEVER stored in the DB. It is computed fresh on every read
 * from stored fields: state, viewedAt, payments[], totalPaise, dueDate.
 *
 * Priority (highest wins):
 *  cancelled > draft > paid > partially_paid > overdue > viewed > sent
 *
 * "Today" is always evaluated in Asia/Kolkata.
 */

export type InvoiceStatus =
  | "cancelled"
  | "draft"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "viewed"
  | "sent";

export interface InvoiceForStatus {
  state: string; // "draft" | "issued" | "cancelled"
  viewedAt: Date | null;
  dueDate: Date;
  totalPaise: number;
  payments: { amountPaise: number }[];
}

/** Returns today's date string YYYY-MM-DD in Asia/Kolkata timezone */
export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Returns true if the given Date is strictly before today in IST */
function isPastDue(dueDate: Date): boolean {
  const today = todayIST();
  // dueDate is a Date at midnight UTC (from @db.Date Prisma type)
  const dueDateStr = dueDate.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  return dueDateStr < today;
}

export function deriveInvoiceStatus(invoice: InvoiceForStatus): InvoiceStatus {
  if (invoice.state === "cancelled") return "cancelled";
  if (invoice.state === "draft") return "draft";

  const paidPaise = invoice.payments.reduce((s, p) => s + p.amountPaise, 0);
  const balance = invoice.totalPaise - paidPaise;

  if (balance <= 0) return "paid";
  if (paidPaise > 0) return "partially_paid";
  if (isPastDue(invoice.dueDate)) return "overdue";
  if (invoice.viewedAt !== null) return "viewed";
  return "sent";
}

/** Human-readable label + colour for status badges */
export const STATUS_META: Record<
  InvoiceStatus,
  { label: string; color: string }
> = {
  cancelled:     { label: "Cancelled",      color: "bg-gray-100 text-gray-600" },
  draft:         { label: "Draft",          color: "bg-yellow-100 text-yellow-700" },
  paid:          { label: "Paid",           color: "bg-green-100 text-green-700" },
  partially_paid:{ label: "Partial",        color: "bg-blue-100 text-blue-700" },
  overdue:       { label: "Overdue",        color: "bg-red-100 text-red-700" },
  viewed:        { label: "Viewed",         color: "bg-purple-100 text-purple-700" },
  sent:          { label: "Sent",           color: "bg-indigo-100 text-indigo-700" },
};
