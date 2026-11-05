"use client";

import { useState, useTransition } from "react";
import { recordPaymentAction } from "@/app/actions/invoices";

interface RecordPaymentModalProps {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  balancePaise: number;
}

export default function RecordPaymentModal({
  invoiceId,
  invoiceNumber,
  currency,
  balancePaise,
}: RecordPaymentModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const balanceRupees = (balancePaise / 100).toFixed(2);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await recordPaymentAction(invoiceId, undefined, formData);
      if (res.message) {
        setErrorMsg(res.message);
      } else if (res.success) {
        setIsOpen(false);
        setErrorMsg(null);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErrorMsg(null);
          setIsOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Record Payment
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div>
                <h2 className="text-base font-bold text-gray-900">Record Payment</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{invoiceNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Remaining balance banner */}
              <div className="rounded-xl bg-indigo-50/80 border border-indigo-100 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs text-indigo-700 font-medium block">
                    Outstanding Balance
                  </span>
                  <span className="text-lg font-bold text-indigo-950 font-mono">
                    ₹{balanceRupees}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const amountInput = document.getElementById("payment-amount") as HTMLInputElement;
                    if (amountInput) amountInput.value = balanceRupees;
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                >
                  Pay full amount
                </button>
              </div>

              {errorMsg && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Payment Amount (₹) *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 text-sm">
                    ₹
                  </span>
                  <input
                    id="payment-amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={balanceRupees}
                    defaultValue={balanceRupees}
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Payment Date *
                </label>
                <input
                  name="paymentDate"
                  type="date"
                  required
                  defaultValue={today}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Payment Method *
                </label>
                <select
                  name="method"
                  defaultValue="bank_transfer"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="bank_transfer">Bank Transfer (NEFT / RTGS / IMPS)</option>
                  <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                  <option value="card">Credit / Debit Card</option>
                  <option value="cheque">Cheque</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Reference / Transaction ID
                </label>
                <input
                  name="reference"
                  type="text"
                  placeholder="e.g. UTR-98234710293 or UPI Ref"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 text-xs text-gray-400">
                This payment will be recorded in the audit log and marked as{" "}
                <span className="font-semibold text-gray-600">&ldquo;Manually recorded&rdquo;</span>.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {isPending ? "Recording…" : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
