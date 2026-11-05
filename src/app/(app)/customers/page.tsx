import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPaise } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import CustomerModal from "@/components/CustomerModal";
import DeleteCustomerButton from "@/components/DeleteCustomerButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers — Settlewise" };

export default async function CustomersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Rule 4: Query scoped by userId
  const customers = await prisma.customer.findMany({
    where: { userId },
    include: {
      invoices: {
        select: {
          id: true,
          totalPaise: true,
          payments: { select: { amountPaise: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage your client directory, view billing records, and track outstanding balances.
          </p>
        </div>
        <CustomerModal />
      </div>

      {customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">No customers yet</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1 mb-5">
            Add your clients here, or ask Claude to create an invoice and the customer will be created automatically.
          </p>
          <CustomerModal />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Email / Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Invoices
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Total Invoiced
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Outstanding
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {customers.map((c) => {
                  let totalInvoicedPaise = 0;
                  let totalPaidPaise = 0;

                  for (const inv of c.invoices) {
                    totalInvoicedPaise += inv.totalPaise;
                    for (const p of inv.payments) {
                      totalPaidPaise += p.amountPaise;
                    }
                  }

                  const outstandingPaise = Math.max(0, totalInvoicedPaise - totalPaidPaise);

                  return (
                    <tr key={c.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/customers/${c.id}`}
                          className="font-medium text-gray-900 hover:text-indigo-600 hover:underline block"
                        >
                          {c.name}
                        </Link>
                        {c.companyName && (
                          <span className="text-xs text-gray-500 block">{c.companyName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600">
                        <div>{c.email}</div>
                        {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {c.invoices.length} {c.invoices.length === 1 ? "invoice" : "invoices"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium text-gray-900">
                        {formatPaise(totalInvoicedPaise)}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold">
                        <span className={outstandingPaise > 0 ? "text-amber-700" : "text-emerald-700"}>
                          {formatPaise(outstandingPaise)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right space-x-2 whitespace-nowrap">
                        <Link
                          href={`/customers/${c.id}`}
                          className="inline-flex items-center rounded px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 border border-indigo-200 transition-colors"
                        >
                          View
                        </Link>
                        <CustomerModal
                          customer={{
                            id: c.id,
                            name: c.name,
                            companyName: c.companyName,
                            email: c.email,
                            phone: c.phone,
                            billingAddress: c.billingAddress,
                          }}
                          triggerLabel="Edit"
                          triggerClassName="inline-flex items-center rounded px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 border border-gray-300 transition-colors"
                        />
                        <DeleteCustomerButton
                          customerId={c.id}
                          customerName={c.name}
                          invoiceCount={c.invoices.length}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
