// AUTO-COPIED from app/shared/statuses.ts by scripts/sync-shared.js -- edit the original, not this copy.
/**
 * Job status system for ADR Pro v2.
 *
 * This module is the single source of truth for the "حالة الطلب" (job
 * status) system, replacing the old system's status handling that was
 * spread across `js/status-map.js` and inline checks in `js/modules/jobs.js`.
 * It follows the same documentation convention as ./permissions.ts: every
 * canonical status names the legacy raw `jobs.status` text value(s) it
 * replaces, so a reviewer can diff behavior against the old system directly.
 *
 * DECISIONS THIS FILE IMPLEMENTS (see the plan doc's "القرارات النهائية من
 * نقاش جرد شاشة الطلبات" and "تنفيذ: مصير طلبات \"مرتجع\" و\"dm\"" sections
 * for the full discussion):
 *
 * 1. "مرتجع" (RETURNED) is removed permanently. The old system had 12
 *    canonical statuses; the new one has 11. The 5 jobs that were still
 *    sitting in `status = 'returned'` in the local dev database were
 *    remapped to RECEIVED (received) rather than invented a "returned"
 *    concept in the new system.
 *
 * 2. The raw value `pending` and the raw value `received` are THE SAME
 *    canonical status (RECEIVED / "تم الاستلام"), not two different
 *    stages. Evidence found in the local dev database: every `pending` row
 *    was created between 2026-08-25 and 2026-09-17 (i.e. very recently),
 *    while `received` rows stop appearing after 2026-09-10 -- the old
 *    system evidently renamed the literal it writes for a brand-new job's
 *    initial status at some point, without a data migration. Confirmed
 *    with the user before writing this file (2026-09-18).
 *
 * 3. The 8 "dm" (fake Direct-Message placeholder) jobs are NOT a status in
 *    this system at all -- they were a hidden staff-chat hack, not real
 *    repair jobs, and were deleted outright from the local dev database
 *    (see the plan doc). `LEGACY_STATUS_MAP` intentionally has no entry for
 *    `"dm"`; a row with that raw value should never reach this code again.
 */

export type JobStatus =
  | "received"
  | "diagnosing"
  | "waiting_parts"
  | "waiting_customer"
  | "customer_approved"
  | "repairing"
  | "assembling"
  | "ready"
  | "not_repaired"
  | "no_issue"
  | "delivered";

/**
 * Workflow order, for status dropdowns/steppers in the UI. This is a
 * reasonable default lifecycle, not an enforced state machine -- the old
 * system let staff set any status at any time (no transition guardrails),
 * and the new system preserves that flexibility.
 */
export const STATUS_ORDER: JobStatus[] = [
  "received",
  "diagnosing",
  "waiting_parts",
  "waiting_customer",
  "customer_approved",
  "repairing",
  "assembling",
  "ready",
  "not_repaired",
  "no_issue",
  "delivered",
];

export const STATUS_LABELS_AR: Record<JobStatus, string> = {
  received: "تم الاستلام",
  diagnosing: "التشخيص",
  waiting_parts: "انتظار قطع",
  waiting_customer: "انتظار العميل",
  customer_approved: "موافقة العميل",
  repairing: "الإصلاح",
  assembling: "التجميع",
  ready: "جاهز",
  not_repaired: "لم يُصلَّح",
  no_issue: "لا يوجد عطل",
  delivered: "تم التسليم",
};

/**
 * Statuses that mean the job is finished and off the active worklist
 * (used for default list filtering / "متأخر" overdue calculations, which
 * should never apply to a job that already reached one of these).
 */
export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  "not_repaired",
  "no_issue",
  "delivered",
]);

/**
 * Maps every raw `jobs.status` text value ever seen in the production data
 * (as of the local dev database snapshot taken 2026-09) to its canonical
 * status. `received` and `pending` intentionally share one entry -- see
 * decision #2 above. There is no entry for `returned` or `dm`: those rows
 * were fixed up directly in the database (remapped / deleted) rather than
 * carried forward as a runtime compatibility shim, since new code should
 * never see them again.
 */
export const LEGACY_STATUS_MAP: Record<string, JobStatus> = {
  received: "received",
  pending: "received",
  diagnosing: "diagnosing",
  waiting_parts: "waiting_parts",
  waiting_customer: "waiting_customer",
  customer_approved: "customer_approved",
  repairing: "repairing",
  assembling: "assembling",
  ready: "ready",
  not_repaired: "not_repaired",
  no_issue: "no_issue",
  delivered: "delivered",
};

/**
 * Converts a raw `jobs.status` database value into a canonical JobStatus.
 * Throws on anything unrecognized rather than silently falling back --
 * an unmapped status is exactly the kind of thing that turned out to be
 * the "dm" anomaly last time, and deserves a loud failure instead of
 * quietly mis-displaying a job.
 */
export function toJobStatus(raw: string): JobStatus {
  const mapped = LEGACY_STATUS_MAP[raw];
  if (!mapped) {
    throw new Error(`Unrecognized job status value: "${raw}"`);
  }
  return mapped;
}

export function jobStatusLabel(status: JobStatus): string {
  return STATUS_LABELS_AR[status];
}

/**
 * Reverse of LEGACY_STATUS_MAP: every raw `jobs.status` text value that
 * should match a given canonical status. Needed because the database still
 * stores the raw legacy strings (no migration was run to rewrite them) --
 * a query filtering "جاهز" jobs has to filter on `status = any(rawValuesFor("ready"))`,
 * and a filter on RECEIVED must match both `received` and `pending` rows.
 */
const RAW_VALUES_BY_STATUS: Record<JobStatus, string[]> = (() => {
  const map = Object.fromEntries(STATUS_ORDER.map((s) => [s, [] as string[]])) as Record<
    JobStatus,
    string[]
  >;
  for (const [raw, status] of Object.entries(LEGACY_STATUS_MAP)) {
    map[status].push(raw);
  }
  return map;
})();

export function rawValuesForStatus(status: JobStatus): string[] {
  return RAW_VALUES_BY_STATUS[status];
}
