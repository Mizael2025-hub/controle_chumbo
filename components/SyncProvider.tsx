"use client";

import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { startSyncEngine, stopSyncEngine } from "@/lib/syncEngine";

type Props = {
  supabase: SupabaseClient;
  userId: string;
  onSyncError?: (message: string) => void;
  children: React.ReactNode;
};

/** Inicia pull inicial, Realtime e dreno da outbox quando há sessão Supabase. */
export function SyncProvider({ supabase, userId, onSyncError, children }: Props) {
  const onSyncErrorRef = useRef(onSyncError);
  onSyncErrorRef.current = onSyncError;

  useEffect(() => {
    startSyncEngine(supabase, userId, {
      onPushError: (m) => onSyncErrorRef.current?.(m),
    });
    return () => stopSyncEngine();
  }, [supabase, userId]);

  return <>{children}</>;
}
