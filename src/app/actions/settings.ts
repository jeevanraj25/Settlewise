"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
