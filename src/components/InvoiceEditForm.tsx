"use client";

import { useState, useTransition } from "react";
import { updateInvoiceAction, InvoiceFormState } from "@/app/actions/invoices";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface CustomerOption {
  id: string;
  name: string;
  companyName: string;
  email: string;
}

interface InvoiceEditFormProps {
  invoice: {
    id: string;
    number: string;
    customerId: string;
    invoiceDate: string; // YYYY-MM-DD
    dueDate: string;     // YYYY-MM-DD
    currency: string;
    subtotalPaise: number;
    taxPaise: number;
    discountPaise: number;
    totalPaise: number;
    notes: string;
    items: Array<{
      id: string;
      description: string;
      quantity: number;
      unitPricePaise: number;
      totalPaise: number;
    }>;
  };
  customers: CustomerOption[];
  paymentInstructions: string;
}

interface LineItemRow {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number; // in Rupees
}

export default function InvoiceEditForm({
  invoice,
  customers,
  paymentInstructions: initialPaymentInstructions,
}: InvoiceEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<InvoiceFormState | undefined>();

  // Line items state
  const [lineItems, setLineItems] = useState<LineItemRow[]>(
    invoice.items.length > 0
      ? invoice.items.map((it) => ({
          id: it.id,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPricePaise / 100,
        }))
      : [{ id: "new-1", description: "", quantity: 1, unitPrice: 0 }]
  );

  const [discountRupees, setDiscountRupees] = useState<number>(invoice.discountPaise / 100);
  const [taxPercent, setTaxPercent] = useState<number>(
    invoice.subtotalPaise - invoice.discountPaise > 0
      ? Math.round((invoice.taxPaise / (invoice.subtotalPaise - invoice.discountPaise)) * 100)
      : 0
  );

  // Live total preview (computed in rupees for UI feedback; verified and recalculated strictly in integer paise on the server)
  const previewSubtotal = lineItems.reduce((acc, row) => acc + (row.quantity || 0) * (row.unitPrice || 0), 0);
  const afterDiscount = Math.max(0, previewSubtotal - (discountRupees || 0));
  const previewTax = (afterDiscount * (taxPercent || 0)) / 100;
  const previewTotal = afterDiscount + previewTax;

  const addRow = () => {
    setLineItems((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, description: "", quantity: 1, unitPrice: 0 },
    ]);
  };

  const removeRow = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof LineItemRow, value: any) => {
    setLineItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState(undefined);
    const formData = new FormData(e.currentTarget);
    formData.set("lineItems", JSON.stringify(lineItems));
    formData.set("discountRupees", String(discountRupees));
    formData.set("taxPercent", String(taxPercent));

    startTransition(async () => {
      const res = await updateInvoiceAction(invoice.id, undefined, formData);
      setState(res);
      if (res.success) {
        router.push(`/invoices/${invoice.id}`);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Invoice {invoice.number}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Modify invoice parameters. All totals are strictly re-verified and computed on the server.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/invoices/${invoice.id}`}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
          >
            {isPending ? "Saving changes…" : "Save Invoice"}
          </button>
        </div>
      </div>

      {state?.message && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {/* Main Details Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          General Details
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Customer *
            </label>
            <select
              name="customerId"
              defaultValue={invoice.customerId}
              required
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.companyName ? `(${c.companyName})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Invoice Date *
            </label>
            <input
              name="invoiceDate"
              type="date"
              required
              defaultValue={invoice.invoiceDate}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Due Date *
            </label>
            <input
              name="dueDate"
              type="date"
              required
              defaultValue={invoice.dueDate}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Line Items Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Line Items
          </h2>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            + Add Line Item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase bg-gray-50/50">
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5 w-24">Qty</th>
                <th className="px-3 py-2.5 w-36">Unit Price (₹)</th>
                <th className="px-3 py-2.5 w-32 text-right">Amount (₹)</th>
                <th className="px-3 py-2.5 w-12 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lineItems.map((item, index) => (
                <tr key={item.id} className="group">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      required
                      value={item.description}
                      onChange={(e) => updateRow(index, "description", e.target.value)}
                      placeholder="e.g. Website development milestone"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="1"
                      required
                      value={item.quantity}
                      onChange={(e) => updateRow(index, "quantity", parseInt(e.target.value) || 0)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={item.unitPrice}
                      onChange={(e) => updateRow(index, "unitPrice", parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-gray-900 font-mono">
                    ₹{((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      disabled={lineItems.length === 1}
                      className="text-gray-400 hover:text-red-600 disabled:opacity-20 text-base"
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals computation box */}
        <div className="pt-4 border-t border-gray-100 flex flex-col items-end space-y-2 text-sm">
          <div className="flex justify-between w-64 text-gray-600">
            <span>Subtotal:</span>
            <span className="font-mono font-medium">₹{previewSubtotal.toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between w-64 text-gray-600">
            <span>Discount (₹):</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={discountRupees}
              onChange={(e) => setDiscountRupees(parseFloat(e.target.value) || 0)}
              className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right text-xs text-gray-900"
            />
          </div>

          <div className="flex items-center justify-between w-64 text-gray-600">
            <span>GST / Tax (%):</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={taxPercent}
              onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
              className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right text-xs text-gray-900"
            />
          </div>

          <div className="flex justify-between w-64 text-gray-600 pt-1 border-t border-gray-100">
            <span>Tax Amount:</span>
            <span className="font-mono">₹{previewTax.toFixed(2)}</span>
          </div>

          <div className="flex justify-between w-64 text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
            <span>Total:</span>
            <span className="font-mono text-indigo-700">₹{previewTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Notes & Payment Instructions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
          <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">
            Invoice Notes
          </label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={invoice.notes}
            placeholder="Thank you for your business. Please complete payment within the due date."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
          <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">
            How to Pay / Payment Instructions
          </label>
          <textarea
            name="paymentInstructions"
            rows={3}
            defaultValue={initialPaymentInstructions}
            placeholder="UPI: user@bank&#10;Account: 1234567890 | IFSC: ABCD0123456"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
    </form>
  );
}
