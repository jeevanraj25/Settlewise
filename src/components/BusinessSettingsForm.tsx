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
    remindersEnabled?: boolean;
    reminderSchedule?: string;
  };
}

const SCHEDULE_OPTIONS = [
  { offset: -3, label: "3 days before due date", desc: "Friendly heads-up before the invoice falls due" },
  { offset: 0, label: "On the due date", desc: "Polite reminder that payment is due today" },
  { offset: 3, label: "3 days overdue", desc: "First overdue notice if still unpaid" },
  { offset: 7, label: "7 days overdue", desc: "Second overdue follow-up" },
  { offset: 14, label: "14 days overdue", desc: "Urgent overdue notice" },
];

export default function BusinessSettingsForm({
  initialSettings,
}: BusinessSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<SettingsFormState | undefined>();
  const [remindersEnabled, setRemindersEnabled] = useState(initialSettings.remindersEnabled ?? true);

  const initialOffsets = (initialSettings.reminderSchedule || "-3,0,3,7,14")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  const [selectedOffsets, setSelectedOffsets] = useState<number[]>(
    initialOffsets.length > 0 ? initialOffsets : [-3, 0, 3, 7, 14]
  );

  const toggleOffset = (offset: number) => {
    setSelectedOffsets((prev) =>
      prev.includes(offset) ? prev.filter((o) => o !== offset) : [...prev, offset].sort((a, b) => a - b)
    );
  };

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

      {/* Automated Payment Reminders (Phase 5 Requirement 2) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Automated Payment Reminders
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Automatically schedule email reminders for each newly issued invoice. Reminders halt automatically once an invoice is paid in full or cancelled.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              name="remindersEnabled"
              checked={remindersEnabled}
              onChange={(e) => setRemindersEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* Hidden input storing the serialized offsets */}
        <input
          type="hidden"
          name="reminderSchedule"
          value={selectedOffsets.join(",")}
        />

        <div className={`space-y-3 pt-2 border-t border-gray-100 ${!remindersEnabled ? "opacity-50 pointer-events-none" : ""}`}>
          <label className="block text-xs font-semibold text-gray-700 uppercase">
            Default Reminder Milestone Schedule
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {SCHEDULE_OPTIONS.map((opt) => {
              const isChecked = selectedOffsets.includes(opt.offset);
              return (
                <label
                  key={opt.offset}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? "border-indigo-300 bg-indigo-50/50 text-indigo-950"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleOffset(opt.offset)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-semibold block">{opt.label}</span>
                    <span className="text-gray-500 text-[11px] block mt-0.5">{opt.desc}</span>
                  </div>
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400">
            Selected schedule: {selectedOffsets.length > 0 ? selectedOffsets.map((o) => `${o > 0 ? "+" : ""}${o}d`).join(", ") : "None (no reminders will be scheduled)"}
          </p>
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
