"use client";

import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { flushOutbox, forceFullPush, startSyncEngine, stopSyncEngine } from "@/lib/syncEngine";

type Props = {
  supabase: SupabaseClient;
  userId: string;
  onSyncError?: (message: string) => void;
  children: React.ReactNode;
};

const SESSION_FORCE_PUSH_KEY = "lead_force_full_push_v1";

/** Inicia pull inicial, Realtime e dreno da outbox quando há sessão Supabase. */
export function SyncProvider({ supabase, userId, onSyncError, children }: Props) {
  const onSyncErrorRef = useRef(onSyncError);
  onSyncErrorRef.current = onSyncError;

  useEffect(() => {
    const sessionKey = `${SESSION_FORCE_PUSH_KEY}_${userId}`;
    startSyncEngine(
      supabase,
      userId,
      {
        onPushError: (m) => onSyncErrorRef.current?.(m),
      },
      {
        afterInitialSync: async () => {
          if (typeof sessionStorage === "undefined") return;
          if (sessionStorage.getItem(sessionKey)) return;
          try {
            await forceFullPush(supabase, userId);
            await flushOutbox(supabase, userId, {
              onPushError: (m) => onSyncErrorRef.current?.(m),
            });
            sessionStorage.setItem(sessionKey, "1");
          } catch (e) {
            console.error("[SyncProvider] afterInitialSync", e);
            onSyncErrorRef.current?.(e instanceof Error ? e.message : String(e));
          }
        },
      },
    );
    return () => stopSyncEngine();
  }, [supabase, userId]);

  return <>{children}</>;
}
