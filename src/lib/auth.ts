import * as Crypto from "expo-crypto";
import type { Role, SessionUser } from "@shared/permissions";
import { supabase } from "./supabase";

/**
 * Staff sign in with the SAME username/password as the desktop app. Each
 * employee has a mirrored Supabase Auth account whose email is derived from
 * the username -- the exact same formula as public.staff_login_email() in
 * the database (supabase/migrations/..._staff_auth_bridge.sql):
 *   "u" + first 40 hex chars of sha256(lower(trim(username))) + "@staff.adr-pro.app"
 * so logging in is a single direct call, with no extra lookup server.
 */
export async function staffLoginEmail(username: string): Promise<string> {
  const normalized = username.trim().toLowerCase();
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalized, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  return `u${hex.slice(0, 40)}@staff.adr-pro.app`;
}

export interface StaffProfile extends SessionUser {
  fullName: string | null;
  avatarUrl: string | null;
}

export type SignInError = "invalid_credentials" | "network" | "disabled" | "unknown";

export async function signIn(username: string, password: string): Promise<{ ok: true } | { ok: false; error: SignInError }> {
  try {
    const email = await staffLoginEmail(username);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return { ok: true };
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("banned")) return { ok: false, error: "disabled" };
    if (msg.includes("invalid login") || error.status === 400) return { ok: false, error: "invalid_credentials" };
    if (msg.includes("network") || msg.includes("fetch")) return { ok: false, error: "network" };
    return { ok: false, error: "unknown" };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" });
}

/** The signed-in employee's own profile; null when the account is disabled or unknown. */
export async function fetchMyProfile(): Promise<StaffProfile | null> {
  const { data, error } = await supabase.rpc("app_me");
  if (error) throw error;
  if (!data) return null;
  const p = data as {
    id: number;
    username: string;
    fullName: string | null;
    role: Role;
    avatarUrl: string | null;
    canSeePrice: boolean;
    canSeeCustomer: boolean;
  };
  return { ...p, id: Number(p.id) };
}

export const SIGN_IN_ERRORS_AR: Record<SignInError, string> = {
  invalid_credentials: "اسم المستخدم أو كلمة المرور غير صحيحة.",
  disabled: "هذا الحساب موقوف. تواصل مع الإدارة.",
  network: "لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مجدداً.",
  unknown: "تعذّر تسجيل الدخول. حاول مجدداً.",
};

export const ROLE_LABELS_AR: Record<Role, string> = {
  admin: "مدير النظام",
  manager: "مدير",
  supervisor: "مشرف",
  technician: "فني",
  employee: "موظف",
};
