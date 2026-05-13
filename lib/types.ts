/** Tipos do domínio (nomes alinhados ao schema do PROJECT_MAP). */

export type LeadPileStatus = "AVAILABLE" | "PARTIAL" | "CONSUMED" | "RESERVED";

export type LeadPileEventKind = "RESERVED" | "CANCELLED_RESERVATION";

export interface LeadAlloy {
  id: string;
  name: string;
  /** ISO do servidor (sync/LWW); ausente em dados só locais antigos. */
  updated_at?: string | null;
}

export interface LeadBatch {
  id: string;
  alloy_id: string;
  batch_number: string;
  arrival_date: string;
  initial_total_weight: number;
  initial_total_bars: number;
  updated_at?: string | null;
}

export interface LeadPile {
  id: string;
  batch_id: string;
  current_weight: number;
  current_bars: number;
  grid_position_x: number;
  grid_position_y: number;
  status: LeadPileStatus;
  /** Destino da reserva (setor/pessoa); null se não reservado. */
  reserved_for: string | null;
  /** ISO da reserva; null se não reservado. */
  reserved_at: string | null;
  updated_at?: string | null;
}

export interface LeadTransaction {
  id: string;
  pile_id: string;
  deducted_weight: number;
  deducted_bars: number;
  destination: string;
  transaction_date: string;
  /** UUID comum a todas as linhas criadas no mesmo envio do modal de liberação; null em dados legados. */
  release_group_id?: string | null;
  updated_at?: string | null;
}

/** Evento organizacional/visual (não é baixa): reserva/cancelamento. */
export interface LeadPileEvent {
  id: string;
  pile_id: string;
  kind: LeadPileEventKind;
  recipient: string;
  event_date: string;
  updated_at?: string | null;
}

/** Fila local de envio ao Supabase (outbox). */
export type SyncEntityTable =
  | "leadAlloys"
  | "leadBatches"
  | "leadPiles"
  | "leadTransactions"
  | "leadPileEvents";

export type SyncOutboxOp = "upsert" | "delete";

export interface SyncOutboxRow {
  id?: number;
  entity_table: SyncEntityTable;
  entity_id: string;
  op: SyncOutboxOp;
  /** JSON da linha Dexie (upsert) ou só metadados redundantes (delete). */
  payload_json: string;
  created_at: string;
  attempt_count: number;
  last_error: string | null;
}
