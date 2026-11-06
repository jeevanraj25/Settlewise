"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvoiceAction, CreateInvoiceResult } from "@/app/actions/invoices";

interface CustomerOption {
  id: string;
  name: string;
  email: string;
  companyName?: string | null;
}

interface CreateInvoiceFormProps {
  customers: CustomerOption[];
  defaultPaymentInstructions?: string;
  defaultCurrency?: string;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export default function CreateInvoiceForm({
  customers,
  defaultPaymentInstructions = "",
  defaultCurrency = "INR",
}: CreateInvoiceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formState, setFormState] = useState<CreateInvoiceResult | undefined>();

  // Date helper (Asia/Kolkata)
  const getTodayDateStr = () => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  };

  const getFutureDateStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  };

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers.length > 0 ? customers[0].id : "new"
  );
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerCompany, setNewCustomerCompany] = useState("");

  const [invoiceDate, setInvoiceDate] = useState(getTodayDateStr());
  const [dueDate, setDueDate] = useState(getFutureDateStr(30));
  const [currency] = useState(defaultCurrency);

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", description: "Design & Development Services", quantity: 1, unitPrice: 25000 },
  ]);

  const [discountRupees, setDiscountRupees] = useState(0);
  const [taxPercent, setTaxPercent] = useState(18); // standard 18% GST
  const [notes, setNotes] = useState("Payment is due within the stipulated period. Thank you for your business!");
  const [paymentInstructions, setPaymentInstructions] = useState(defaultPaymentInstructions);

  // Line item handlers
  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: String(Date.now()), description: "", quantity: 1, unitPrice: 0 },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, val: string | number) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  // Live calculations
  const rawSubtotal = lineItems.reduce((acc, it) => acc + (it.quantity || 0) * (it.unitPrice || 0), 0);
  const discountAmount = Math.min(rawSubtotal, Math.max(0, discountRupees || 0));
  const subtotalAfterDiscount = Math.max(0, rawSubtotal - discountAmount);
  const taxAmount = Math.round((subtotalAfterDiscount * (taxPercent || 0)) / 100);
  const totalAmount = subtotalAfterDiscount + taxAmount;

  const formatRupees = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleDueDatePreset = (days: number) => {
    setDueDate(getFutureDateStr(days));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormState(undefined);

    const formData = new FormData();
    formData.append("customerId", selectedCustomerId);
    if (selectedCustomerId === "new") {
      formData.append("newCustomerName", newCustomerName);
      formData.append("newCustomerEmail", newCustomerEmail);
      formData.append("newCustomerCompany", newCustomerCompany);
    }
    formData.append("invoiceDate", invoiceDate);
    formData.append("dueDate", dueDate);
    formData.append("currency", currency);
    formData.append("taxPercent", String(taxPercent));
    formData.append("discountRupees", String(discountRupees));
    formData.append("notes", notes);
    formData.append("paymentInstructions", paymentInstructions);
    formData.append("lineItems", JSON.stringify(lineItems));

    startTransition(async () => {
      const res = await createInvoiceAction(undefined, formData);
      if (res.success && res.invoiceId) {
        router.push(`/invoices/${res.invoiceId}`);
      } else {
        setFormState(res);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formState?.message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">
          {formState.message}
        </div>
      )}

      {/* 1. Customer Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Customer Information
          </h2>
          <span className="text-[11px] text-gray-400">Bill To</span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
            Select Customer
          </label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.companyName ? `(${c.companyName})` : ""} — {c.email}
              </option>
            ))}
            <option value="new">+ Add New Customer</option>
          </select>
        </div>

        {selectedCustomerId === "new" && (
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 pt-3">
            <h3 className="text-xs font-semibold text-gray-800">New Customer Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">
                  Contact Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">
                  Billing Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="rahul@example.com"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Acme Technologies"
                  value={newCustomerCompany}
                  onChange={(e) => setNewCustomerCompany(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Invoice Dates & Terms */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Dates & Terms
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Invoice Date
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
            {/* Quick preset buttons */}
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[11px] text-gray-400">Quick terms:</span>
              <button
                type="button"
                onClick={() => handleDueDatePreset(15)}
                className="px-2 py-0.5 text-[10px] font-semibold rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                Net 15
              </button>
              <button
                type="button"
                onClick={() => handleDueDatePreset(30)}
                className="px-2 py-0.5 text-[10px] font-semibold rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                Net 30
              </button>
              <button
                type="button"
                onClick={() => handleDueDatePreset(45)}
                className="px-2 py-0.5 text-[10px] font-semibold rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                Net 45
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Line Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Line Items
          </h2>
          <button
            type="button"
            onClick={addLineItem}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            + Add Item Row
          </button>
        </div>

        <div className="space-y-3">
          {lineItems.map((item, idx) => {
            const lineTotal = (item.quantity || 0) * (item.unitPrice || 0);
            return (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-2 sm:gap-3 items-center p-3 rounded-lg bg-gray-50/70 border border-gray-200"
              >
                <div className="col-span-12 sm:col-span-6">
                  <label className="block sm:hidden text-[10px] font-semibold text-gray-500 uppercase mb-0.5">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={`Item ${idx + 1} description`}
                    value={item.description}
                    onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="col-span-4 sm:col-span-2">
                  <label className="block sm:hidden text-[10px] font-semibold text-gray-500 uppercase mb-0.5">
                    Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={item.quantity}
                    onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value, 10) || 1)}
                    className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-right"
                  />
                </div>

                <div className="col-span-4 sm:col-span-2">
                  <label className="block sm:hidden text-[10px] font-semibold text-gray-500 uppercase mb-0.5">
                    Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={item.unitPrice}
                    onChange={(e) => updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                    className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-right"
                  />
                </div>

                <div className="col-span-3 sm:col-span-1 text-right font-mono text-xs font-semibold text-gray-900">
                  {formatRupees(lineTotal)}
                </div>

                <div className="col-span-1 sm:col-span-1 text-right">
                  <button
                    type="button"
                    onClick={() => removeLineItem(item.id)}
                    disabled={lineItems.length <= 1}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-20 text-sm p-1 transition-colors"
                    title="Remove item"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Pricing, Tax, Discount & Live Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Taxes & Discounts Inputs */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Adjustments
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Tax (% GST)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={taxPercent}
                onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 font-mono text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Discount (Flat ₹)
              </label>
              <input
                type="number"
                min="0"
                value={discountRupees}
                onChange={(e) => setDiscountRupees(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 font-mono text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Invoice Notes & Terms
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Live Calculation Card */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
              Invoice Summary
            </h2>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span className="font-mono font-medium">{formatRupees(rawSubtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Discount</span>
                  <span className="font-mono">-{formatRupees(discountAmount)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tax ({taxPercent}%)</span>
                  <span className="font-mono font-medium">+{formatRupees(taxAmount)}</span>
                </div>
              )}
              <div className="pt-3 border-t border-gray-200 flex justify-between items-baseline">
                <span className="text-sm font-bold text-gray-900">Total Payable</span>
                <span className="text-xl font-bold font-mono text-gray-900">
                  {formatRupees(totalAmount)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors shadow-xs"
            >
              {isPending ? "Creating Invoice…" : "Create & Issue Invoice"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
