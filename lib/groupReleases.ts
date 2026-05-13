import type { LeadTransaction } from "@/lib/types";

export type ReleaseGroupRow = {
  key: string;
  release_group_id: string | null;
  approximate: boolean;
  destination: string;
  transaction_date: string;
  txs: LeadTransaction[];
};

/**
 * Agrupa transações de liberação: por `release_group_id` quando existir;
 * senão heurística destino + data (pode agrupar liberações distintas — marcamos `approximate`).
 */
export function groupReleaseTransactions(txs: LeadTransaction[]): ReleaseGroupRow[] {
  const map = new Map<string, LeadTransaction[]>();

  for (const t of txs) {
    const gid = t.release_group_id?.trim();
    const key =
      gid && gid.length > 0
        ? `g:${gid}`
        : `h:${t.destination.trim()}|${t.transaction_date}`;
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }

  const rows: ReleaseGroupRow[] = [];
  for (const [key, list] of map) {
    const sorted = [...list].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const first = sorted[0];
    const gid = first.release_group_id?.trim() ?? null;
    const approximate = gid == null || gid.length === 0;
    rows.push({
      key,
      release_group_id: gid,
      approximate,
      destination: first.destination,
      transaction_date: first.transaction_date,
      txs: sorted,
    });
  }

  rows.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
  return rows;
}
