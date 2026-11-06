/**
 * Seed script — DEMO DATA ONLY
 * Creates one demo user with sample invoices.
 * Run: npx prisma db seed   (or: npx tsx prisma/seed.ts)
 *
 * ⚠️  This wipes any existing demo user and recreates it.
 *     Never run against production with real user data.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function generateToken(byteLength = 24): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}

function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

async function main() {
  console.log("🌱 Seeding demo data…");

  // --- Demo user ---
  const passwordHash = await bcrypt.hash("demo1234", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@collectly.test" },
    update: {},
    create: {
      name: "Demo User",
      email: "demo@collectly.test",
      passwordHash,
      businessName: "Demo Agency",
      mcpToken: generateToken(24),
      businessSettings: {
        create: {
          businessName: "Demo Agency",
          businessEmail: "demo@collectly.test",
          address: "123 MG Road, Bengaluru 560001",
          taxInfo: "GSTIN: 29ABCDE1234F1Z5",
          defaultCurrency: "INR",
          paymentInstructions:
            "Bank: State Bank of India\nAcc: 1234567890\nIFSC: SBIN0001234\nUPI: demo@upi",
        },
      },
    },
    include: { businessSettings: true },
  });

  console.log(`  ✓ User: ${user.email} / password: demo1234`);
  console.log(`  ✓ MCP token: ${user.mcpToken}`);

  // --- Customers ---
  const acme = await prisma.customer.upsert({
    where: { userId_email: { userId: user.id, email: "billing@acmecorp.example" } },
    update: {},
    create: {
      userId: user.id,
      name: "Rahul Sharma",
      companyName: "Acme Corp",
      email: "billing@acmecorp.example",
      phone: "+91 98765 43210",
      billingAddress: "456 Connaught Place, New Delhi 110001",
    },
  });

  const freela = await prisma.customer.upsert({
    where: { userId_email: { userId: user.id, email: "priya@freelance.example" } },
    update: {},
    create: {
      userId: user.id,
      name: "Priya Nair",
      companyName: "",
      email: "priya@freelance.example",
      phone: "+91 90000 12345",
    },
  });

  console.log(`  ✓ Customers: ${acme.name}, ${freela.name}`);

  // Helper to build invoice
  async function createInvoice({
    seq,
    customerId,
    invoiceDateStr,
    dueDateStr,
    items,
    taxPercent = 0,
    discountRupees = 0,
    notes = "",
    state = "issued",
  }: {
    seq: number;
    customerId: string;
    invoiceDateStr: string;
    dueDateStr: string;
    items: { description: string; quantity: number; unitPriceRupees: number }[];
    taxPercent?: number;
    discountRupees?: number;
    notes?: string;
    state?: string;
  }) {
    const lineItems = items.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unitPricePaise: rupeesToPaise(li.unitPriceRupees),
      totalPaise: li.quantity * rupeesToPaise(li.unitPriceRupees),
    }));
    const subtotalPaise = lineItems.reduce((s, li) => s + li.totalPaise, 0);
    const discountPaise = rupeesToPaise(discountRupees);
    const afterDiscount = Math.max(0, subtotalPaise - discountPaise);
    const taxPaise = Math.round(afterDiscount * (taxPercent / 100));
    const totalPaise = afterDiscount + taxPaise;

    const number = `INV-${String(seq).padStart(4, "0")}`;
    const publicToken = generateToken(24);

    return prisma.invoice.create({
      data: {
        userId: user.id,
        customerId,
        number,
        publicToken,
        invoiceDate: new Date(`${invoiceDateStr}T00:00:00+05:30`),
        dueDate: new Date(`${dueDateStr}T00:00:00+05:30`),
        currency: "INR",
        subtotalPaise,
        taxPaise,
        discountPaise,
        totalPaise,
        state,
        notes,
        items: { createMany: { data: lineItems.map((li) => ({ ...li })) } },
      },
    });
  }

  // --- Invoice 1: Paid (has payment >= total) ---
  const inv1 = await createInvoice({
    seq: 1,
    customerId: acme.id,
    invoiceDateStr: "2026-10-01",
    dueDateStr: "2026-10-31",
    items: [
      { description: "Website redesign — Phase 1", quantity: 1, unitPriceRupees: 75000 },
      { description: "UI/UX audit report", quantity: 1, unitPriceRupees: 15000 },
    ],
    taxPercent: 18,
    notes: "Payment within 30 days. GST included.",
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv1.id,
      amountPaise: inv1.totalPaise,
      paymentDate: new Date("2026-10-20T00:00:00+05:30"),
      method: "bank_transfer",
      reference: "UTR20261020001",
      verification: "manual",
    },
  });
  console.log(`  ✓ ${inv1.number} (paid)`);

  // --- Invoice 2: Overdue (past due date, no payment) ---
  const inv2 = await createInvoice({
    seq: 2,
    customerId: acme.id,
    invoiceDateStr: "2026-09-15",
    dueDateStr: "2026-10-15",
    items: [
      { description: "Monthly SEO retainer — Sept", quantity: 1, unitPriceRupees: 25000 },
    ],
    notes: "Net 30. Late payment interest @ 2% per month.",
  });
  console.log(`  ✓ ${inv2.number} (overdue)`);

  // --- Invoice 3: Partially paid ---
  const inv3 = await createInvoice({
    seq: 3,
    customerId: freela.id,
    invoiceDateStr: "2026-10-20",
    dueDateStr: "2026-11-20",
    items: [
      { description: "Logo design", quantity: 1, unitPriceRupees: 12000 },
      { description: "Brand style guide", quantity: 1, unitPriceRupees: 8000 },
    ],
    discountRupees: 2000,
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv3.id,
      amountPaise: rupeesToPaise(10000),
      paymentDate: new Date("2026-10-25T00:00:00+05:30"),
      method: "upi",
      reference: "UPI20261025",
      verification: "manual",
    },
  });
  console.log(`  ✓ ${inv3.number} (partially_paid)`);

  // --- Invoice 4: Draft ---
  await createInvoice({
    seq: 4,
    customerId: freela.id,
    invoiceDateStr: "2026-11-05",
    dueDateStr: "2026-12-05",
    items: [
      { description: "Social media content — Nov", quantity: 1, unitPriceRupees: 18000 },
    ],
    state: "draft",
  });
  console.log(`  ✓ INV-0004 (draft)`);

  // --- Sample Reminders for Demo ---
  await prisma.reminder.createMany({
    data: [
      {
        invoiceId: inv2.id,
        type: "due_date",
        scheduledAt: new Date("2026-10-15T09:30:00+05:30"),
        status: "sent",
        sentAt: new Date("2026-10-15T09:30:00+05:30"),
        subject: "Due Today: Invoice INV-0002",
        message: "Hi Rahul,\n\nInvoice INV-0002 for ₹25,000.00 is due today.\n\nThank you,\nDemo Agency",
        simulated: true,
      },
      {
        invoiceId: inv2.id,
        type: "overdue_3d",
        scheduledAt: new Date("2026-10-18T09:30:00+05:30"),
        status: "pending",
        subject: "Payment Reminder: Invoice INV-0002 is 3 days overdue",
        message: "Hi Rahul,\n\nWe noticed invoice INV-0002 is now 3 days overdue.\n\nThank you,\nDemo Agency",
        simulated: true,
      },
      {
        invoiceId: inv3.id,
        type: "before_due_3d",
        scheduledAt: new Date("2026-11-17T09:30:00+05:30"),
        status: "pending",
        subject: "Upcoming Due Date: Invoice INV-0003",
        message: "Hi Freelance Client,\n\nThis is a friendly reminder that invoice INV-0003 has a balance of ₹8,000.00 due in 3 days.\n\nThank you,\nDemo Agency",
        simulated: true,
      },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ Sample demo reminders created");

  console.log("\n✅ Seed complete!");
  console.log("   Login: demo@collectly.test / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
