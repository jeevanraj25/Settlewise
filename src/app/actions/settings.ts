"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

export async function regenerateMcpToken() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const newToken = generateToken(24);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { mcpToken: newToken },
  });
  revalidatePath("/settings");
}

const businessSettingsSchema = z.object({
  businessName: z.string().max(100).default(""),
  businessEmail: z.string().email("Valid email is required").or(z.literal("")).default(""),
  address: z.string().max(500).default(""),
  taxInfo: z.string().max(50).default(""), // GSTIN / PAN / Tax info
  defaultCurrency: z.string().max(10).default("INR"),
  paymentInstructions: z.string().max(2000).default(""),
  remindersEnabled: z.boolean().default(true),
  reminderSchedule: z.string().default("-3,0,3,7,14"),
});

export type SettingsFormState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
};

export async function updateBusinessSettingsAction(
  _prevState: SettingsFormState | undefined,
  formData: FormData
): Promise<SettingsFormState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const rawData = {
    businessName: (formData.get("businessName") as string ?? "").trim(),
    businessEmail: (formData.get("businessEmail") as string ?? "").trim(),
    address: (formData.get("address") as string ?? "").trim(),
    taxInfo: (formData.get("taxInfo") as string ?? "").trim(),
    defaultCurrency: (formData.get("defaultCurrency") as string ?? "INR").trim(),
    paymentInstructions: (formData.get("paymentInstructions") as string ?? "").trim(),
    remindersEnabled: formData.get("remindersEnabled") === "on" || formData.get("remindersEnabled") === "true",
    reminderSchedule: (formData.get("reminderSchedule") as string ?? "-3,0,3,7,14").trim(),
  };

  const parsed = businessSettingsSchema.safeParse(rawData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  // Upsert business settings and keep user.businessName in sync
  await prisma.$transaction([
    prisma.businessSettings.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: {
        ...data,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        businessName: data.businessName,
      },
    }),
  ]);

  revalidatePath("/settings");
  revalidatePath("/invoices");
  return { success: true, message: "Business settings & payment instructions saved successfully." };
}
