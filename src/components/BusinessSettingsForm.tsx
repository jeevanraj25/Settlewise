"use client";

import { useState, useTransition } from "react";
import { updateBusinessSettingsAction, SettingsFormState } from "@/app/actions/settings";

interface BusinessSettingsFormProps {
  initialSettings: {
    businessName: string;
    businessEmail: string;
    address: string;
    taxInfo: string;
    defaultCurrency: string;
    paymentInstructions: string;
  };
}

export default function BusinessSettingsForm({
  initialSettings,
}: BusinessSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<SettingsFormState | undefined>();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState(undefined);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateBusinessSettingsAction(undefined, formData);
      setState(res);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {state?.message && (
        <div
          className={`rounded-xl p-4 text-sm font-medium border ${
            state.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {state.message}
        </div>
      )}

      {/* Business Profile */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Business Profile
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Business / Trade Name
            </label>
            <input
              name="businessName"
              type="text"
              defaultValue={initialSettings.businessName}
              placeholder="e.g. Settlewise Design Studio"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Business / Billing Email
            </label>
            <input
              name="businessEmail"
              type="email"
              defaultValue={initialSettings.businessEmail}
              placeholder="billing@yourdomain.com"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Tax / GSTIN Number
            </label>
            <input
              name="taxInfo"
              type="text"
              defaultValue={initialSettings.taxInfo}
              placeholder="e.g. 29ABCDE1234F1Z5 or PAN"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Default Currency
            </label>
            <input
              name="defaultCurrency"
              type="text"
              defaultValue={initialSettings.defaultCurrency || "INR"}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
            Registered Business Address
          </label>
          <textarea
            name="address"
            rows={2}
            defaultValue={initialSettings.address}
            placeholder="Street address, City, State, PIN Code"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Payment Instructions / Bank Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Payment Instructions & Bank Details
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            These instructions appear directly on public invoices and Claude emails so clients know exactly how to settle payments.
          </p>
        </div>

        <div>
          <textarea
            name="paymentInstructions"
            rows={5}
            defaultValue={initialSettings.paymentInstructions}
            placeholder={`Bank Name: HDFC Bank\nAccount Name: Settlewise Studio\nAccount Number: 50100234567890\nIFSC Code: HDFC0001234\nUPI ID: payments@hdfcbank\nPayment terms: Net 15 days`}
            className="w-full rounded-lg border border-gray-300 bg-white p-3 font-mono text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
        >
          {isPending ? "Saving settings…" : "Save Business Settings"}
        </button>
      </div>
    </form>
  );
}
