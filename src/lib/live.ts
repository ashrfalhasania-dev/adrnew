import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { flushPendingFaults } from "./api";

/**
 * Live updates -- ONE shared connection for the whole app (started by the
 * signed-in layout), fanned out to whichever screens are listening.
 *
 * The database broadcasts a tiny {jobId} message on private channels --
 * 'staff:<my id>' and, for management, 'managers' -- whenever a job or its
 * faults change (desktop, another phone, or the old-system sync). Screens
 * then re-read through the permission-checked functions, so nothing
 * sensitive ever travels over the channel.
 *
 * It also re-syncs on reconnect / return to foreground (sending any fault
 * lists saved while offline first), so nothing is missed while asleep.
 */
type Listener = (jobId: number | null) => void;
const listeners = new Set<Listener>();

function emit(jobId: number | null) {
  listeners.forEach((l) => l(jobId));
}

export function startLive(staffId: number, isManager: boolean): () => void {
  let cancelled = false;
  const channels: RealtimeChannel[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const burst = new Set<number | null>();

  // many changes at once (e.g. the old-system sync) → one refresh
  const notify = (jobId: number | null) => {
    burst.add(jobId);
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const ids = Array.from(burst);
      burst.clear();
      emit(ids.length === 1 ? ids[0] : null);
    }, 400);
  };

  (async () => {
    await supabase.realtime.setAuth();
    if (cancelled) return;
    const topics = [`staff:${staffId}`, ...(isManager ? ["managers"] : [])];
    for (const topic of topics) {
      channels.push(
        supabase
          .channel(topic, { config: { private: true } })
          .on("broadcast", { event: "job_changed" }, (msg) => {
            const id = Number((msg.payload as { jobId?: number } | undefined)?.jobId);
            notify(Number.isFinite(id) ? id : null);
          })
          .subscribe()
      );
    }
  })();

  const resync = async () => {
    await flushPendingFaults().catch(() => 0);
    notify(null);
  };
  const appSub = AppState.addEventListener("change", (s) => {
    if (s === "active") void resync();
  });
  let wasOffline = false;
  const netUnsub = NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (online && wasOffline) void resync();
    wasOffline = !online;
  });

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    channels.forEach((ch) => void supabase.removeChannel(ch));
    appSub.remove();
    netUnsub();
  };
}

/** Calls `onChange(jobId)` when a job changes (null = "refresh everything"). */
export function useJobChanges(onChange: Listener) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    const l: Listener = (id) => ref.current(id);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}

/** Reports connectivity changes (true = online). */
export function subscribeOnline(cb: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((s) => cb(Boolean(s.isConnected && s.isInternetReachable !== false)));
}
