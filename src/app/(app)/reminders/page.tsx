import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPaise } from "@/lib/money";
import { redirect } from "next/navigation";
import RemindersClient, { ReminderRow } from "@/components/RemindersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment Reminders — Settlewise" };

export default async function RemindersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Rule 4: Scoped strictly to the logged in user's invoices
  const rawReminders = await prisma.reminder.findMany({
    where: { invoice: { userId } },
    include: {
      invoice: {
        include: {
          customer: { select: { name: true, email: true } },
          payments: { select: { amountPaise: true } },
        },
      },
    },
    orderBy: [
      { status: "asc" }, // pending first
      { scheduledAt: "asc" },
    ],
  });

  const now = new Date();

  const reminderRows: ReminderRow[] = rawReminders.map((r) => {
    const inv = r.invoice;
    const totalPaid = inv.payments.reduce((sum, p) => sum + p.amountPaise, 0);
    const balancePaise = Math.max(0, inv.totalPaise - totalPaid);

    const scheduledDate = new Date(r.scheduledAt);
    const isOverdue = scheduledDate.getTime() < now.getTime();

    // Friendly relative time calculation
    const diffMs = scheduledDate.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    let relativeTime = "";
    if (diffDays === 0) relativeTime = "Due today";
    else if (diffDays > 0) relativeTime = `In ${diffDays} day${diffDays === 1 ? "" : "s"}`;
    else relativeTime = `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`;

    return {
      id: r.id,
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      customerName: inv.customer.name,
      customerEmail: inv.customer.email,
      balanceFormatted: formatPaise(balancePaise, inv.currency),
      type: r.type,
      scheduledAtFormatted: scheduledDate.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      scheduledAtDateString: scheduledDate.toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      }),
      relativeTime,
      status: r.status,
      sentAtFormatted: r.sentAt
        ? new Date(r.sentAt).toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : undefined,
      subject: r.subject,
      message: r.message,
      simulated: r.simulated,
      isOverdue,
    };
  });

  const hasResendKey = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== "");

  return (
    <RemindersClient
      initialReminders={reminderRows}
      hasResendKey={hasResendKey}
    />
  );
}
