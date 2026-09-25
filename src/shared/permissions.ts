// AUTO-COPIED from app/shared/permissions.ts by scripts/sync-shared.js -- edit the original, not this copy.
/**
 * Authorization rules for ADR Pro v2.
 *
 * This module is a deliberate, faithful, TypeScript re-implementation of the
 * Row Level Security (RLS) policies that protect the production Supabase
 * database (project pobcfmfdqaolmebxrkls). The original policies live in
 * ../supabase/migrations/00000000000001_initial_schema.sql (lines ~540-601).
 *
 * WHY re-implement RLS here instead of talking to Postgres through
 * PostgREST/RLS the way the current desktop app does?
 *   - Electron's main process is already a trusted, single-tenant backend
 *     (it holds the one DB credential for the one signed-in user's session);
 *     there is no multi-tenant boundary for RLS to defend inside it.
 *   - Permission logic as typed, unit-testable TypeScript functions is far
 *     easier to audit and to keep in sync with feature code than SQL policy
 *     strings evaluated invisibly per-row inside Postgres.
 *   - It removes the dependency on running a local PostgREST/GoTrue stack
 *     (which needs Docker) just to get RLS enforcement in local development.
 *
 * Every function below names the exact source policy it re-implements, so
 * a reviewer can diff behavior against the original SQL directly. Nothing
 * here should silently diverge from that source without updating both the
 * comment and supabase/migrations/00000000000001_initial_schema.sql.
 */

export type Role = "admin" | "manager" | "supervisor" | "employee" | "technician";

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
  canSeePrice: boolean;
  canSeeCustomer: boolean;
}

const PRICE_VISIBLE_ROLES: Role[] = ["admin", "manager", "supervisor"];
const CUSTOMER_WRITE_ROLES: Role[] = ["admin", "manager", "supervisor"];
const JOBS_ALL_ROLES: Role[] = ["admin", "manager", "supervisor"];
const EXPENSES_ADMIN_ROLES: Role[] = ["admin", "manager"];
const USERS_SELECT_ROLES: Role[] = ["admin", "manager"];
const JOB_PROFIT_ROLES: Role[] = ["admin", "manager"];
const PAYMENT_AUDIT_SELECT_ROLES: Role[] = ["admin", "manager"];
const MESSAGES_DELETE_OTHERS_ROLES: Role[] = ["admin", "manager"];

/** Source: auth_can_see_price() -- select can_see_price = 1 from users ... */
export function canSeePrice(user: SessionUser): boolean {
  return user.canSeePrice || PRICE_VISIBLE_ROLES.includes(user.role);
}

/** Source: auth_can_see_customer() -- select can_see_customer = 1 from users ... */
export function canSeeCustomer(user: SessionUser): boolean {
  return user.canSeeCustomer;
}

/** Source: customers_write_auth -- for all using (role = any (admin,manager,supervisor)) */
export function canWriteCustomers(user: SessionUser): boolean {
  return CUSTOMER_WRITE_ROLES.includes(user.role);
}

/** Source: expenses_admin -- for all using (role = any (admin,manager)) */
export function canManageExpenses(user: SessionUser): boolean {
  return EXPENSES_ADMIN_ROLES.includes(user.role);
}

/**
 * Source: users_select_admin -- for select using (role = any (admin,manager)).
 * Gates whether the "المستخدمون والصلاحيات" section of the Settings screen
 * shows the full roster at all (view-only for a manager -- see canManageUsers
 * below for who can actually write).
 */
export function canViewAllUsers(user: SessionUser): boolean {
  return USERS_SELECT_ROLES.includes(user.role);
}

/**
 * Source: users_all_admin -- for all using (role = 'admin').
 *
 * DELIBERATE DEPARTURE (flagged, same pattern as parts_auth for Inventory):
 * the real schema also carries `users_upsert_any_authenticated` -- using
 * ((auth.jwt() ->> 'sub') is not null), i.e. literally any logged-in account
 * could insert/update any row in `users`, including changing someone else's
 * role or resetting their password. That is never mirrored here. Every write
 * in electron/users.ts (create/edit/deactivate/reset password) is
 * restricted to admin only, matching the narrower `users_all_admin` policy
 * instead -- the same reasoning already applied to Inventory's parts_auth
 * departure and to Settings (electron/settings.ts) more broadly.
 */
export function canManageUsers(user: SessionUser): boolean {
  return user.role === "admin";
}

/**
 * Store info ("المحل والعلامة التجارية") and security/page-lock settings
 * ("الأمان وقفل الصفحات") have NO real RLS precedent at all -- the legacy
 * app kept them in a local-only SQLite `settings` table that was never part
 * of the migrated cloud schema (see electron/settings.ts's module doc
 * comment). Restricted to admin only, same reasoning as canManageUsers: this
 * is shop-identity/security configuration, not routine day-to-day data, so
 * the safe default is the same admin-only gate already used for `users`
 * writes rather than the broader admin/manager/supervisor "financial data"
 * gate used elsewhere (canManageAllJobs).
 */
export function canManageAppSettings(user: SessionUser): boolean {
  return user.role === "admin";
}

/**
 * The "التقارير" (Reports) screen -- financial overview, technician
 * performance, status breakdown, expense breakdown, PDF/CSV export -- has
 * NO real RLS precedent either (it is a new aggregation layer, not a table).
 * Restricted to admin only, per the user's own explicit instruction when
 * this feature was commissioned ("نفذ كل ماسبق بالنسبه للصلاحيه فقط
 * الادمن" -- implement all of the above, and for permissions: admin only).
 * This is deliberately stricter than canManageAllJobs/canSeeJobProfit
 * (admin+manager): reports surface full shop-wide financials and per-employee
 * performance rankings, treated the same as canManageUsers/
 * canManageAppSettings above.
 */
export function canViewReports(user: SessionUser): boolean {
  return user.role === "admin";
}

/**
 * Source: job_pricing_priced_roles / transactions_read_priced (combined with
 * auth_can_see_price()) -- using (auth_can_see_price() or role = any (admin,manager,supervisor))
 */
export function canSeeJobPricing(user: SessionUser): boolean {
  return canSeePrice(user) || JOBS_ALL_ROLES.includes(user.role);
}

/** Source: jobs_all_admin -- for all using (role = any (admin,manager,supervisor)) */
export function canManageAllJobs(user: SessionUser): boolean {
  return JOBS_ALL_ROLES.includes(user.role);
}

/**
 * Source: jobs_write_tech -- for update using
 *   (assigned_to = auth.uid() or role = any (admin,manager,supervisor))
 */
export function canWriteJob(user: SessionUser, job: { assignedTo: number | null }): boolean {
  return job.assignedTo === user.id || JOBS_ALL_ROLES.includes(user.role);
}

/**
 * Source: messages_delete_own -- for delete using
 *   (user_id = auth.uid() or role = any (admin,manager))
 */
export function canDeleteMessage(user: SessionUser, message: { userId: number }): boolean {
  return message.userId === user.id || MESSAGES_DELETE_OTHERS_ROLES.includes(user.role);
}

/** Source: job_profit_summary_admin -- for all using (role = any (admin,manager)) */
export function canSeeJobProfit(user: SessionUser): boolean {
  return JOB_PROFIT_ROLES.includes(user.role);
}

/** Source: payment_audit_select_admin -- for select using (role = any (admin,manager)) */
export function canReadPaymentAudit(user: SessionUser): boolean {
  return PAYMENT_AUDIT_SELECT_ROLES.includes(user.role);
}

/** Source: transactions_write_admin -- for all using (role = 'admin') */
export function canWriteTransactionsUnrestricted(user: SessionUser): boolean {
  return user.role === "admin";
}

/**
 * Source: users_all_admin / users_select_admin / users_select_self --
 * admin: full access; manager: read all; anyone: read/update self.
 */
export function canReadUser(user: SessionUser, targetUserId: number): boolean {
  if (user.role === "admin") return true;
  if (USERS_SELECT_ROLES.includes(user.role)) return true;
  return targetUserId === user.id;
}

export function canWriteUser(user: SessionUser, targetUserId: number): boolean {
  if (user.role === "admin") return true;
  return targetUserId === user.id; // users_update_self: self-update only, role field is immutable (see users_update_self's WITH CHECK)
}
