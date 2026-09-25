// AUTO-COPIED from app/shared/payments.ts by scripts/sync-shared.js -- edit the original, not this copy.
/**
 * Payment model for ADR Pro v2's "تحديث حالة الجهاز والدفع" (status +
 * payment update) screen. Pure, dependency-free logic (same convention as
 * ./statuses.ts and ./permissions.ts) so both electron/jobs.ts and the
 * renderer import this one definition directly instead of keeping two
 * copies in sync.
 *
 * The old system's screen had a real, working payment_status (paid/unpaid)
 * but a completely broken partial-payment split -- its "جزئي" checkbox
 * called an undefined `togglePartialPaymentInput()` function, so no partial
 * amount was ever actually recorded anywhere. This is the real, working
 * replacement, per the user's explicit decision (2026-09-18): `paid_amount`
 * (see electron/db.ts's ensureSchema) is a genuine running total the staff
 * enters, and `payment_status` is ALWAYS derived from it -- never a
 * separate manual toggle that can drift out of sync with the real numbers.
 */

/**
 * "debt" added 2026-09-23: this is the real signal the legacy system (and
 * its still-live "الديون والمالية" screen) uses to flag a job as actual,
 * tracked customer debt -- see electron/customers.ts's module doc comment
 * for the investigation. It's deliberately kept in the same PaymentMethod
 * union rather than a separate boolean: it answers the same UI question
 * ("طريقة الدفع؟") with "لم يُدفع بعد -- دين على الزبون" as one of the
 * choices, exactly like the legacy screen's own dropdown. `paymentStatus`
 * keeps working exactly as before (derived from cost vs paid_amount) --
 * "debt" only marks that a job with a remaining balance should count
 * toward the customer's tracked debt.
 */
export const PAYMENT_METHODS = ["cash", "whish_money", "bank_transfer", "card", "debt"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS_AR: Record<PaymentMethod, string> = {
  cash: "نقدًا",
  whish_money: "Whish Money",
  bank_transfer: "تحويل بنكي",
  card: "بطاقة",
  debt: "دين على الزبون",
};

/**
 * The subset offered wherever money is actually being received right now
 * (recording a customer's payment against their debt, a salary payment, an
 * expense) -- "دين" makes no sense as an answer to "كيف تم الدفع؟" in any of
 * those, only as the answer to "هل تم الدفع؟" on a job (JobStatusModal,
 * which deliberately keeps using the full PAYMENT_METHODS list instead).
 */
export const CASH_PAYMENT_METHODS = PAYMENT_METHODS.filter((m): m is Exclude<PaymentMethod, "debt"> => m !== "debt");

export type PaymentStatus = "unpaid" | "partial" | "paid";

export const PAYMENT_STATUS_LABELS_AR: Record<PaymentStatus, string> = {
  unpaid: "غير مدفوع",
  partial: "مدفوع جزئيًا",
  paid: "مدفوع بالكامل",
};

/**
 * `cost <= 0` reads as "no price recorded" rather than "nothing owed, so
 * automatically paid": real data showed 797 jobs with cost=0 already
 * explicitly marked "paid" (free/warranty work closed out on purpose)
 * sitting alongside plenty of other cost=0 jobs that are NOT marked paid --
 * so a zero-cost job only flips to "paid" once an actual payment is logged
 * against it, exactly like any other job.
 */
export function derivePaymentStatus(cost: number, paidAmount: number): PaymentStatus {
  if (cost <= 0) return paidAmount > 0 ? "paid" : "unpaid";
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount >= cost) return "paid";
  return "partial";
}
