"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  companyName: z.string().max(100).optional().default(""),
  email: z.string().email("Valid email is required"),
  phone: z.string().max(20).optional().default(""),
  billingAddress: z.string().max(500).optional().default(""),
});

export type CustomerFormState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
};

export async function createCustomerAction(
  _prevState: CustomerFormState | undefined,
  formData: FormData
): Promise<CustomerFormState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const rawData = {
    name: formData.get("name"),
    companyName: formData.get("companyName") ?? "",
    email: (formData.get("email") as string | null)?.trim().toLowerCase(),
    phone: formData.get("phone") ?? "",
    billingAddress: formData.get("billingAddress") ?? "",
  };

  const parsed = customerSchema.safeParse(rawData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { name, companyName, email, phone, billingAddress } = parsed.data;

  // Duplicate check scoped by userId (case-insensitive email)
  const existing = await prisma.customer.findFirst({
    where: { userId, email },
  });
  if (existing) {
    return {
      message: "A customer with this email already exists in your account.",
    };
  }

  await prisma.customer.create({
    data: {
      userId,
      name,
      companyName,
      email,
      phone,
      billingAddress,
    },
  });

  revalidatePath("/customers");
  return { success: true };
}

export async function updateCustomerAction(
  customerId: string,
  _prevState: CustomerFormState | undefined,
  formData: FormData
): Promise<CustomerFormState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const rawData = {
    name: formData.get("name"),
    companyName: formData.get("companyName") ?? "",
    email: (formData.get("email") as string | null)?.trim().toLowerCase(),
    phone: formData.get("phone") ?? "",
    billingAddress: formData.get("billingAddress") ?? "",
  };

  const parsed = customerSchema.safeParse(rawData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { name, companyName, email, phone, billingAddress } = parsed.data;

  // Check customer exists and belongs to this user
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId },
  });
  if (!customer) {
    return { message: "Customer not found." };
  }

  // Check email conflict with other customers
  const conflict = await prisma.customer.findFirst({
    where: {
      userId,
      email,
      id: { not: customerId },
    },
  });
  if (conflict) {
    return {
      message: "Another customer with this email already exists.",
    };
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      name,
      companyName,
      email,
      phone,
      billingAddress,
    },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function deleteCustomerAction(
  customerId: string
): Promise<{ success?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Rule 4: Query scoped by userId
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId },
    include: {
      _count: {
        select: { invoices: true },
      },
    },
  });

  if (!customer) {
    return { error: "Customer not found." };
  }

  // Block delete if customer has invoices
  if (customer._count.invoices > 0) {
    return {
      error: `Cannot delete "${customer.name}". This customer is linked to ${customer._count.invoices} invoice(s). You can edit their details instead.`,
    };
  }

  await prisma.customer.delete({
    where: { id: customerId },
  });

  revalidatePath("/customers");
  return { success: true };
}
