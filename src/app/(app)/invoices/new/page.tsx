import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import CreateInvoiceForm from "@/components/CreateInvoiceForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create Invoice — Settlewise" };

export default async function NewInvoicePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [customers, businessSettings] = await Promise.all([
    prisma.customer.findMany({
      where: { userId },
      select: { id: true, name: true, email: true, companyName: true },
      orderBy: { name: "asc" },
    }),
    prisma.businessSettings.findUnique({
      where: { userId },
      select: { defaultCurrency: true, paymentInstructions: true },
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create New Invoice</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Issue a new collections invoice with automated payment tracking and milestone reminders.
        </p>
      </div>

      <CreateInvoiceForm
        customers={customers}
        defaultPaymentInstructions={businessSettings?.paymentInstructions || ""}
        defaultCurrency={businessSettings?.defaultCurrency || "INR"}
      />
    </div>
  );
}
