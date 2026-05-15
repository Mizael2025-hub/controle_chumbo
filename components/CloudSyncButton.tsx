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

export type CloudVisualState = "hidden" | "idle" | "syncing" | "synced" | "pending" | "offline" | "error";

type Props = {
  onSync: () => Promise<void>;
  manualBusy?: boolean;
  /** Última tentativa manual falhou (ícone vermelho até próximo sucesso). */
  lastFailed?: boolean;
};

/** Ícone de nuvem: cor indica estado; toque força sincronização. */
export function CloudSyncButton({ onSync, manualBusy = false, lastFailed = false }: Props) {
  const { userId, supabase } = useAuthUser();
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const pending = useLiveQuery(() => db.syncOutbox.count(), []) ?? 0;
  const [syncing, setSyncing] = useState(() => syncActivityIsBusy());

  useEffect(() => {
    return subscribeSyncActivity(() => setSyncing(syncActivityIsBusy()));
  }, []);

  if (!userId || !supabase) return null;

  const busy = manualBusy || syncing;

  let visual: CloudVisualState = "synced";
  if (lastFailed && !busy) visual = "error";
  else if (!isOnline) visual = "offline";
  else if (busy) visual = "syncing";
  else if (pending > 0) visual = "pending";
  else visual = "synced";

  const title =
    visual === "error"
      ? "Falha na última sincronização. Toque para tentar de novo."
      : visual === "offline"
        ? `Sem rede.${pending > 0 ? ` ${pending} na fila.` : ""} Toque para tentar quando houver conexão.`
        : visual === "syncing"
          ? "Sincronizando com a nuvem…"
          : visual === "pending"
            ? `${pending} alteração(ões) aguardando envio. Toque para sincronizar.`
            : "Sincronizado com a nuvem. Toque para sincronizar agora.";

  const ring =
    visual === "error"
      ? "border-red-400 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-950/60 dark:text-red-400"
      : visual === "offline"
        ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
        : visual === "syncing"
          ? "border-emerald-400 bg-emerald-50 text-emerald-600 animate-pulse dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
          : visual === "pending"
            ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-300"
            : "border-emerald-400 bg-emerald-50 text-emerald-600 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400";

  return (
    <button
      type="button"
      disabled={manualBusy}
      title={title}
      aria-label={title}
      onClick={() => void onSync()}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-transform active:scale-95 disabled:opacity-60 ${ring}`}
    >
      {busy ? (
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
          <path d="M21 12a9 9 0 00-9-9" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path
            d="M18 10h-1.26A8 8 0 109 16.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {visual === "synced" && (
            <path d="M9 16l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
          )}
          {visual === "error" && (
            <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          )}
        </svg>
      )}
    </button>
  );
}
