"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { LeadAlloy } from "@/lib/types";
import { nextDefaultColorKey, normalizeAlloyColorKey, type AlloyColorKey } from "@/lib/alloyColors";
import { addAlloy, deleteAlloy, updateAlloyColor } from "@/lib/alloyCrud";
import { createBatchFromGrid } from "@/lib/createBatchFromGrid";
import { AlloyColorPicker } from "@/components/AlloyColorPicker";
import { BatchEntryGrid, type DraftPile } from "@/components/BatchEntryGrid";

const EMPTY_ALLOYS: LeadAlloy[] = [];

export type CadastrosMode = "full" | "ligas" | "entrada";

type Props = {
  onError: (message: string) => void;
  onGoToEstoque: (alloyId: string | null) => void;
  /** Quando não é `full`, mostra só o bloco pedido (ex.: atalho da barra / sheet). */
  mode?: CadastrosMode;
};

/** Telas de cadastro: ligas e entrada de lote (novos montes na grade). */
export function CadastrosView({ onError, onGoToEstoque, mode = "full" }: Props) {
  const alloysRaw = useLiveQuery(() => db.leadAlloys.orderBy("name").toArray(), []);
  const alloys = useMemo(() => alloysRaw ?? EMPTY_ALLOYS, [alloysRaw]);

  const [newAlloyName, setNewAlloyName] = useState("");
  const [newAlloyColor, setNewAlloyColor] = useState<AlloyColorKey>("gray");
  const [alloySubmitting, setAlloySubmitting] = useState(false);
  const [colorUpdatingId, setColorUpdatingId] = useState<string | null>(null);

  const [batchAlloyId, setBatchAlloyId] = useState<string>("");
  const [batchNumber, setBatchNumber] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [draftPiles, setDraftPiles] = useState<DraftPile[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const handleAddAlloy = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlloySubmitting(true);
    try {
      const id = await addAlloy(newAlloyName, newAlloyColor);
      setNewAlloyName("");
      setNewAlloyColor(nextDefaultColorKey([...alloys.map((a) => a.color_key), newAlloyColor]));
      setBatchAlloyId((prev) => prev || id);
    } catch (err) {
      console.error("[CadastrosView] Erro ao cadastrar liga:", err);
      onError(err instanceof Error ? err.message : "Falha ao cadastrar liga.");
    } finally {
      setAlloySubmitting(false);
    }
  };

  const handleColorChange = async (alloyId: string, colorKey: AlloyColorKey) => {
    setColorUpdatingId(alloyId);
    try {
      await updateAlloyColor(alloyId, colorKey);
    } catch (err) {
      console.error("[CadastrosView] Erro ao atualizar cor da liga:", err);
      onError(err instanceof Error ? err.message : "Falha ao atualizar cor da liga.");
    } finally {
      setColorUpdatingId(null);
    }
  };

  const handleDeleteAlloy = async (id: string) => {
    if (!window.confirm("Excluir esta liga? Só é permitido se não houver lotes.")) {
      return;
    }
    try {
      await deleteAlloy(id);
    } catch (err) {
      console.error("[CadastrosView] Erro ao excluir liga:", err);
      onError(err instanceof Error ? err.message : "Falha ao excluir liga.");
    }
  };

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchAlloyId) {
      onError("Selecione a liga do novo lote.");
      return;
    }
    setBatchSubmitting(true);
    try {
      await createBatchFromGrid({
        alloy_id: batchAlloyId,
        batch_number: batchNumber,
        arrival_date: arrivalDate,
        piles: draftPiles,
      });
      setBatchNumber("");
      setDraftPiles([]);
      onGoToEstoque(batchAlloyId);
    } catch (err) {
      console.error("[CadastrosView] Erro ao cadastrar lote:", err);
      onError(err instanceof Error ? err.message : "Falha ao cadastrar lote.");
    } finally {
      setBatchSubmitting(false);
    }
  };

  useEffect(() => {
    if (alloys.length === 0) {
      setBatchAlloyId("");
      return;
    }
    setBatchAlloyId((prev) => {
      if (prev && alloys.some((a) => a.id === prev)) return prev;
      return alloys[0].id;
    });
  }, [alloys]);

  useEffect(() => {
    setNewAlloyColor(nextDefaultColorKey(alloys.map((a) => a.color_key)));
  }, [alloys]);

  const showLigas = mode === "full" || mode === "ligas";
  const showEntrada = mode === "full" || mode === "entrada";

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      {showLigas && (
      <section className="shrink-0 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Cadastro de ligas
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Cada liga aparece na tela Início e como aba em Estoque. Escolha a cor oficial (tons suaves).
        </p>
        <form onSubmit={handleAddAlloy} className="mt-4 flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Cor da nova liga</p>
            <div className="mt-2">
              <AlloyColorPicker
                value={newAlloyColor}
                onChange={setNewAlloyColor}
                disabled={alloySubmitting}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block w-full flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Nome da nova liga
            <input
              type="text"
              value={newAlloyName}
              onChange={(e) => setNewAlloyName(e.target.value)}
              placeholder="Ex.: Liga 2"
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
            />
          </label>
          <button
            type="submit"
            disabled={alloySubmitting}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900"
          >
            {alloySubmitting ? "Salvando…" : "Adicionar liga"}
          </button>
          </div>
        </form>
        <ul className="mt-6 divide-y divide-zinc-100 dark:divide-zinc-800">
          {alloys.length === 0 && (
            <li className="py-3 text-sm text-zinc-500">Nenhuma liga cadastrada ainda.</li>
          )}
          {alloys.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{a.name}</span>
              <AlloyColorPicker
                variant="compact"
                value={normalizeAlloyColorKey(a.color_key)}
                onChange={(key) => void handleColorChange(a.id, key)}
                disabled={colorUpdatingId === a.id}
              />
              <button
                type="button"
                onClick={() => handleDeleteAlloy(a.id)}
                className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40 sm:ml-auto"
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
      </section>
      )}

      {showEntrada && (
      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Nova entrada de material (lote)
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Preencha os montes exatamente na ordem/posição do estoque usando a mesma grade (kg e barras
          por célula).
        </p>
        {alloys.length === 0 ? (
          <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
            {mode === "entrada"
              ? "Cadastre uma liga em Cadastro de ligas (menu Cadastros ou atalho) antes de criar lotes."
              : "Cadastre pelo menos uma liga acima antes de criar lotes."}
          </p>
        ) : (
          <form onSubmit={handleAddBatch} className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 sm:col-span-2">
              Liga deste lote
              <select
                value={batchAlloyId}
                onChange={(e) => setBatchAlloyId(e.target.value)}
                required
                className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {alloys.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Número do lote
                <input
                  type="text"
                  required
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  inputMode="text"
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Data de chegada
                <input
                  type="date"
                  required
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 rounded-xl border border-zinc-200 bg-white/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/20">
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                Toque numa célula para preencher ou corrigir kg e barras antes de cadastrar o lote.
              </p>
              <div className="h-full overflow-auto overscroll-contain">
                <BatchEntryGrid value={draftPiles} onChange={setDraftPiles} />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={batchSubmitting}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                {batchSubmitting ? "Salvando lote…" : "Cadastrar lote e montes"}
              </button>
            </div>
          </form>
        )}
      </section>
      )}
    </div>
  );
}
