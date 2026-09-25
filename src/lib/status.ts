import { LEGACY_STATUS_MAP, STATUS_LABELS_AR, STATUS_ORDER, type JobStatus } from "@shared/statuses";

/**
 * Same canonical statuses as the desktop (shared/statuses.ts). Unlike the
 * desktop's strict toJobStatus (which throws), the phone must never crash on
 * an unexpected value coming from the old-system sync, so unknown values fall
 * back to "received" and are shown as-is in development.
 */
export function safeStatus(raw: string | null | undefined): JobStatus {
  return LEGACY_STATUS_MAP[(raw ?? "").trim().toLowerCase()] ?? "received";
}

export function statusLabel(status: JobStatus): string {
  return STATUS_LABELS_AR[status];
}

export { STATUS_ORDER };

/** Pill colours (text on tinted background), readable in light and dark. */
export const STATUS_COLORS: Record<JobStatus, string> = {
  received: "#3B82F6",
  diagnosing: "#A855F7",
  waiting_parts: "#F97316",
  waiting_customer: "#06B6D4",
  customer_approved: "#0EA5E9",
  repairing: "#EAB308",
  assembling: "#6366F1",
  ready: "#10B981",
  not_repaired: "#EF4444",
  no_issue: "#F59E0B",
  delivered: "#64748B",
};
