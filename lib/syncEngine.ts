import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import type {
  LeadAlloy,
  LeadBatch,
  LeadPile,
  LeadPileEvent,
  LeadTransaction,
  SyncEntityTable,
} from "@/lib/types";
import { remoteTableName, fromRemoteRow, toRemotePayload } from "@/lib/syncMapping";

const ALL_ENTITY_TABLES: SyncEntityTable[] = [
  "leadAlloys",
  "leadBatches",
  "leadPiles",
  "leadTransactions",
  "leadPileEvents",
];

const REMOTE_TO_ENTITY: Record<string, SyncEntityTable> = {
  lead_alloys: "leadAlloys",
  lead_batches: "leadBatches",
  lead_piles: "leadPiles",
  lead_transactions: "leadTransactions",
  lead_pile_events: "leadPileEvents",
};

const MAX_PUSH_ATTEMPTS = 5;

export type SyncEngineCallbacks = {
  onPushError?: (message: string) => void;
};

function newerRemoteWins(remoteIso: string, localIso: string | null | undefined): boolean {
  if (!localIso) return true;
  return remoteIso > localIso;
}

async function applyMerged(table: SyncEntityTable, raw: Record<string, unknown>): Promise<void> {
  const ru = String(raw.updated_at ?? "");
  const localObj = fromRemoteRow(table, raw) as
    | LeadAlloy
    | LeadBatch
    | LeadPile
    | LeadTransaction
    | LeadPileEvent;

  switch (table) {
    case "leadAlloys": {
      const row = localObj as LeadAlloy;
      const prev = await db.leadAlloys.get(row.id);
      if (newerRemoteWins(ru, prev?.updated_at)) await db.leadAlloys.put(row);
      return;
    }
    case "leadBatches": {
      const row = localObj as LeadBatch;
      const prev = await db.leadBatches.get(row.id);
      if (newerRemoteWins(ru, prev?.updated_at)) await db.leadBatches.put(row);
      return;
    }
    case "leadPiles": {
      const row = localObj as LeadPile;
      const prev = await db.leadPiles.get(row.id);
      if (newerRemoteWins(ru, prev?.updated_at)) await db.leadPiles.put(row);
      return;
    }
    case "leadTransactions": {
      const row = localObj as LeadTransaction;
      const prev = await db.leadTransactions.get(row.id);
      if (newerRemoteWins(ru, prev?.updated_at)) await db.leadTransactions.put(row);
      return;
    }
    case "leadPileEvents": {
      const row = localObj as LeadPileEvent;
      const prev = await db.leadPileEvents.get(row.id);
      if (newerRemoteWins(ru, prev?.updated_at)) await db.leadPileEvents.put(row);
      return;
    }
    default: {
      const _e: never = table;
      return _e;
    }
  }
}

async function deleteLocal(table: SyncEntityTable, id: string): Promise<void> {
  switch (table) {
    case "leadAlloys":
      await db.leadAlloys.delete(id);
      return;
    case "leadBatches":
      await db.leadBatches.delete(id);
      return;
    case "leadPiles":
      await db.leadPiles.delete(id);
      return;
    case "leadTransactions":
      await db.leadTransactions.delete(id);
      return;
    case "leadPileEvents":
      await db.leadPileEvents.delete(id);
      return;
    default: {
      const _e: never = table;
      return _e;
    }
  }
}

export async function pullAllRows(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<void> {
  for (const table of ALL_ENTITY_TABLES) {
    const name = remoteTableName(table);
    const { data, error } = await supabase.from(name).select("*").eq("owner_id", ownerId);
    if (error) {
      console.error("[syncEngine] pullAllRows", table, error);
      throw new Error(error.message);
    }
    for (const raw of data ?? []) {
      await applyMerged(table, raw as Record<string, unknown>);
    }
  }
}

async function processOneOutboxRow(
  supabase: SupabaseClient,
  ownerId: string,
  callbacks?: SyncEngineCallbacks,
): Promise<boolean> {
  const row = await db.syncOutbox.orderBy("id").first();
  if (!row?.id) return false;

  const remoteName = remoteTableName(row.entity_table);

  try {
    if (row.op === "delete") {
      const { error } = await supabase.from(remoteName).delete().eq("id", row.entity_id);
      if (error) throw new Error(error.message);
      await db.syncOutbox.delete(row.id);
      return true;
    }

    const parsed = JSON.parse(row.payload_json) as Record<string, unknown>;
    const payload = toRemotePayload(row.entity_table, parsed, ownerId);

    const { data, error } = await supabase
      .from(remoteName)
      .upsert(payload)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) {
      await applyMerged(row.entity_table, data as Record<string, unknown>);
    }

    await db.syncOutbox.delete(row.id);
    return true;
  } catch (e) {
    console.error("[syncEngine] push falhou:", e);
    const msg = e instanceof Error ? e.message : String(e);
    const nextAttempt = (row.attempt_count ?? 0) + 1;
    await db.syncOutbox.update(row.id, {
      attempt_count: nextAttempt,
      last_error: msg,
    });
    if (nextAttempt >= MAX_PUSH_ATTEMPTS) {
      await db.syncOutbox.delete(row.id);
      callbacks?.onPushError?.(
        `Sync: falha após ${MAX_PUSH_ATTEMPTS} tentativas (${row.entity_table} ${row.entity_id}): ${msg}`,
      );
    }
    return false;
  }
}

export async function flushOutbox(
  supabase: SupabaseClient,
  ownerId: string,
  callbacks?: SyncEngineCallbacks,
): Promise<void> {
  for (let i = 0; i < 500; i++) {
    const progressed = await processOneOutboxRow(supabase, ownerId, callbacks);
    if (!progressed) break;
  }
}

let cleanupFn: (() => void) | null = null;

export function stopSyncEngine(): void {
  cleanupFn?.();
  cleanupFn = null;
}

export function startSyncEngine(
  supabase: SupabaseClient,
  ownerId: string,
  callbacks?: SyncEngineCallbacks,
): void {
  stopSyncEngine();

  const onOnline = () => {
    void flushOutbox(supabase, ownerId, callbacks);
  };

  const channel = supabase.channel(`sync:${ownerId}`);

  for (const name of Object.keys(REMOTE_TO_ENTITY)) {
    const entityTable = REMOTE_TO_ENTITY[name];
    if (!entityTable) continue;
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: name,
        filter: `owner_id=eq.${ownerId}`,
      },
      (payload) => {
        void (async () => {
          try {
            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as Record<string, unknown> | null;
              const id = oldRow?.id as string | undefined;
              if (id && entityTable) await deleteLocal(entityTable, id);
              return;
            }
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | null;
            if (raw && entityTable) await applyMerged(entityTable, raw);
          } catch (err) {
            console.error("[syncEngine] realtime handler:", err);
          }
        })();
      },
    );
  }

  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR") {
      console.error("[syncEngine] canal Realtime com erro");
    }
  });

  window.addEventListener("online", onOnline);

  void (async () => {
    try {
      await pullAllRows(supabase, ownerId);
      await flushOutbox(supabase, ownerId, callbacks);
    } catch (e) {
      console.error("[syncEngine] pull inicial:", e);
      callbacks?.onPushError?.(e instanceof Error ? e.message : String(e));
    }
  })();

  cleanupFn = () => {
    window.removeEventListener("online", onOnline);
    void supabase.removeChannel(channel);
  };
}
