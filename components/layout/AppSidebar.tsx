"use client";

import type { AppSection } from "@/components/layout/AppBottomNav";

type Props = {
  section: AppSection;
  onNavigate: (s: AppSection) => void;
  onQuickEntrada: () => void;
  onQuickLigas: () => void;
  onQuickSaida: () => void;
};

const linkCls =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800";

export function AppSidebar({
  section,
  onNavigate,
  onQuickEntrada,
  onQuickLigas,
  onQuickSaida,
}: Props) {
  const nav = (s: AppSection, label: string) => (
    <button
      type="button"
      onClick={() => onNavigate(s)}
      className={`${linkCls} ${section === s ? "bg-zinc-200/80 dark:bg-zinc-800" : ""}`}
    >
      {label}
    </button>
  );

  return (
    <aside className="ios-blur sticky top-0 z-30 flex h-[100svh] w-[220px] shrink-0 flex-col border-r border-zinc-200/90 bg-white/90 py-6 dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="px-4 pb-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Menu</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {nav("dashboard", "Início")}
        {nav("estoque", "Estoque e saídas")}
        {nav("cadastros", "Cadastros")}
        {nav("relatorio", "Relatório")}
      </nav>
      <div className="mt-auto border-t border-zinc-200 px-3 py-4 dark:border-zinc-800">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Ações</div>
        <button type="button" className={linkCls} onClick={onQuickEntrada}>
          Entrada de chumbo
        </button>
        <button type="button" className={linkCls} onClick={onQuickLigas}>
          Cadastro de ligas
        </button>
        <button type="button" className={linkCls} onClick={onQuickSaida}>
          Saída de chumbo
        </button>
      </div>
    </aside>
  );
}
