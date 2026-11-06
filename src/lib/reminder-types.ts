/**
 * Settlewise — Pure Reminder Types and Display Helpers (Client-Safe)
 * No DB or Node-only dependencies.
 */

export const DEFAULT_REMINDER_OFFSETS = [-3, 0, 3, 7, 14];

export const REMINDER_TYPE_MAP: Record<number, { type: string; label: string }> = {
  [-3]: { type: "before_due_3d", label: "3 Days Before Due" },
  0: { type: "due_date", label: "On Due Date" },
  3: { type: "overdue_3d", label: "3 Days Overdue" },
  7: { type: "overdue_7d", label: "7 Days Overdue" },
  14: { type: "overdue_14d", label: "14 Days Overdue" },
};

export function getReminderTypeInfo(type: string): { label: string; badgeColor: string } {
  switch (type) {
    case "before_due_3d":
      return { label: "3 Days Before Due", badgeColor: "bg-blue-50 text-blue-700 border-blue-200" };
    case "due_date":
      return { label: "On Due Date", badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    case "overdue_3d":
      return { label: "3 Days Overdue", badgeColor: "bg-amber-50 text-amber-700 border-amber-200" };
    case "overdue_7d":
      return { label: "7 Days Overdue", badgeColor: "bg-orange-50 text-orange-700 border-orange-200" };
    case "overdue_14d":
      return { label: "14 Days Overdue", badgeColor: "bg-rose-50 text-rose-700 border-rose-200" };
    default:
      return { label: type.replace(/_/g, " "), badgeColor: "bg-gray-50 text-gray-700 border-gray-200" };
  }
}

export function parseScheduleOffsets(scheduleStr?: string | null): number[] {
  if (!scheduleStr) return DEFAULT_REMINDER_OFFSETS;
  const offsets = scheduleStr
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  return offsets.length > 0 ? offsets : DEFAULT_REMINDER_OFFSETS;
}
