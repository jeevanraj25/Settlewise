"use client";

interface ViewReminderModalProps {
  reminder: {
    invoiceNumber: string;
    customerName: string;
    customerEmail: string;
    subject: string;
    message: string;
    status: string;
    simulated: boolean;
    sentAtFormatted?: string;
  };
  onClose: () => void;
}

export default function ViewReminderModal({ reminder, onClose }: ViewReminderModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-lg w-full p-6 space-y-4 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">Reminder Content</h3>
              {reminder.status === "sent" && (
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                    reminder.simulated
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  {reminder.simulated ? "Simulated (test mode)" : "Sent via Resend"}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              To: {reminder.customerName} &lt;{reminder.customerEmail}&gt;
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Subject
            </span>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">
              {reminder.subject || "(Default milestone subject)"}
            </p>
          </div>

          <div>
            <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Message Body
            </span>
            <div className="mt-1 bg-gray-50 rounded-xl p-4 border border-gray-200 font-mono text-xs text-gray-800 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
              {reminder.message}
            </div>
          </div>

          {reminder.sentAtFormatted && (
            <p className="text-[11px] text-gray-400 pt-1">
              Dispatched: {reminder.sentAtFormatted}
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
