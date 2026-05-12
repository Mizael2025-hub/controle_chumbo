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
import { deleteLocalBatchCascade, deleteLocalPileCascade } from "@/lib/cascadeLocalDelete";
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

type SupabaseLikeError = {
  message?: string;
  code?: string;
  status?: number;
};

const MAX_PUSH_ATTEMPTS = 5;

const TRANSIENT_PUSH_RETRIES = 4;
const TRANSIENT_PUSH_BASE_DELAY_MS = 600;

const LOG_PREFIX = "[syncEngine]";

function syncLog(phase: string, message: string, extra?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  if (extra && Object.keys(extra).length > 0) {
    console.log(`${LOG_PREFIX} [${ts}] [${phase}] ${message}`, extra);
  } else {
    console.log(`${LOG_PREFIX} [${ts}] [${phase}] ${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function readErrParts(err: unknown): { msg: string; code: string; status: number } {
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
  return { msg, code, status };
}

/** Autenticação inválida, RLS ou negação explícita no Postgres — deve aparecer na UI de imediato. */
export function isAuthPermissionOrRlsError(err: unknown): boolean {
  const { msg, code, status } = readErrParts(err);
  const lower = msg.toLowerCase();
  return (
    code === "42501" ||
    status === 401 ||
    status === 403 ||
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("violates row-level security") ||
    lower.includes("rls") ||
    lower.includes("not allowed") ||
    lower.includes("jwt expired") ||
    lower.includes("invalid jwt") ||
    /^PGRST30[12]$/i.test(code)
  );
}

function isInvalidApiKeyOrMissing(err: unknown): boolean {
  const { msg } = readErrParts(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("invalid api key") ||
    lower.includes("missing api key") ||
    lower.includes("no api key found")
  );
}

function shouldSurfaceSyncFailureImmediately(err: unknown): boolean {
  return isAuthPermissionOrRlsError(err) || isInvalidApiKeyOrMissing(err);
}

function isTransientNetworkError(err: unknown): boolean {
  if (shouldSurfaceSyncFailureImmediately(err)) return false;
  const { msg, code } = readErrParts(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    code === "503" ||
    code === "502" ||
    code === "504"
  );
}

export type SyncEngineCallbacks = {
  onPushError?: (message: string) => void;
};
export type StartSyncEngineOptions = {
  /** Após o primeiro pull + flush bem-sucedidos (ex.: reconciliação Dexie × Postgres). */
  afterInitialSync?: () => Promise<void>;
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
      await deleteLocalBatchCascade(id);
      return;
    case "leadPiles":
      await deleteLocalPileCascade(id);
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
  syncLog("pull-start", "Recebimento (pull): iniciando todas as tabelas", {
    owner_id: ownerId,
    tables: ALL_ENTITY_TABLES,
  });
  syncActivityEnter();
  try {
    for (const table of ALL_ENTITY_TABLES) {
      const name = remoteTableName(table);
      syncLog("pull-table", "Recebimento: consultando tabela remota", {
        entity_table: table,
        remote_table: name,
        owner_id: ownerId,
      });
      const { data, error } = await supabase.from(name).select("*").eq("owner_id", ownerId);
      if (error) {
        const msg = normalizeSupabaseErrorMessage(error);
        console.error("[syncEngine] pullAllRows: Supabase retornou erro", {
          entity_table: table,
          remote_table: name,
          owner_id: ownerId,
          error,
          mensagem_ui: msg,
        });
        throw new Error(msg);
      }
      const rows = data ?? [];
      syncLog("pull-table-ok", `Recebimento: ${rows.length} linha(s) aplicadas (merge LWW)`, {
        entity_table: table,
        remote_table: name,
        row_count: rows.length,
      });
      for (const raw of rows) {
        await applyMerged(table, raw as Record<string, unknown>);
      }
    }
    syncLog("pull-done", "Recebimento (pull): concluído com sucesso");
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
  if (!row?.id) {
    syncLog("outbox-drain", "Envio: fila vazia (nada a processar)");
    return false;
  }

  const outboxId = row.id;

  const remoteName = remoteTableName(row.entity_table);
  syncLog("outbox-send-start", "Envio: iniciando operação remota", {
    outbox_id: outboxId,
    op: row.op,
    entity_table: row.entity_table,
    entity_id: row.entity_id,
    remote_table: remoteName,
    attempt_count_fila: row.attempt_count ?? 0,
  });

  const performRemoteOp = async (): Promise<void> => {
    if (row.op === "delete") {
      const { error } = await supabase.from(remoteName).delete().eq("id", row.entity_id);
      if (error) throw error;
      syncLog("outbox-send-ok", "Envio: DELETE remoto concluído", {
        entity_table: row.entity_table,
        entity_id: row.entity_id,
      });
      await db.syncOutbox.delete(outboxId);
      return;
    }

    const parsed = JSON.parse(row.payload_json) as Record<string, unknown>;
    const payload = toRemotePayload(row.entity_table, parsed, ownerId);

    const { data, error } = await supabase
      .from(remoteName)
      .upsert(payload)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (data) {
      await applyMerged(row.entity_table, data as Record<string, unknown>);
    }

    syncLog("outbox-send-ok", "Envio: UPSERT remoto concluído", {
      entity_table: row.entity_table,
      entity_id: row.entity_id,
    });
    await db.syncOutbox.delete(outboxId);
  };

  let lastErr: unknown = null;

  for (let netTry = 0; netTry < TRANSIENT_PUSH_RETRIES; netTry++) {
    try {
      await performRemoteOp();
      return true;
    } catch (e) {
      lastErr = e;
      const msg = normalizeSupabaseErrorMessage(e);
      const immediate = shouldSurfaceSyncFailureImmediately(e);
      const transient = isTransientNetworkError(e);

      console.error("[syncEngine] Envio: falha detalhada (raw)", {
        outbox_id: outboxId,
        op: row.op,
        entity_table: row.entity_table,
        entity_id: row.entity_id,
        remote_table: remoteName,
        network_try: netTry + 1,
        max_network_tries: TRANSIENT_PUSH_RETRIES,
        classificacao_imediata_ui: immediate,
        classificacao_rede_transiente: transient,
        mensagem_normalizada: msg,
        erro_bruto: e,
      });

      if (immediate) {
        syncLog("outbox-send-fatal", "Envio: falha de autenticação, chave ou RLS", {
          entity_table: row.entity_table,
          entity_id: row.entity_id,
        });
        const prevAttempts = row.attempt_count ?? 0;
        if (prevAttempts === 0) {
          callbacks?.onPushError?.(`Erro ao sincronizar com Supabase: ${msg}`);
        }
      }

      if (transient && netTry < TRANSIENT_PUSH_RETRIES - 1) {
        const delayMs = TRANSIENT_PUSH_BASE_DELAY_MS * (netTry + 1);
        syncLog(
          "outbox-send-retry",
          `Envio: rede/transiente — nova tentativa em ${delayMs}ms`,
          {
            entity_id: row.entity_id,
            proxima_tentativa: netTry + 2,
          },
        );
        await sleep(delayMs);
        continue;
      }

      break;
    }
  }

  const msg = normalizeSupabaseErrorMessage(lastErr);
  syncLog("outbox-send-fail", "Envio: falha registrada na fila (aguardando nova rodada)", {
    entity_table: row.entity_table,
    entity_id: row.entity_id,
    last_error: msg,
  });

  const nextAttempt = (row.attempt_count ?? 0) + 1;
  await db.syncOutbox.update(outboxId, {
    attempt_count: nextAttempt,
    last_error: msg,
  });
  if (nextAttempt >= MAX_PUSH_ATTEMPTS) {
    await db.syncOutbox.delete(outboxId);
    callbacks?.onPushError?.(
      `Sync: falha após ${MAX_PUSH_ATTEMPTS} tentativas (${row.entity_table} ${row.entity_id}): ${msg}`,
    );
  }
  return false;
}

export async function flushOutbox(
  supabase: SupabaseClient,
  ownerId: string,
  callbacks?: SyncEngineCallbacks,
): Promise<void> {
  const pendingBefore = await db.syncOutbox.count();
  syncLog("flush-start", "Envio: dreno da outbox (flush)", {
    owner_id: ownerId,
    pendentes_antes: pendingBefore,
  });
  syncActivityEnter();
  let processed = 0;
  try {
    for (let i = 0; i < 500; i++) {
      const progressed = await processOneOutboxRow(supabase, ownerId, callbacks);
      if (!progressed) break;
      processed += 1;
    }
    const pendingAfter = await db.syncOutbox.count();
    syncLog("flush-done", "Envio: dreno da outbox concluído nesta execução", {
      owner_id: ownerId,
      processados_nesta_rodada: processed,
      pendentes_depois: pendingAfter,
    });
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
    syncLog("browser-online", "Navegador online — disparando flushOutbox");
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
            syncLog("realtime-event", "Recebimento: evento Realtime", {
              entity_table: entityTable,
              eventType: payload.eventType,
              table: name,
            });
            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as Record<string, unknown> | null;
              const id = oldRow?.id as string | undefined;
              if (id && entityTable) await deleteLocal(entityTable, id);
              return;
            }
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | null;
            if (raw && entityTable) await applyMerged(entityTable, raw);
          } catch (err) {
            console.error("[syncEngine] Recebimento: falha no handler Realtime", {
              entity_table: entityTable,
              table: name,
              payload_event: payload.eventType,
              erro: err,
            });
          }
        })();
      },
    );
  }

  channel.subscribe((status, err) => {
    syncLog("realtime-channel", `Canal Realtime: ${status}`, err ? { erro: String(err) } : {});
    if (status === "CHANNEL_ERROR") {
      console.error("[syncEngine] Canal Realtime com erro", err ?? status);
      callbacks?.onPushError?.(
        "Erro no canal Supabase Realtime. Verifique sessão, rede e políticas RLS para replicação.",
      );
    }
    if (status === "TIMED_OUT") {
      console.error("[syncEngine] Canal Realtime: tempo esgotado", err);
      callbacks?.onPushError?.(
        "Supabase Realtime: tempo esgotado ao conectar o canal de sincronização.",
      );
    }
  });

  window.addEventListener("online", onOnline);

  void (async () => {
    syncLog("engine-boot", "Motor de sync: pull inicial + flush + afterInitialSync");
    try {
      await pullAllRows(supabase, ownerId);
      await flushOutbox(supabase, ownerId, callbacks);
      await options?.afterInitialSync?.();
      syncLog("engine-boot-ok", "Motor de sync: primeira rodada concluída");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      console.error("[syncEngine] Motor de sync: falha na primeira rodada", e);
      syncLog("engine-boot-fail", m);
      callbacks?.onPushError?.(`Erro ao sincronizar com Supabase na inicialização: ${m}`);
    }
  })();

  cleanupFn = () => {
    window.removeEventListener("online", onOnline);
    void supabase.removeChannel(channel);
  };
}
