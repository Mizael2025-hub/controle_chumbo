import Dexie, { type Table } from "dexie";
import type {
  LeadAlloy,
  LeadBatch,
  LeadPile,
  LeadPileEvent,
  LeadTransaction,
  SyncOutboxRow,
} from "@/lib/types";

/** Banco local IndexedDB + fila de sync (Supabase). */
export class LeadControlDB extends Dexie {
  leadAlloys!: Table<LeadAlloy, string>;
  leadBatches!: Table<LeadBatch, string>;
  leadPiles!: Table<LeadPile, string>;
  leadTransactions!: Table<LeadTransaction, string>;
  leadPileEvents!: Table<LeadPileEvent, string>;
  syncOutbox!: Table<SyncOutboxRow, number>;

  constructor() {
    super("lead_control_db_v1");
    this.version(1).stores({
      leadAlloys: "id, name",
      leadBatches: "id, alloy_id, batch_number",
      leadPiles: "id, batch_id, grid_position_x, grid_position_y",
      leadTransactions: "id, pile_id",
    });
    this.version(2)
      .stores({
        leadAlloys: "id, name",
        leadBatches: "id, alloy_id, batch_number",
        leadPiles: "id, batch_id, grid_position_x, grid_position_y",
        leadTransactions: "id, pile_id",
      })
      .upgrade(async (tx) => {
        await tx
          .table("leadPiles")
          .toCollection()
          .modify((p: LeadPile) => {
            p.reserved_for ??= null;
            p.reserved_at ??= null;
          });
      });

    this.version(3).stores({
      leadAlloys: "id, name",
      leadBatches: "id, alloy_id, batch_number",
      leadPiles: "id, batch_id, grid_position_x, grid_position_y",
      leadTransactions: "id, pile_id",
      leadPileEvents: "id, pile_id, event_date, kind",
    });

    this.version(4)
      .stores({
        leadAlloys: "id, name",
        leadBatches: "id, alloy_id, batch_number",
        leadPiles: "id, batch_id, grid_position_x, grid_position_y",
        leadTransactions: "id, pile_id",
        leadPileEvents: "id, pile_id, event_date, kind",
        syncOutbox: "++id, entity_table, entity_id, created_at",
      })
      .upgrade(async (tx) => {
        await tx
          .table("leadAlloys")
          .toCollection()
          .modify((r: LeadAlloy) => {
            r.updated_at ??= null;
          });
        await tx
          .table("leadBatches")
          .toCollection()
          .modify((r: LeadBatch) => {
            r.updated_at ??= null;
          });
        await tx
          .table("leadPiles")
          .toCollection()
          .modify((r: LeadPile) => {
            r.updated_at ??= null;
          });
        await tx
          .table("leadTransactions")
          .toCollection()
          .modify((r: LeadTransaction) => {
            r.updated_at ??= null;
          });
        await tx
          .table("leadPileEvents")
          .toCollection()
          .modify((r: LeadPileEvent) => {
            r.updated_at ??= null;
          });
      });
  }
}

export const db = new LeadControlDB();
