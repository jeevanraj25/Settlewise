"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processDueReminders, sendReminderEmail, generateReminderTemplate } from "@/lib/reminders";
import { formatPaise } from "@/lib/money";
import { getBaseUrl } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

/**
 * Run all due reminders now (for demos or immediate batch runs).
 * Scoped to the logged-in user.
 */
export async function runRemindersNowAction(): Promise<{
  success: boolean;
  message: string;
  processed: number;
  sent: number;
  skipped: number;
}> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  try {
    const result = await processDueReminders({ userId });
    revalidatePath("/reminders");
    revalidatePath("/invoices");

    let modeText = process.env.RESEND_API_KEY ? "via Resend" : "in Simulated Test Mode";
    const msg = `Batch completed: ${result.sent} reminder(s) sent (${modeText}), ${result.skipped} skipped (paid/cancelled).`;

    return {
      success: true,
      message: msg,
      processed: result.processed,
      sent: result.sent,
      skipped: result.skipped,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to process reminders.",
      processed: 0,
      sent: 0,
      skipped: 0,
    };
  }
}

/**
 * Send a specific reminder immediately.
 */
export async function sendReminderNowAction(reminderId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Rule 4: Verify invoice belongs to this user
  const reminder = await prisma.reminder.findFirst({
    where: {
      id: reminderId,
      invoice: { userId },
    },
    include: {
      invoice: {
        include: {
          customer: true,
          payments: true,
          user: { include: { businessSettings: true } },
        },
      },
    },
  });

  if (!reminder) {
    return { success: false, message: "Reminder not found or access denied." };
  }

  const inv = reminder.invoice;

  if (inv.state === "cancelled") {
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { status: "cancelled" },
    });
    revalidatePath("/reminders");
    return { success: false, message: "Cannot send reminder: invoice is cancelled." };
  }

  const totalPaid = inv.payments.reduce((sum, p) => sum + p.amountPaise, 0);
  const balancePaise = Math.max(0, inv.totalPaise - totalPaid);

  if (balancePaise <= 0) {
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { status: "skipped" },
    });
    revalidatePath("/reminders");
    return { success: false, message: "Cannot send reminder: invoice is already paid in full." };
  }

  const baseUrl = getBaseUrl();
  const publicUrl = `${baseUrl}/i/${inv.publicToken}`;
  const dueDateFormatted = inv.dueDate.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const defaultTpl = generateReminderTemplate({
    invoiceNumber: inv.number,
    customerName: inv.customer.name,
    type: reminder.type,
    dueDateFormatted,
    balancePaise,
    currency: inv.currency,
    publicUrl,
    businessName: inv.user.businessSettings?.businessName || inv.user.businessName,
  });

  const subjectToSend = reminder.subject.trim() || defaultTpl.subject;
  const messageToSend = reminder.message.trim() || defaultTpl.message;

  const result = await sendReminderEmail({
    to: inv.customer.email,
    subject: subjectToSend,
    message: messageToSend,
    businessName: inv.user.businessSettings?.businessName || inv.user.businessName,
  });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to send email." };
  }

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: {
      status: "sent",
      sentAt: new Date(),
      simulated: result.simulated,
      subject: subjectToSend,
      message: messageToSend,
    },
  });

  revalidatePath("/reminders");
  const modeLabel = result.simulated ? "Simulated (test mode)" : "Sent via Resend";
  return {
    success: true,
    message: `Reminder sent successfully (${modeLabel}) to ${inv.customer.email}.`,
  };
}

/**
 * Pause a pending reminder.
 */
export async function pauseReminderAction(reminderId: string): Promise<{ success: boolean; message?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, invoice: { userId } },
  });
  if (!reminder) return { success: false, message: "Reminder not found." };

  await prisma.reminder.update({
    where: { id: reminderId },
    data: { status: "paused" },
  });

  revalidatePath("/reminders");
  return { success: true };
}

/**
 * Resume a paused reminder back to pending.
 */
export async function resumeReminderAction(reminderId: string): Promise<{ success: boolean; message?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, invoice: { userId } },
  });
  if (!reminder) return { success: false, message: "Reminder not found." };

  await prisma.reminder.update({
    where: { id: reminderId },
    data: { status: "pending" },
  });

  revalidatePath("/reminders");
  return { success: true };
}

/**
 * Cancel a reminder.
 */
export async function cancelReminderAction(reminderId: string): Promise<{ success: boolean; message?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, invoice: { userId } },
  });
  if (!reminder) return { success: false, message: "Reminder not found." };

  await prisma.reminder.update({
    where: { id: reminderId },
    data: { status: "cancelled" },
  });

  revalidatePath("/reminders");
  return { success: true };
}

const editReminderSchema = z.object({
  scheduledAt: z.string().min(1, "Scheduled date is required"),
  subject: z.string().max(200).default(""),
  message: z.string().max(2000).default(""),
});

/**
 * Edit a reminder's scheduled date, subject, or message.
 */
export async function editReminderAction(
  reminderId: string,
  formData: FormData
): Promise<{ success: boolean; message?: string; errors?: Record<string, string[]> }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, invoice: { userId } },
  });
  if (!reminder) return { success: false, message: "Reminder not found." };

  const parsed = editReminderSchema.safeParse({
    scheduledAt: formData.get("scheduledAt"),
    subject: formData.get("subject") ?? "",
    message: formData.get("message") ?? "",
  });

  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { scheduledAt, subject, message } = parsed.data;

  await prisma.reminder.update({
    where: { id: reminderId },
    data: {
      scheduledAt: new Date(`${scheduledAt}T09:30:00+05:30`),
      subject: subject.trim(),
      message: message.trim(),
    },
  });

  revalidatePath("/reminders");
  return { success: true, message: "Reminder updated successfully." };
}
