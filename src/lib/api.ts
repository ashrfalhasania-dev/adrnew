import { supabase } from "./supabase";

/**
 * Everything the phone reads/writes goes through the permission-checked
 * app_* database functions (tables are closed to the app). Every read is
 * also cached on the device so screens open instantly and keep working
 * offline; fault selections made offline are queued and sent automatically
 * once the connection is back.
 */

export interface Job {
  id: number;
  trackingCode: string | null;
  deviceType: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  serialNumber: string | null;
  status: string;
  technicianStatus: string | null;
  issue: string | null;
  notes: string | null;
  technicalNotes: string | null;
  isUrgent: boolean;
  isApproved: boolean;
  expectedDelivery: string | null;
  dateIn: string | null;
  updatedAt: string | null;
  assignedTo: number | null;
  assignedToName: string | null;
  partsDeducted: boolean;
  /** null unless this person may see customer details */
  customerName: string | null;
  customerPhone: string | null;
  /** null unless this person may see prices */
  finalCost: number | null;
  cost: number | null;
}

export interface FaultSection {
  id: number;
  name: string;
  hasPart: boolean;
  /** managers only */
  partName: string | null;
  stock: number | null;
  /** null when the section has no linked part */
  inStock: boolean | null;
}

export interface JobFault {
  sectionId: number;
  sectionName: string;
  quantity: number;
  partName: string | null;
  stock: number | null;
  inStock: boolean | null;
  username: string | null;
  updatedAt: string | null;
}

export interface JobDetail extends Job {
  faults: JobFault[];
}

export interface FaultEntry {
  sectionId: number;
  quantity: number;
}

// ── device cache ────────────────────────────────────────────────────────

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / unavailable -- the app still works online
  }
}

const JOBS_KEY = "adr.cache.jobs.v1";
const SECTIONS_KEY = "adr.cache.faultSections.v1";
const detailKey = (id: number) => `adr.cache.job.${id}.v1`;
const PENDING_KEY = "adr.pending.faults.v1";

/** Clears everything cached for the signed-in person (called on sign-out). */
export function clearDeviceCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("adr.cache.") || k.startsWith("adr.pending."))) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

export const cachedJobs = () => readCache<Job[]>(JOBS_KEY);
export const cachedFaultSections = () => readCache<FaultSection[]>(SECTIONS_KEY);
export const cachedJobDetail = (id: number) => readCache<JobDetail>(detailKey(id));

// ── reads ───────────────────────────────────────────────────────────────

export async function fetchJobs(): Promise<Job[]> {
  const { data, error } = await supabase.rpc("app_jobs_list");
  if (error) throw error;
  const jobs = (data ?? []) as Job[];
  writeCache(JOBS_KEY, jobs);
  return jobs;
}

export async function fetchFaultSections(): Promise<FaultSection[]> {
  const { data, error } = await supabase.rpc("app_fault_sections");
  if (error) throw error;
  const sections = (data ?? []) as FaultSection[];
  writeCache(SECTIONS_KEY, sections);
  return sections;
}

export async function fetchJobDetail(jobId: number): Promise<JobDetail> {
  const { data, error } = await supabase.rpc("app_job_detail", { p_job_id: jobId });
  if (error) throw error;
  const detail = data as JobDetail;
  writeCache(detailKey(jobId), detail);
  return detail;
}

// ── writes (with offline queue) ─────────────────────────────────────────

const SAVE_ERRORS_AR: Record<string, string> = {
  NO_ACCESS: "هذا الجهاز لم يعد مسنداً لك.",
  PARTS_ALREADY_DEDUCTED: "تم خصم قطع هذا الجهاز من المخزون -- لا يمكن تعديل الأعطال بعد ذلك.",
  SECTION_NOT_FOUND: "أحد الأقسام لم يعد موجوداً -- حدّث الشاشة.",
  SECTION_INACTIVE: "أحد الأقسام أُوقف من الإدارة.",
  BAD_QUANTITY: "العدد يجب أن يكون رقماً صحيحاً.",
};

export type SaveResult =
  | { ok: true; detail: JobDetail }
  | { ok: false; queued: true }
  | { ok: false; queued: false; message: string };

function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
  return /network|fetch|timeout|failed to fetch|abort/i.test(msg);
}

function readPending(): Record<string, FaultEntry[]> {
  return readCache<Record<string, FaultEntry[]>>(PENDING_KEY) ?? {};
}

export function pendingJobIds(): number[] {
  return Object.keys(readPending()).map(Number);
}

/** Saves the job's complete fault list. Offline: queued and retried later. */
export async function saveJobFaults(jobId: number, entries: FaultEntry[]): Promise<SaveResult> {
  const payload = entries.map((e) => ({ section_id: e.sectionId, quantity: e.quantity }));
  try {
    const { data, error } = await supabase.rpc("app_set_job_fault_sections", {
      p_job_id: jobId,
      p_entries: payload,
    });
    if (error) {
      if (isNetworkError(error)) throw error;
      const code = Object.keys(SAVE_ERRORS_AR).find((k) => error.message.includes(k));
      return { ok: false, queued: false, message: code ? SAVE_ERRORS_AR[code] : "تعذّر حفظ الأعطال." };
    }
    const pending = readPending();
    delete pending[String(jobId)];
    writeCache(PENDING_KEY, pending);
    writeCache(detailKey(jobId), data);
    return { ok: true, detail: data as JobDetail };
  } catch (err) {
    if (!isNetworkError(err)) return { ok: false, queued: false, message: "تعذّر حفظ الأعطال." };
    const pending = readPending();
    pending[String(jobId)] = entries;
    writeCache(PENDING_KEY, pending);
    return { ok: false, queued: true };
  }
}

/** Sends every queued fault list; returns how many were delivered. */
export async function flushPendingFaults(): Promise<number> {
  const pending = readPending();
  let sent = 0;
  for (const [jobId, entries] of Object.entries(pending)) {
    const result = await saveJobFaults(Number(jobId), entries);
    if (result.ok) sent++;
    else if (!result.queued) {
      // the server refused it for good (e.g. job reassigned) -- drop it
      const now = readPending();
      delete now[jobId];
      writeCache(PENDING_KEY, now);
    }
  }
  return sent;
}
