"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  runRemindersNowAction,
  sendReminderNowAction,
  pauseReminderAction,
  resumeReminderAction,
  cancelReminderAction,
} from "@/app/actions/reminders";
import { getReminderTypeInfo } from "@/lib/reminder-types";
import EditReminderModal from "@/components/EditReminderModal";
import ViewReminderModal from "@/components/ViewReminderModal";

export interface ReminderRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  balanceFormatted: string;
  type: string;
  scheduledAtFormatted: string;
  scheduledAtDateString: string;
  relativeTime: string;
  status: "pending" | "sent" | "paused" | "skipped" | "cancelled" | string;
  sentAtFormatted?: string;
  subject: string;
  message: string;
  simulated: boolean;
  isOverdue: boolean;
}

interface RemindersClientProps {
  initialReminders: ReminderRow[];
  hasResendKey: boolean;
}

export default function RemindersClient({
  initialReminders,
  hasResendKey,
}: RemindersClientProps) {
  const [reminders] = useState<ReminderRow[]>(initialReminders);
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [activeEditingReminder, setActiveEditingReminder] = useState<ReminderRow | null>(null);
  const [activeViewingReminder, setActiveViewingReminder] = useState<ReminderRow | null>(null);

  const [isRunningBatch, startBatchTransition] = useTransition();
  const [batchBanner, setBatchBanner] = useState<{ message: string; success: boolean } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Status counts
  const counts = {
    all: reminders.length,
    pending: reminders.filter((r) => r.status === "pending").length,
    sent: reminders.filter((r) => r.status === "sent").length,
    paused: reminders.filter((r) => r.status === "paused").length,
    skipped: reminders.filter((r) => r.status === "skipped").length,
    cancelled: reminders.filter((r) => r.status === "cancelled").length,
  };

  // Filtered rows
  const filteredReminders = reminders.filter((r) => {
    if (selectedStatus !== "all" && r.status !== selectedStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchInvoice = r.invoiceNumber.toLowerCase().includes(q);
      const matchCustomer = r.customerName.toLowerCase().includes(q);
      const matchEmail = r.customerEmail.toLowerCase().includes(q);
      const matchSubject = r.subject.toLowerCase().includes(q);
      const matchType = r.type.toLowerCase().includes(q);
      if (!matchInvoice && !matchCustomer && !matchEmail && !matchSubject && !matchType) return false;
    }
    return true;
  });

  const handleRunRemindersNow = () => {
    setBatchBanner(null);
    startBatchTransition(async () => {
      const res = await runRemindersNowAction();
      setBatchBanner({
        message: res.message,
        success: res.success,
      });
    });
  };

  const handleSendNow = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await sendReminderNowAction(id);
      setBatchBanner({
        message: res.message,
        success: res.success,
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePause = async (id: string) => {
    setActionLoadingId(id);
    try {
      await pauseReminderAction(id);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResume = async (id: string) => {
    setActionLoadingId(id);
    try {
      await resumeReminderAction(id);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this scheduled reminder?")) return;
    setActionLoadingId(id);
    try {
      await cancelReminderAction(id);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900">Payment Reminders</h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                hasResendKey
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {hasResendKey ? "Resend Live" : "Test Mode (Default)"}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Automated milestone follow-ups for outstanding accounts. Stop automatically once invoices are settled.
          </p>
        </div>

        {/* Demo button & settings link */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-xs"
          >
            Configure Schedule
          </Link>

          <button
            onClick={handleRunRemindersNow}
            disabled={isRunningBatch}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
            title="Processes all due reminders right now (for testing & demo)"
          >
            {isRunningBatch ? (
              <>
                <svg className="animate-spin -ml-1 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                Processing…
              </>
            ) : (
              <>
                <span>▶</span> Run Reminders Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Batch Notification Banner */}
      {batchBanner && (
        <div
          className={`rounded-xl p-4 text-xs font-medium border flex items-center justify-between ${
            batchBanner.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <span>{batchBanner.message}</span>
          <button
            onClick={() => setBatchBanner(null)}
            className="text-xs font-semibold hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(["all", "pending", "sent", "paused", "skipped", "cancelled"] as const).map((status) => {
            const isActive = selectedStatus === status;
            const count = counts[status];
            return (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize whitespace-nowrap ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {status} <span className="opacity-75 font-normal ml-0.5">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="w-full md:w-72">
          <input
            type="text"
            placeholder="Search invoice, client, or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Reminders List */}
      {filteredReminders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 text-lg font-bold">
            ⏰
          </div>
          <h3 className="text-base font-semibold text-gray-900">No reminders found</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
            {search || selectedStatus !== "all"
              ? "No reminders match your current search or status filters."
              : "Reminders are automatically generated whenever a new invoice is issued. You can also create reminders via the Claude assistant."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50/80 text-gray-500 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4 text-left">Invoice & Client</th>
                  <th className="py-3 px-4 text-left">Milestone</th>
                  <th className="py-3 px-4 text-left">Scheduled For</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-left">Delivery Mode</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredReminders.map((r) => {
                  const typeInfo = getReminderTypeInfo(r.type);
                  const isBusy = actionLoadingId === r.id;

                  return (
                    <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Invoice & Client */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/invoices/${r.invoiceId}`}
                            className="font-mono font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            {r.invoiceNumber}
                          </Link>
                          <span className="text-[11px] text-gray-400 font-mono">
                            • Balance: {r.balanceFormatted}
                          </span>
                        </div>
                        <div className="text-gray-900 font-medium text-xs mt-0.5">
                          {r.customerName}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {r.customerEmail}
                        </div>
                      </td>

                      {/* Milestone Type */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${typeInfo.badgeColor}`}
                        >
                          {typeInfo.label}
                        </span>
                      </td>

                      {/* Scheduled For */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">
                          {r.scheduledAtFormatted}
                        </div>
                        <div
                          className={`text-[11px] mt-0.5 ${
                            r.isOverdue && r.status === "pending"
                              ? "text-rose-600 font-semibold"
                              : "text-gray-400"
                          }`}
                        >
                          {r.relativeTime}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {r.status === "sent" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Sent
                          </span>
                        )}
                        {r.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Pending
                          </span>
                        )}
                        {r.status === "paused" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Paused
                          </span>
                        )}
                        {r.status === "skipped" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                            Skipped (Paid)
                          </span>
                        )}
                        {r.status === "cancelled" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                            Cancelled
                          </span>
                        )}
                      </td>

                      {/* Delivery Mode (Honest Rule #7 Label) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {r.status === "sent" ? (
                          <div>
                            <span
                              className={`text-[11px] font-semibold ${
                                r.simulated ? "text-amber-700" : "text-emerald-700"
                              }`}
                            >
                              {r.simulated ? "Simulated (test mode)" : "Sent via Resend"}
                            </span>
                            {r.sentAtFormatted && (
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {r.sentAtFormatted}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">
                            {hasResendKey ? "Resend configured" : "Test mode (Simulated)"}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {r.status === "pending" && (
                            <>
                              <button
                                onClick={() => handleSendNow(r.id)}
                                disabled={isBusy}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-2xs"
                                title="Send reminder immediately"
                              >
                                {isBusy ? "…" : "Send now"}
                              </button>
                              <button
                                onClick={() => handlePause(r.id)}
                                disabled={isBusy}
                                className="px-2 py-1 text-[11px] font-medium rounded text-gray-600 hover:bg-gray-100 transition-colors"
                              >
                                Pause
                              </button>
                              <button
                                onClick={() => setActiveEditingReminder(r)}
                                disabled={isBusy}
                                className="px-2 py-1 text-[11px] font-medium rounded text-gray-600 hover:bg-gray-100 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleCancel(r.id)}
                                disabled={isBusy}
                                className="px-2 py-1 text-[11px] font-medium rounded text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {r.status === "paused" && (
                            <>
                              <button
                                onClick={() => handleResume(r.id)}
                                disabled={isBusy}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                              >
                                Resume
                              </button>
                              <button
                                onClick={() => setActiveEditingReminder(r)}
                                disabled={isBusy}
                                className="px-2 py-1 text-[11px] font-medium rounded text-gray-600 hover:bg-gray-100 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleCancel(r.id)}
                                disabled={isBusy}
                                className="px-2 py-1 text-[11px] font-medium rounded text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {r.status === "sent" && (
                            <button
                              onClick={() => setActiveViewingReminder(r)}
                              className="px-2.5 py-1 text-[11px] font-medium rounded border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              View Message
                            </button>
                          )}

                          {(r.status === "skipped" || r.status === "cancelled") && (
                            <button
                              onClick={() => setActiveViewingReminder(r)}
                              className="px-2 py-1 text-[11px] font-medium rounded text-gray-500 hover:bg-gray-100 transition-colors"
                            >
                              Details
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {activeEditingReminder && (
        <EditReminderModal
          reminder={activeEditingReminder}
          onClose={() => setActiveEditingReminder(null)}
        />
      )}

      {/* View Modal */}
      {activeViewingReminder && (
        <ViewReminderModal
          reminder={activeViewingReminder}
          onClose={() => setActiveViewingReminder(null)}
        />
      )}
    </div>
  );
}
