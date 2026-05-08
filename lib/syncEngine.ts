import type { SupabaseClient } from "@supabase/supabase-js";
import { syncActivityEnter, syncActivityLeave } from "@/lib/syncActivity";
import { db } from "@/lib/db";
import { enqueueUpsert } from "@/lib/syncOutbox";
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
export type StartSyncEngineOptions = {
  /** Após o primeiro pull + flush bem-sucedidos (ex.: reconciliação Dexie × Postgres). */
  afterInitialSync?: () => Promise<void>;
};

type SupabaseLikeError = {
  message?: string;
  code?: string;
  status?: number;
};

function normalizeSupabaseErrorMessage(err: unknown): string {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as SupabaseLikeError).message ?? "")
      : err instanceof Error
        ? err.message
        : String(err);

  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as SupabaseLikeError).code ?? "")
      : "";

  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as SupabaseLikeError).status)
      : NaN;

  const lower = msg.toLowerCase();

  const isPermission =
    code === "42501" ||
    status === 401 ||
    status === 403 ||
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("rls") ||
    lower.includes("not allowed") ||
    lower.includes("violates row-level security");

  if (isPermission) return `Erro de Permissão no Banco de Dados: ${msg || "acesso negado."}`;

  const isConnectionOrKeys =
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("enotfound") ||
    lower.includes("econn") ||
    lower.includes("invalid api key") ||
    lower.includes("jwt") ||
    lower.includes("missing api key");

  if (isConnectionOrKeys) {
    return `Verifique sua conexão ou chaves de API: ${msg || "falha de conexão/autenticação."}`;
  }

  return msg || "Erro desconhecido no Supabase.";
}

/**
 * Re-enfileira (na outbox) tudo que existe localmente e ainda não está na fila.
 * Útil quando RLS/credenciais estavam erradas e a outbox foi descartada após 5 falhas.
 */
export async function forceFullSync(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<void> {
  const nowIso = new Date().toISOString();

  const existing = await db.syncOutbox.toArray();
  const queuedUpserts = new Set<string>();
  for (const r of existing) {
    if (r.op !== "upsert") continue;
    queuedUpserts.add(`${r.entity_table}:${r.entity_id}`);
  }

  const shouldQueue = (table: SyncEntityTable, id: string) =>
    !queuedUpserts.has(`${table}:${id}`);

  // Ordem respeita FKs no Postgres
  const tables: SyncEntityTable[] = [
    "leadAlloys",
    "leadBatches",
    "leadPiles",
    "leadTransactions",
    "leadPileEvents",
  ];

  const isMissingOnServer = async (table: SyncEntityTable, id: string): Promise<boolean> => {
    const name = remoteTableName(table);
    const { data, error } = await supabase
      .from(name)
      .select("id")
      .eq("id", id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw new Error(normalizeSupabaseErrorMessage(error));
    return !data?.id;
  };

  for (const table of tables) {
    switch (table) {
      case "leadAlloys": {
        const rows = await db.leadAlloys.toArray();
        for (const row of rows) {
          if (!row.id) continue;
          if (!shouldQueue("leadAlloys", row.id)) continue;
          const missingUpdated = !row.updated_at;
          const missingServer = await isMissingOnServer("leadAlloys", row.id);
          if (!missingUpdated && !missingServer) continue;
          const next: LeadAlloy = { ...row, updated_at: row.updated_at ?? nowIso };
          if (missingUpdated) await db.leadAlloys.put(next);
          await enqueueUpsert("leadAlloys", next);
        }
        break;
      }
      case "leadBatches": {
        const rows = await db.leadBatches.toArray();
        for (const row of rows) {
          if (!row.id) continue;
          if (!shouldQueue("leadBatches", row.id)) continue;
          const missingUpdated = !row.updated_at;
          const missingServer = await isMissingOnServer("leadBatches", row.id);
          if (!missingUpdated && !missingServer) continue;
          const next: LeadBatch = { ...row, updated_at: row.updated_at ?? nowIso };
          if (missingUpdated) await db.leadBatches.put(next);
          await enqueueUpsert("leadBatches", next);
        }
        break;
      }
      case "leadPiles": {
        const rows = await db.leadPiles.toArray();
        for (const row of rows) {
          if (!row.id) continue;
          if (!shouldQueue("leadPiles", row.id)) continue;
          const missingUpdated = !row.updated_at;
          const missingServer = await isMissingOnServer("leadPiles", row.id);
          if (!missingUpdated && !missingServer) continue;
          const next: LeadPile = { ...row, updated_at: row.updated_at ?? nowIso };
          if (missingUpdated) await db.leadPiles.put(next);
          await enqueueUpsert("leadPiles", next);
        }
        break;
      }
      case "leadTransactions": {
        const rows = await db.leadTransactions.toArray();
        for (const row of rows) {
          if (!row.id) continue;
          if (!shouldQueue("leadTransactions", row.id)) continue;
          const missingUpdated = !row.updated_at;
          const missingServer = await isMissingOnServer("leadTransactions", row.id);
          if (!missingUpdated && !missingServer) continue;
          const next: LeadTransaction = { ...row, updated_at: row.updated_at ?? nowIso };
          if (missingUpdated) await db.leadTransactions.put(next);
          await enqueueUpsert("leadTransactions", next);
        }
        break;
      }
      case "leadPileEvents": {
        const rows = await db.leadPileEvents.toArray();
        for (const row of rows) {
          if (!row.id) continue;
          if (!shouldQueue("leadPileEvents", row.id)) continue;
          const missingUpdated = !row.updated_at;
          const missingServer = await isMissingOnServer("leadPileEvents", row.id);
          if (!missingUpdated && !missingServer) continue;
          const next: LeadPileEvent = { ...row, updated_at: row.updated_at ?? nowIso };
          if (missingUpdated) await db.leadPileEvents.put(next);
          await enqueueUpsert("leadPileEvents", next);
        }
        break;
      }
      default: {
        const _exhaustive: never = table;
        return _exhaustive;
      }
    }
  }
}

/** Liga → lote → monte (ordem compatível com FKs no Postgres). */
const FORCE_FULL_PUSH_TABLES = ["leadAlloys", "leadBatches", "leadPiles"] as const;

function isoOrEmpty(v: string | null | undefined): string {
  return v ?? "";
}

/** Ausente no servidor ou `updated_at` local estritamente maior (LWW). */
function shouldEnqueueFullPush(
  localIso: string | null | undefined,
  remote: { updated_at?: string } | null,
): boolean {
  if (!remote) return true;
  return isoOrEmpty(localIso) > isoOrEmpty(remote.updated_at);
}

type FullPushEntityTable = (typeof FORCE_FULL_PUSH_TABLES)[number];

async function persistStampedAndEnqueue(
  table: FullPushEntityTable,
  row: LeadAlloy | LeadBatch | LeadPile,
): Promise<void> {
  const ts = new Date().toISOString();
  switch (table) {
    case "leadAlloys": {
      const r = row as LeadAlloy;
      const next: LeadAlloy = { ...r, updated_at: r.updated_at ?? ts };
      await db.leadAlloys.put(next);
      await enqueueUpsert("leadAlloys", next);
      return;
    }
    case "leadBatches": {
      const r = row as LeadBatch;
      const next: LeadBatch = { ...r, updated_at: r.updated_at ?? ts };
      await db.leadBatches.put(next);
      await enqueueUpsert("leadBatches", next);
      return;
    }
    case "leadPiles": {
      const r = row as LeadPile;
      const next: LeadPile = { ...r, updated_at: r.updated_at ?? ts };
      await db.leadPiles.put(next);
      await enqueueUpsert("leadPiles", next);
      return;
    }
  }
}

/**
 * Força reenfileiramento (push) de TODO o banco local para o Supabase.
 * - Varre todas as tabelas locais.
 * - Enfileira `upsert` na outbox (evita duplicar se já houver upsert pendente do mesmo id).
 * - "Ignora o limite de 5 tentativas" porque cria tarefas novas (attempt_count=0).
 */
export async function forceFullPush(
  _supabase: SupabaseClient,
  _ownerId: string,
): Promise<void> {
  const nowIso = new Date().toISOString();

  const existing = await db.syncOutbox.toArray();
  const queuedUpserts = new Set<string>();
  for (const r of existing) {
    if (r.op !== "upsert") continue;
    queuedUpserts.add(`${r.entity_table}:${r.entity_id}`);
  }
  const shouldQueue = (table: SyncEntityTable, id: string) =>
    !queuedUpserts.has(`${table}:${id}`);

  // Ordem respeita FKs no Postgres
  const tables: SyncEntityTable[] = [
    "leadAlloys",
    "leadBatches",
    "leadPiles",
    "leadTransactions",
    "leadPileEvents",
  ];

  for (const table of tables) {
    switch (table) {
      case "leadAlloys": {
        const rows = await db.leadAlloys.toArray();
        for (const row of rows) {
          if (!row.id) continue;
          if (!shouldQueue("leadAlloys", row.id)) continue;
          const next: LeadAlloy = { ...row, updated_at: row.updated_at ?? nowIso };
          if (!row.updated_at) await db.leadAlloys.put(next);
          await enqueueUpsert("leadAlloys", next);
        }
        break;
      }
      case "leadBatches": {
        const rows = await db.leadBatches.toArray();
        for (const row of rows) {
          if (!row.id) continue;
          if (!shouldQueue("leadBatches", row.id)) continue;
          const next: LeadBatch = { ...row, updated_at: row.updated_at ?? nowIso };
          if (!row.updated_at) await db.leadBatches.put(next);
          await enqueueUpsert("leadBatches", next);
        }
        break;
      }
      case "leadPiles": {
        const rows = await db.leadPiles.toArray();
        for (const row of rows) {
          if (!row.id) continue;
          if (!shouldQueue("leadPiles", row.id)) continue;
          const next: LeadPile = { ...row, updated_at: row.updated_at ?? nowIso };
          if (!row.updated_at) await db.leadPiles.put(next);
          await enqueueUpsert("leadPiles", next);
        }
        break;
      }
      case "leadTransactions": {
        const rows = await db.leadTransactions.toArray();
        for (const row of rows) {
          if (!row.id) continue;
          if (!shouldQueue("leadTransactions", row.id)) continue;
          const next: LeadTransaction = { ...row, updated_at: row.updated_at ?? nowIso };
          if (!row.updated_at) await db.leadTransactions.put(next);
          await enqueueUpsert("leadTransactions", next);
        }
        break;
      }
      case "leadPileEvents": {
        const rows = await db.leadPileEvents.toArray();
        for (const row of rows) {
          if (!row.id) continue;
          if (!shouldQueue("leadPileEvents", row.id)) continue;
          const next: LeadPileEvent = { ...row, updated_at: row.updated_at ?? nowIso };
          if (!row.updated_at) await db.leadPileEvents.put(next);
          await enqueueUpsert("leadPileEvents", next);
        }
        break;
      }
      default: {
        const _exhaustive: never = table;
        return _exhaustive;
      }
    }
  }
}


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
  syncActivityEnter();
  try {
    for (const table of ALL_ENTITY_TABLES) {
      const name = remoteTableName(table);
      const { data, error } = await supabase.from(name).select("*").eq("owner_id", ownerId);
      if (error) {
        console.error("[syncEngine] pullAllRows", table, error);
        throw new Error(normalizeSupabaseErrorMessage(error));
      }
      for (const raw of data ?? []) {
        await applyMerged(table, raw as Record<string, unknown>);
      }
    }
  } finally {
    syncActivityLeave();
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
      if (error) throw new Error(normalizeSupabaseErrorMessage(error));
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

    if (error) throw new Error(normalizeSupabaseErrorMessage(error));
    if (data) {
      await applyMerged(row.entity_table, data as Record<string, unknown>);
    }

    await db.syncOutbox.delete(row.id);
    return true;
  } catch (e) {
    console.error("[syncEngine] push falhou:", e);
    const msg = normalizeSupabaseErrorMessage(e);
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
  syncActivityEnter();
  try {
    for (let i = 0; i < 500; i++) {
      const progressed = await processOneOutboxRow(supabase, ownerId, callbacks);
      if (!progressed) break;
    }
  } finally {
    syncActivityLeave();
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
  options?: StartSyncEngineOptions,
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
      await options?.afterInitialSync?.();
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
