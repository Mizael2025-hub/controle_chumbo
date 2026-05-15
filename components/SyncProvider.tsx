"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  flushOutbox,
  forceFullPush,
  isNetworkError,
  resetOutboxForReconnect,
  startSyncEngine,
  stopSyncEngine,
} from "@/lib/syncEngine";
import { notifyOutboxMayHaveNewWork } from "@/lib/syncFlushScheduler";

type Props = {
  supabase: SupabaseClient;
  userId: string;
  onSyncError?: (message: string) => void;
  /** Limpa mensagens residuais de sync na UI (ex.: ErrorBanner via syncFatal). */
  onSyncRecovered?: () => void;
  children: React.ReactNode;
};

const SESSION_FORCE_PUSH_KEY = "lead_force_full_push_v1";

function readNavigatorOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/** Inicia pull inicial, Realtime e dreno da outbox quando há sessão Supabase. */
export function SyncProvider({ supabase, userId, onSyncError, onSyncRecovered, children }: Props) {
  const onSyncErrorRef = useRef(onSyncError);
  onSyncErrorRef.current = onSyncError;
  const onSyncRecoveredRef = useRef(onSyncRecovered);
  onSyncRecoveredRef.current = onSyncRecovered;

  const [isOnline, setIsOnline] = useState(readNavigatorOnline);

  useEffect(() => {
    const onOffline = () => {
      setIsOnline(false);
    };

    const onOnline = () => {
      setIsOnline(true);
      onSyncRecoveredRef.current?.();
      void (async () => {
        await resetOutboxForReconnect();
        try {
          await flushOutbox(supabase, userId, {
            onPushError: (m) => onSyncErrorRef.current?.(m),
          });
        } catch (e) {
          if (!isNetworkError(e)) {
            console.error("[SyncProvider] flush ao voltar online", e);
            onSyncErrorRef.current?.(e instanceof Error ? e.message : String(e));
          }
        }
      })();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [supabase, userId]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!isOnline) return;
      notifyOutboxMayHaveNewWork();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [userId, isOnline]);

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
          if (!readNavigatorOnline()) return;
          try {
            await forceFullPush(supabase, userId);
            await flushOutbox(supabase, userId, {
              onPushError: (m) => onSyncErrorRef.current?.(m),
            });
            sessionStorage.setItem(sessionKey, "1");
          } catch (e) {
            if (isNetworkError(e)) return;
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
