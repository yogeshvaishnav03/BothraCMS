/**
 * Priority and Automated Recurring Reminder rules:
 * - DAILY: Reminder sent 3 times a day until completed (~every 4 hours during active hours)
 * - GENERAL: Reminder sent 2 times a day (morning & evening, ~every 8 hours) until completed
 * - CRITICAL: Reminder sent every 3 hours until completed
 */

export type TaskPriorityType = "DAILY" | "GENERAL" | "CRITICAL";

export const TASK_PRIORITY_OPTIONS = [
  {
    value: "DAILY",
    label: "Daily",
    subLabel: "3 times a day until completed",
  },
  {
    value: "GENERAL",
    label: "General",
    subLabel: "2 times a day (morning & evening)",
  },
  {
    value: "CRITICAL",
    label: "Critical",
    subLabel: "Every 3 hours until completed",
  },
];

export function normalizePriority(p?: string | null): TaskPriorityType {
  const norm = (p || "").toUpperCase();
  if (norm === "CRITICAL" || norm === "HIGH") return "CRITICAL";
  if (norm === "GENERAL" || norm === "LOW") return "GENERAL";
  return "DAILY";
}

export function formatPriorityLabel(p?: string | null): string {
  const norm = normalizePriority(p);
  if (norm === "CRITICAL") return "Critical";
  if (norm === "GENERAL") return "General";
  return "Daily";
}

export function getAutoReminderMessage(priority?: string | null): string {
  const norm = normalizePriority(priority);
  if (norm === "CRITICAL") {
    return "Auto Reminder: Alerts sent every 3 hours until completed.";
  }
  if (norm === "GENERAL") {
    return "Auto Reminder: Alerts sent 2 times a day (morning & evening) until completed.";
  }
  return "Auto Reminder: Alerts sent 3 times a day until completed.";
}

export function calculateInitialReminder(priority?: string | null, fromDate: Date = new Date()): Date {
  const norm = normalizePriority(priority);
  const now = fromDate.getTime();

  if (norm === "CRITICAL") {
    // Every 3 hours
    return new Date(now + 3 * 60 * 60 * 1000);
  }

  if (norm === "DAILY") {
    // 3 times a day (~every 4 hours)
    return new Date(now + 4 * 60 * 60 * 1000);
  }

  // GENERAL: 2 times a day (morning & evening, ~every 8 hours)
  return new Date(now + 8 * 60 * 60 * 1000);
}
