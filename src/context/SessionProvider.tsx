import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { fetchMyProfile, signOut as authSignOut, type StaffProfile } from "@/lib/auth";
import { clearDeviceCache } from "@/lib/api";

/**
 * Holds who is signed in. Rules:
 *  - The session survives app restarts (persisted + auto-refreshed).
 *  - The profile is re-checked on sign-in, on every return to the
 *    foreground, and on token refresh: if the admin switched the account
 *    off (or changed the password) on the desktop, the database stops
 *    answering for this person and the app signs out immediately.
 *  - A network failure while re-checking never signs anyone out -- only a
 *    definite "this account is not active" answer does.
 */
interface SessionState {
  /** true until the stored session (if any) has been read at startup. */
  loading: boolean;
  session: Session | null;
  profile: StaffProfile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

// Last known profile, so the app opens instantly -- and works offline --
// instead of waiting for the network on every launch.
const PROFILE_CACHE_KEY = "adr.profile.v1";

function readCachedProfile(): StaffProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as StaffProfile) : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: StaffProfile | null): void {
  try {
    if (profile) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // storage unavailable -- the app still works, just without the instant start
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const signOut = useCallback(async () => {
    await authSignOut();
    clearDeviceCache(); // a shared shop phone never shows the previous person's jobs
    writeCachedProfile(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!sessionRef.current) {
      setProfile(null);
      return;
    }
    try {
      const me = await fetchMyProfile();
      if (me) {
        writeCachedProfile(me);
        setProfile(me);
      }
      else await signOut(); // definite answer: account disabled / removed
    } catch {
      // offline or server hiccup -- keep the current profile, try again later
    }
  }, [signOut]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      sessionRef.current = data.session;
      setSession(data.session);
      if (data.session) {
        const cached = readCachedProfile();
        if (cached) {
          setProfile(cached); // open immediately, confirm in the background
          void refreshProfile();
        } else {
          await refreshProfile();
        }
      }
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      sessionRef.current = next;
      setSession(next);
      if (!next) {
        writeCachedProfile(null);
        setProfile(null);
      }
      else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void refreshProfile();
    });

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshProfile();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, [refreshProfile]);

  const value = useMemo(
    () => ({ loading, session, profile, refreshProfile, signOut }),
    [loading, session, profile, refreshProfile, signOut]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
