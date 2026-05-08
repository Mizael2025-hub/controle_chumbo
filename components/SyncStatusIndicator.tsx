"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useAuthUser } from "@/components/AuthUserContext";
import { subscribeSyncActivity, syncActivityIsBusy } from "@/lib/syncActivity";

function subscribeOnline(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getOnlineSnapshot(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

function getServerOnlineSnapshot(): boolean {
  return true;
}

type Mode = "local_only" | "offline" | "syncing" | "pending" | "synced";

/** Ícone fixo discreto: estado da nuvem / fila local. */
export function SyncStatusIndicator() {
  const { userId, supabase } = useAuthUser();
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const pending = useLiveQuery(() => db.syncOutbox.count(), []) ?? 0;
  const [syncing, setSyncing] = useState(() => syncActivityIsBusy());

  useEffect(() => {
    return subscribeSyncActivity(() => {
      setSyncing(syncActivityIsBusy());
    });
  }, []);

  const cloud = Boolean(userId && supabase);

  let mode: Mode;
  if (!cloud) mode = "local_only";
  else if (!isOnline) mode = "offline";
  else if (syncing) mode = "syncing";
  else if (pending > 0) mode = "pending";
  else mode = "synced";

  const title =
    mode === "local_only"
      ? "Dados apenas neste aparelho (sem nuvem ou sem sessão)."
      : mode === "offline"
        ? `Sem rede.${pending > 0 ? ` ${pending} alteração(ões) na fila.` : ""} Envio quando voltar online.`
        : mode === "syncing"
          ? "Sincronizando com a nuvem…"
          : mode === "pending"
            ? `Fila: ${pending} pendente(s) para enviar.`
            : "Sincronizado com a nuvem.";

  const base =
    "pointer-events-auto fixed bottom-4 right-4 z-40 flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100";

  const palette =
    mode === "local_only"
      ? "border-zinc-200/80 bg-white/70 text-zinc-400 opacity-60 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-500"
      : mode === "offline"
        ? "border-amber-200/90 bg-amber-50/90 text-amber-800 opacity-80 dark:border-amber-900 dark:bg-amber-950/80 dark:text-amber-200"
        : mode === "syncing"
          ? "border-sky-200/90 bg-sky-50/90 text-sky-700 opacity-90 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-200"
          : mode === "pending"
            ? "border-orange-200/90 bg-orange-50/90 text-orange-800 opacity-90 dark:border-orange-900 dark:bg-orange-950/80 dark:text-orange-200"
            : "border-emerald-200/90 bg-emerald-50/90 text-emerald-800 opacity-75 dark:border-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200";

  return (
    <div className={`${base} ${palette}`} title={title} role="status" aria-label={title}>
      {mode === "local_only" && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 2a5 5 0 015 5v3h1a2 2 0 012 2v6H4v-6a2 2 0 012-2h1V7a5 5 0 015-5z" />
          <path d="M9 21h6" strokeLinecap="round" />
        </svg>
      )}
      {mode === "offline" && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M2 8h4l2-3h8l2 3h4" strokeLinecap="round" />
          <path d="M4 11v9h16v-9" />
          <path d="M3 3l18 18" strokeLinecap="round" />
        </svg>
      )}
      {mode === "syncing" && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
          <path d="M21 12a9 9 0 00-9-9" strokeLinecap="round" />
        </svg>
      )}
      {mode === "pending" && (
        <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" strokeLinecap="round" />
          </svg>
          {pending > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-[14px] items-center justify-center rounded-full bg-orange-600 px-[3px] text-[9px] font-bold leading-none text-white">
              {pending > 9 ? "9+" : pending}
            </span>
          )}
        </span>
      )}
      {mode === "synced" && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}
