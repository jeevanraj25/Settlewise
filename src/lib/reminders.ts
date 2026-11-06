/**
 * Settlewise — Reminders Engine
 *
 * Rules:
 * Rule #1: No AI inside the app. Deterministic rule-based templates only.
 * Rule #3: Integer paise for money calculations.
 * Rule #4: Strictly user-scoped operations.
 * Rule #6: Dates processed in Asia/Kolkata timezone.
 * Rule #7: Honest labels: "Simulated (test mode)" unless RESEND_API_KEY is set.
 */

import { prisma } from "@/lib/prisma";
import { formatPaise } from "@/lib/money";
import { getBaseUrl } from "@/lib/utils";
import {
  DEFAULT_REMINDER_OFFSETS,
  REMINDER_TYPE_MAP,
  getReminderTypeInfo,
  parseScheduleOffsets,
} from "@/lib/reminder-types";

export {
  DEFAULT_REMINDER_OFFSETS,
  REMINDER_TYPE_MAP,
  getReminderTypeInfo,
  parseScheduleOffsets,
};

/**
 * Generate default subject and plain-text body for a milestone reminder.
 */
export function generateReminderTemplate(params: {
  invoiceNumber: string;
  customerName: string;
  type: string;
  dueDateFormatted: string;
  balancePaise: number;
  currency: string;
  publicUrl: string;
  businessName?: string;
}): { subject: string; message: string } {
  const {
    invoiceNumber,
    customerName,
    type,
    dueDateFormatted,
    balancePaise,
    currency,
    publicUrl,
    businessName = "Settlewise",
  } = params;

  const formattedBalance = formatPaise(balancePaise, currency);
  const senderSignature = businessName ? `\n\nBest regards,\n${businessName}` : "\n\nBest regards,\nAccounts Team";

  switch (type) {
    case "before_due_3d":
      return {
        subject: `Upcoming Due Date: Invoice ${invoiceNumber} from ${businessName}`,
        message:
          `Hi ${customerName},\n\n` +
          `This is a friendly reminder that invoice ${invoiceNumber} for ${formattedBalance} is due on ${dueDateFormatted}.\n\n` +
          `You can view invoice details and payment instructions here:\n${publicUrl}` +
          senderSignature,
      };

    case "due_date":
      return {
        subject: `Due Today: Invoice ${invoiceNumber} (${formattedBalance})`,
        message:
          `Hi ${customerName},\n\n` +
          `Invoice ${invoiceNumber} for ${formattedBalance} is due today (${dueDateFormatted}).\n\n` +
          `Please make payment using the invoice link below:\n${publicUrl}` +
          senderSignature,
      };

    case "overdue_3d":
      return {
        subject: `Payment Reminder: Invoice ${invoiceNumber} is 3 days overdue`,
        message:
          `Hi ${customerName},\n\n` +
          `We noticed invoice ${invoiceNumber} for ${formattedBalance} was due on ${dueDateFormatted} and is now 3 days overdue.\n\n` +
          `Please review and settle the outstanding balance here:\n${publicUrl}\n\n` +
          `If payment has already been sent, please disregard this reminder.` +
          senderSignature,
      };

    case "overdue_7d":
      return {
        subject: `Second Notice: Invoice ${invoiceNumber} is 7 days overdue`,
        message:
          `Hi ${customerName},\n\n` +
          `Invoice ${invoiceNumber} for ${formattedBalance} is currently 7 days past due (due: ${dueDateFormatted}).\n\n` +
          `Kindly settle the invoice online at:\n${publicUrl}\n\n` +
          `If there are any questions regarding this invoice, please reach out to us.` +
          senderSignature,
      };

    case "overdue_14d":
      return {
        subject: `Urgent: Invoice ${invoiceNumber} is 14 days overdue`,
        message:
          `Hi ${customerName},\n\n` +
          `This is an urgent follow-up regarding invoice ${invoiceNumber} for ${formattedBalance}, which is now 14 days overdue.\n\n` +
          `Please arrange immediate settlement using the link below:\n${publicUrl}\n\n` +
          `Thank you for your prompt attention to this matter.` +
          senderSignature,
      };

    default:
      return {
        subject: `Payment Reminder: Invoice ${invoiceNumber}`,
        message:
          `Hi ${customerName},\n\n` +
          `This is a payment reminder for invoice ${invoiceNumber} for ${formattedBalance} (Due: ${dueDateFormatted}).\n\n` +
          `View invoice: ${publicUrl}` +
          senderSignature,
      };
  }
}

/**
 * Auto-create reminder rows for an issued invoice based on user's schedule settings.
 * Skips if invoice is draft, cancelled, or if reminders are disabled.
 */
export async function scheduleInvoiceReminders(invoiceId: string): Promise<number> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      payments: true,
      user: {
        include: { businessSettings: true },
      },
      reminders: { select: { type: true } },
    },
  });

  if (!invoice) return 0;
  if (invoice.state !== "issued") return 0;

  const settings = invoice.user.businessSettings;
  if (settings && !settings.remindersEnabled) {
    return 0; // Reminders toggled off by user
  }

  const offsets = parseScheduleOffsets(settings?.reminderSchedule);
  const existingTypes = new Set(invoice.reminders.map((r) => r.type));

  const totalPaid = invoice.payments.reduce((s, p) => s + p.amountPaise, 0);
  const balancePaise = Math.max(0, invoice.totalPaise - totalPaid);
  if (balancePaise <= 0) return 0; // Already paid in full

  const baseUrl = getBaseUrl();
  const publicUrl = `${baseUrl}/i/${invoice.publicToken}`;
  const dueDateFormatted = invoice.dueDate.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  let createdCount = 0;

  for (const offset of offsets) {
    const meta = REMINDER_TYPE_MAP[offset] ?? {
      type: offset < 0 ? `before_due_${Math.abs(offset)}d` : `overdue_${offset}d`,
      label: `${Math.abs(offset)} Days ${offset < 0 ? "Before" : "After"} Due`,
    };

    if (existingTypes.has(meta.type)) continue;

    // Calculate scheduled date in Asia/Kolkata timezone
    const scheduledDate = new Date(invoice.dueDate);
    scheduledDate.setDate(scheduledDate.getDate() + offset);
    // Standard reminder send time: 09:30:00 IST (04:00:00 UTC)
    scheduledDate.setHours(9, 30, 0, 0);

    const { subject, message } = generateReminderTemplate({
      invoiceNumber: invoice.number,
      customerName: invoice.customer.name,
      type: meta.type,
      dueDateFormatted,
      balancePaise,
      currency: invoice.currency,
      publicUrl,
      businessName: settings?.businessName || invoice.user.businessName,
    });

    try {
      await prisma.reminder.create({
        data: {
          invoiceId: invoice.id,
          type: meta.type,
          scheduledAt: scheduledDate,
          status: "pending",
          subject,
          message,
          simulated: !Boolean(process.env.RESEND_API_KEY),
        },
      });
      createdCount++;
    } catch {
      // Ignore unique constraint race conditions
    }
  }

  return createdCount;
}

/**
 * Send an email via Resend if RESEND_API_KEY is configured;
 * otherwise runs in TEST MODE, storing the message and marking it "Simulated (test mode)".
 */
export async function sendReminderEmail(params: {
  to: string;
  subject: string;
  message: string;
  businessName?: string;
}): Promise<{ success: boolean; simulated: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    // TEST MODE (Default when no API key is provided)
    return {
      success: true,
      simulated: true,
    };
  }

  try {
    const fromAddress =
      process.env.RESEND_FROM_EMAIL || "Settlewise <onboarding@resend.dev>";

    // Convert plain text newlines into HTML paragraphs for email clients
    const htmlBody = params.message
      .split("\n\n")
      .map((p) => `<p style="margin-bottom: 12px; line-height: 1.5; color: #374151;">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [params.to],
        subject: params.subject,
        text: params.message,
        html: `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">${htmlBody}</body></html>`,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("[Resend Error]", errData);
      return {
        success: false,
        simulated: false,
        error: errData.message || `Resend API HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      simulated: false,
    };
  } catch (err: any) {
    console.error("[Resend Exception]", err);
    return {
      success: false,
      simulated: false,
      error: err.message || "Failed to send email via Resend",
    };
  }
}

/**
 * Processor function: sends all due pending reminders.
 * Rules:
 * - Skip paid or cancelled invoices.
 * - Never send duplicates.
 * - Stop when balance is zero.
 */
export async function processDueReminders(filter?: {
  userId?: string;
  invoiceId?: string;
  reminderId?: string;
}): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{ reminderId: string; invoiceNumber: string; status: string; simulated: boolean; reason?: string }>;
}> {
  const now = new Date();

  // Find eligible pending reminders
  const where: any = {
    status: "pending",
  };

  if (filter?.reminderId) {
    where.id = filter.reminderId;
  } else {
    // When processing the batch/cron, only process reminders whose scheduledAt <= now
    where.scheduledAt = { lte: now };
  }

  if (filter?.invoiceId) {
    where.invoiceId = filter.invoiceId;
  }

  if (filter?.userId) {
    where.invoice = { userId: filter.userId };
  }

  const dueReminders = await prisma.reminder.findMany({
    where,
    include: {
      invoice: {
        include: {
          customer: true,
          payments: true,
          user: { include: { businessSettings: true } },
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const details: Array<{
    reminderId: string;
    invoiceNumber: string;
    status: string;
    simulated: boolean;
    reason?: string;
  }> = [];

  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const reminder of dueReminders) {
    const inv = reminder.invoice;

    // Rule: Skip cancelled invoices
    if (inv.state === "cancelled") {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: "cancelled" },
      });
      skippedCount++;
      details.push({
        reminderId: reminder.id,
        invoiceNumber: inv.number,
        status: "cancelled",
        simulated: false,
        reason: "Invoice is cancelled",
      });
      continue;
    }

    // Rule: Skip draft invoices
    if (inv.state === "draft") {
      skippedCount++;
      details.push({
        reminderId: reminder.id,
        invoiceNumber: inv.number,
        status: "skipped",
        simulated: false,
        reason: "Invoice is still draft",
      });
      continue;
    }

    // Rule: Stop when balance is zero
    const totalPaid = inv.payments.reduce((sum, p) => sum + p.amountPaise, 0);
    const balancePaise = Math.max(0, inv.totalPaise - totalPaid);

    if (balancePaise <= 0) {
      // Mark this reminder and any future pending reminders for this invoice as skipped
      await prisma.reminder.updateMany({
        where: { invoiceId: inv.id, status: "pending" },
        data: { status: "skipped" },
      });
      skippedCount++;
      details.push({
        reminderId: reminder.id,
        invoiceNumber: inv.number,
        status: "skipped",
        simulated: false,
        reason: "Invoice is already paid in full",
      });
      continue;
    }

    // Prepare message and subject
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

    // Send email (via Resend or Simulated test mode)
    const sendResult = await sendReminderEmail({
      to: inv.customer.email,
      subject: subjectToSend,
      message: messageToSend,
      businessName: inv.user.businessSettings?.businessName || inv.user.businessName,
    });

    if (!sendResult.success) {
      errorCount++;
      details.push({
        reminderId: reminder.id,
        invoiceNumber: inv.number,
        status: "error",
        simulated: false,
        reason: sendResult.error || "Failed to send email",
      });
      continue;
    }

    // Mark as sent
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        status: "sent",
        sentAt: new Date(),
        simulated: sendResult.simulated,
        subject: subjectToSend,
        message: messageToSend,
      },
    });

    sentCount++;
    details.push({
      reminderId: reminder.id,
      invoiceNumber: inv.number,
      status: "sent",
      simulated: sendResult.simulated,
    });
  }

  return {
    processed: dueReminders.length,
    sent: sentCount,
    skipped: skippedCount,
    errors: errorCount,
    details,
  };
}
