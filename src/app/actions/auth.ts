"use server";

import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/utils";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

const SignupSchema = z.object({
  name: z.string().min(2, { error: "Name must be at least 2 characters." }).trim(),
  email: z.email({ error: "Invalid email." }).trim(),
  password: z.string().min(8, { error: "Password must be at least 8 characters." }),
  businessName: z.string().trim().optional(),
});

export type AuthFormState =
  | { errors?: Record<string, string[]>; message?: string }
  | undefined;

export async function signupAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    businessName: formData.get("businessName"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { name, email, password, businessName } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) {
    return { errors: { email: ["An account with this email already exists."] } };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const mcpToken = generateToken(24); // 32-char URL-safe token

  await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      businessName: businessName ?? "",
      mcpToken,
    },
  });

  redirect("/login?registered=1");
}

export async function loginAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/invoices",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { message: "Invalid email or password." };
    }
    // redirect() throws internally — rethrow it
    throw err;
  }
}
