import type {
  LeadAlloy,
  LeadBatch,
  LeadPile,
  LeadPileEvent,
  LeadPileEventKind,
  LeadTransaction,
  SyncEntityTable,
} from "@/lib/types";
import { SUPABASE_TABLE } from "@/lib/syncConstants";

export type RemoteLeadAlloy = {
  id: string;
  name: string;
  owner_id: string;
  updated_at: string;
};

export type RemoteLeadBatch = {
  id: string;
  alloy_id: string;
  batch_number: string;
  arrival_date: string;
  initial_total_weight: number;
  initial_total_bars: number;
  owner_id: string;
  updated_at: string;
};

export type RemoteLeadPile = {
  id: string;
  batch_id: string;
  current_weight: number;
  current_bars: number;
  grid_position_x: number;
  grid_position_y: number;
  status: string;
  reserved_for: string | null;
  reserved_at: string | null;
  owner_id: string;
  updated_at: string;
};

export type RemoteLeadTransaction = {
  id: string;
  pile_id: string;
  deducted_weight: number;
  deducted_bars: number;
  destination: string;
  transaction_date: string;
  release_group_id?: string | null;
  owner_id: string;
  updated_at: string;
};

export type RemoteLeadPileEvent = {
  id: string;
  pile_id: string;
  kind: string;
  recipient: string;
  event_date: string;
  owner_id: string;
  updated_at: string;
};

export function remoteTableName(table: SyncEntityTable): string {
  return SUPABASE_TABLE[table];
}

export function toRemotePayload(
  table: SyncEntityTable,
  row: unknown,
  ownerId: string,
): Record<string, unknown> {
  switch (table) {
    case "leadAlloys": {
      const r = row as LeadAlloy;
      return {
        id: r.id,
        name: r.name,
        owner_id: ownerId,
      };
    }
    case "leadBatches": {
      const r = row as LeadBatch;
      return {
        id: r.id,
        alloy_id: r.alloy_id,
        batch_number: r.batch_number,
        arrival_date: r.arrival_date,
        initial_total_weight: r.initial_total_weight,
        initial_total_bars: r.initial_total_bars,
        owner_id: ownerId,
      };
    }
    case "leadPiles": {
      const r = row as LeadPile;
      return {
        id: r.id,
        batch_id: r.batch_id,
        current_weight: r.current_weight,
        current_bars: r.current_bars,
        grid_position_x: r.grid_position_x,
        grid_position_y: r.grid_position_y,
        status: r.status,
        reserved_for: r.reserved_for,
        reserved_at: r.reserved_at,
        owner_id: ownerId,
      };
    }
    case "leadTransactions": {
      const r = row as LeadTransaction;
      return {
        id: r.id,
        pile_id: r.pile_id,
        deducted_weight: r.deducted_weight,
        deducted_bars: r.deducted_bars,
        destination: r.destination,
        transaction_date: r.transaction_date,
        release_group_id: r.release_group_id ?? null,
        owner_id: ownerId,
      };
    }
    case "leadPileEvents": {
      const r = row as LeadPileEvent;
      return {
        id: r.id,
        pile_id: r.pile_id,
        kind: r.kind,
        recipient: r.recipient,
        event_date: r.event_date,
        owner_id: ownerId,
      };
    }
    default: {
      const _exhaustive: never = table;
      return _exhaustive;
    }
  }
}

export function fromRemoteRow(table: SyncEntityTable, raw: Record<string, unknown>): unknown {
  switch (table) {
    case "leadAlloys": {
      const r = raw as unknown as RemoteLeadAlloy;
      const local: LeadAlloy = {
        id: r.id,
        name: r.name,
        updated_at: r.updated_at,
      };
      return local;
    }
    case "leadBatches": {
      const r = raw as unknown as RemoteLeadBatch;
      const local: LeadBatch = {
        id: r.id,
        alloy_id: r.alloy_id,
        batch_number: r.batch_number,
        arrival_date: typeof r.arrival_date === "string" ? r.arrival_date.split("T")[0] : String(r.arrival_date),
        initial_total_weight: Number(r.initial_total_weight),
        initial_total_bars: Number(r.initial_total_bars),
        updated_at: r.updated_at,
      };
      return local;
    }
    case "leadPiles": {
      const r = raw as unknown as RemoteLeadPile;
      const local: LeadPile = {
        id: r.id,
        batch_id: r.batch_id,
        current_weight: Number(r.current_weight),
        current_bars: Number(r.current_bars),
        grid_position_x: Number(r.grid_position_x),
        grid_position_y: Number(r.grid_position_y),
        status: r.status as LeadPile["status"],
        reserved_for: r.reserved_for,
        reserved_at: r.reserved_at,
        updated_at: r.updated_at,
      };
      return local;
    }
    case "leadTransactions": {
      const r = raw as unknown as RemoteLeadTransaction;
      const local: LeadTransaction = {
        id: r.id,
        pile_id: r.pile_id,
        deducted_weight: Number(r.deducted_weight),
        deducted_bars: Number(r.deducted_bars),
        destination: r.destination,
        transaction_date: r.transaction_date,
        release_group_id: r.release_group_id ?? null,
        updated_at: r.updated_at,
      };
      return local;
    }
    case "leadPileEvents": {
      const r = raw as unknown as RemoteLeadPileEvent;
      const local: LeadPileEvent = {
        id: r.id,
        pile_id: r.pile_id,
        kind: r.kind as LeadPileEventKind,
        recipient: r.recipient,
        event_date: r.event_date,
        updated_at: r.updated_at,
      };
      return local;
    }
    default: {
      const _exhaustive: never = table;
      return _exhaustive;
    }
  }
}
