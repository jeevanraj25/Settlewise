"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeInvoiceTotals, rupeesToPaise } from "@/lib/money";
import { scheduleInvoiceReminders } from "@/lib/reminders";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

export type InvoiceFormState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
};

const updateInvoiceSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  currency: z.string().default("INR"),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  discountRupees: z.coerce.number().min(0).default(0),
  notes: z.string().default(""),
  paymentInstructions: z.string().default(""),
});

export async function updateInvoiceAction(
  invoiceId: string,
  _prevState: InvoiceFormState | undefined,
  formData: FormData
): Promise<InvoiceFormState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Rule 4: Query scoped by userId
  const existing = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: { items: true },
  });
  if (!existing) {
    return { message: "Invoice not found or access denied." };
  }

  // Parse scalar fields
  const rawData = {
    customerId: formData.get("customerId"),
    invoiceDate: formData.get("invoiceDate"),
    dueDate: formData.get("dueDate"),
    currency: formData.get("currency") ?? "INR",
    taxPercent: formData.get("taxPercent") ?? 0,
    discountRupees: formData.get("discountRupees") ?? 0,
    notes: formData.get("notes") ?? "",
    paymentInstructions: formData.get("paymentInstructions") ?? "",
  };

  const parsed = updateInvoiceSchema.safeParse(rawData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  // Parse line items JSON from form
  const rawItems = formData.get("lineItems");
  let itemsList: Array<{ description: string; quantity: number; unitPrice: number }>;
  try {
    itemsList = JSON.parse(rawItems as string);
    if (!Array.isArray(itemsList) || itemsList.length === 0) {
      return { message: "At least one line item is required." };
    }
  } catch {
    return { message: "Invalid line items data." };
  }

  // Ensure line items are valid
  for (const item of itemsList) {
    if (!item.description || item.description.trim().length === 0) {
      return { message: "All line items must have a description." };
    }
    if (item.quantity <= 0) {
      return { message: "Line item quantities must be greater than 0." };
    }
    if (item.unitPrice < 0) {
      return { message: "Line item unit prices cannot be negative." };
    }
  }

  // Server-side computation of all totals in paise (Rule #3)
  const lineItemsInPaise = itemsList.map((item) => ({
    description: item.description.trim(),
    quantity: Math.round(item.quantity),
    unitPricePaise: rupeesToPaise(item.unitPrice),
    totalPaise: Math.round(item.quantity) * rupeesToPaise(item.unitPrice),
  }));

  const discountPaise = rupeesToPaise(parsed.data.discountRupees);
  const { subtotalPaise, taxPaise, totalPaise } = computeInvoiceTotals(
    lineItemsInPaise,
    parsed.data.taxPercent,
    discountPaise
  );

  // Update in a database transaction
  await prisma.$transaction(async (tx) => {
    // 1. Delete old items and insert new items
    await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    await tx.invoiceItem.createMany({
      data: lineItemsInPaise.map((item) => ({
        invoiceId,
        description: item.description,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        totalPaise: item.totalPaise,
      })),
    });

    // 2. Update invoice header
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        customerId: parsed.data.customerId,
        invoiceDate: new Date(`${parsed.data.invoiceDate}T00:00:00+05:30`),
        dueDate: new Date(`${parsed.data.dueDate}T00:00:00+05:30`),
        currency: parsed.data.currency,
        subtotalPaise,
        taxPaise,
        discountPaise,
        totalPaise,
        notes: parsed.data.notes,
      },
    });

    // 3. Update business payment instructions if provided
    if (parsed.data.paymentInstructions !== undefined) {
      await tx.businessSettings.upsert({
        where: { userId },
        create: {
          userId,
          paymentInstructions: parsed.data.paymentInstructions,
        },
        update: {
          paymentInstructions: parsed.data.paymentInstructions,
        },
      });
    }
  });

  // Schedule or refresh reminders if issued (Phase 5 Requirement 2)
  await scheduleInvoiceReminders(invoiceId).catch(() => {});

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { success: true };
}

export async function cancelInvoiceAction(
  invoiceId: string
): Promise<{ success?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
  });
  if (!invoice) return { error: "Invoice not found." };

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoiceId },
      data: { state: "cancelled" },
    }),
    prisma.reminder.updateMany({
      where: { invoiceId, status: "pending" },
      data: { status: "cancelled" },
    }),
  ]);

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { success: true };
}

export async function deleteInvoiceAction(
  invoiceId: string
): Promise<{ success?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
  });
  if (!invoice) return { error: "Invoice not found." };

  // Rule 2: Delete ONLY for drafts
  if (invoice.state !== "draft") {
    return {
      error: "Only draft invoices can be deleted. Issued invoices must be cancelled to preserve financial audit history.",
    };
  }

  await prisma.invoice.delete({
    where: { id: invoiceId },
  });

  revalidatePath("/invoices");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Payment recording (Rule #3 integer paise, Rule #7 "manual" label)
// ---------------------------------------------------------------------------
const paymentSchema = z.object({
  amountRupees: z.coerce.number().positive("Payment amount must be greater than 0"),
  paymentDate: z.string().min(1, "Payment date is required"),
  method: z.string().default("bank_transfer"),
  reference: z.string().default(""),
});

export async function recordPaymentAction(
  invoiceId: string,
  _prevState: { success?: boolean; message?: string } | undefined,
  formData: FormData
): Promise<{ success?: boolean; message?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const rawData = {
    amountRupees: formData.get("amount"),
    paymentDate: formData.get("paymentDate"),
    method: formData.get("method") ?? "bank_transfer",
    reference: formData.get("reference") ?? "",
  };

  const parsed = paymentSchema.safeParse(rawData);
  if (!parsed.success) {
    const errorMsg = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Invalid payment data.";
    return { message: errorMsg };
  }

  const { amountRupees, paymentDate, method, reference } = parsed.data;
  const paymentAmountPaise = rupeesToPaise(amountRupees);

  // Atomic database transaction to prevent race conditions or overpaying
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Fetch invoice and existing payments inside transaction
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, userId },
        include: { payments: true },
      });

      if (!invoice) {
        throw new Error("Invoice not found or access denied.");
      }

      if (invoice.state === "cancelled") {
        throw new Error("Cannot record payment on a cancelled invoice.");
      }

      // Compute current outstanding balance in paise
      const currentPaidPaise = invoice.payments.reduce((s, p) => s + p.amountPaise, 0);
      const balancePaise = invoice.totalPaise - currentPaidPaise;

      // Reject amounts above the balance
      if (paymentAmountPaise > balancePaise) {
        const balanceRupeesFormatted = new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: invoice.currency,
        }).format(balancePaise / 100);
        throw new Error(
          `Payment amount exceeds the remaining balance. Maximum payable is ${balanceRupeesFormatted}.`
        );
      }

      // Record payment with Rule #7 "manual" verification label
      await tx.payment.create({
        data: {
          invoiceId,
          amountPaise: paymentAmountPaise,
          paymentDate: new Date(`${paymentDate}T00:00:00+05:30`),
          method,
          reference: reference.trim(),
          verification: "manual",
        },
      });

      // If invoice is now paid in full, automatically skip remaining pending reminders
      if (paymentAmountPaise >= balancePaise) {
        await tx.reminder.updateMany({
          where: { invoiceId, status: "pending" },
          data: { status: "skipped" },
        });
      }
    });
  } catch (err: any) {
    return { message: err.message || "Failed to record payment." };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/customers");
  return { success: true };
}
