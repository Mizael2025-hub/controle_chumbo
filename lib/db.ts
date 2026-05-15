import Dexie, { type Table } from "dexie";
import { uuidV4 } from "@/lib/uuid";
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

    this.version(5)
      .stores({
        leadAlloys: "id, name",
        leadBatches: "id, alloy_id, batch_number",
        leadPiles: "id, batch_id, grid_position_x, grid_position_y",
        leadTransactions: "id, pile_id, release_group_id",
        leadPileEvents: "id, pile_id, event_date, kind",
        syncOutbox: "++id, entity_table, entity_id, created_at",
      })
      .upgrade(async (tx) => {
        await tx
          .table("leadTransactions")
          .toCollection()
          .modify((r: LeadTransaction) => {
            r.release_group_id ??= null;
          });
      });

    this.version(6)
      .stores({
        leadAlloys: "id, name",
        leadBatches: "id, alloy_id, batch_number",
        leadPiles: "id, batch_id, grid_position_x, grid_position_y",
        leadTransactions: "id, pile_id, release_group_id",
        leadPileEvents: "id, pile_id, event_date, kind",
        syncOutbox: "++id, entity_table, entity_id, created_at",
      })
      .upgrade(async (tx) => {
        await tx
          .table("leadAlloys")
          .toCollection()
          .modify((r: LeadAlloy) => {
            r.color_key ??= "gray";
          });
      });

    const makeUuid = (): string => {
      const c = globalThis.crypto as Crypto | undefined;
      if (c && typeof (c as Crypto & { randomUUID?: () => string }).randomUUID === "function") {
        return (c as Crypto & { randomUUID: () => string }).randomUUID();
      }
      return uuidV4();
    };
    const stampUpdatedAt = () => new Date().toISOString();
    this.leadAlloys.hook("creating", (_pk, obj) => {
      const r = obj as LeadAlloy;
      if (!r.id) r.id = makeUuid();
      if (r.updated_at == null || r.updated_at === "") r.updated_at = stampUpdatedAt();
    });
    this.leadBatches.hook("creating", (_pk, obj) => {
      const r = obj as LeadBatch;
      if (!r.id) r.id = makeUuid();
      if (r.updated_at == null || r.updated_at === "") r.updated_at = stampUpdatedAt();
    });
    this.leadPiles.hook("creating", (_pk, obj) => {
      const r = obj as LeadPile;
      if (!r.id) r.id = makeUuid();
      if (r.updated_at == null || r.updated_at === "") r.updated_at = stampUpdatedAt();
    });
    this.leadTransactions.hook("creating", (_pk, obj) => {
      const r = obj as LeadTransaction;
      if (!r.id) r.id = makeUuid();
      if (r.updated_at == null || r.updated_at === "") r.updated_at = stampUpdatedAt();
    });
    this.leadPileEvents.hook("creating", (_pk, obj) => {
      const r = obj as LeadPileEvent;
      if (!r.id) r.id = makeUuid();
      if (r.updated_at == null || r.updated_at === "") r.updated_at = stampUpdatedAt();
    });
  }
}

export const db = new LeadControlDB();
