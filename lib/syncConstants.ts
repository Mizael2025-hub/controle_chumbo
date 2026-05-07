import type { SyncEntityTable } from "@/lib/types";

/** Nome da tabela no Postgres (Supabase). */
export const SUPABASE_TABLE: Record<SyncEntityTable, string> = {
  leadAlloys: "lead_alloys",
  leadBatches: "lead_batches",
  leadPiles: "lead_piles",
  leadTransactions: "lead_transactions",
  leadPileEvents: "lead_pile_events",
};
