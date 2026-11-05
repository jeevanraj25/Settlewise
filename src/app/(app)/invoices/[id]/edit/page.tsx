import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import InvoiceEditForm from "@/components/InvoiceEditForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Invoice — Settlewise" };

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Rule 4: Scoped by userId
  const [invoice, customers, businessSettings] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, userId },
      include: { items: true },
    }),
    prisma.customer.findMany({
      where: { userId },
      select: { id: true, name: true, companyName: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.businessSettings.findUnique({
      where: { userId },
    }),
  ]);

  if (!invoice) notFound();

  // If invoice is cancelled, block edit
  if (invoice.state === "cancelled") {
    redirect(`/invoices/${invoice.id}`);
  }

  const invoiceData = {
    id: invoice.id,
    number: invoice.number,
    customerId: invoice.customerId,
    invoiceDate: invoice.invoiceDate.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    }),
    dueDate: invoice.dueDate.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    }),
    currency: invoice.currency,
    subtotalPaise: invoice.subtotalPaise,
    taxPaise: invoice.taxPaise,
    discountPaise: invoice.discountPaise,
    totalPaise: invoice.totalPaise,
    notes: invoice.notes,
    items: invoice.items,
  };

  return (
    <div className="max-w-4xl mx-auto">
      <InvoiceEditForm
        invoice={invoiceData}
        customers={customers}
        paymentInstructions={businessSettings?.paymentInstructions ?? ""}
      />
    </div>
  );
}
