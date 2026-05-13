"use client";

import type { ReactNode } from "react";
export type AppSection = "dashboard" | "estoque" | "cadastros" | "relatorio";

type Props = {
  section: AppSection;
  onNavigate: (s: AppSection) => void;
  onOpenQuickActions: () => void;
};

function NavIconDashboard({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className={active ? "text-[var(--ios-blue)]" : "text-zinc-500"}
      aria-hidden
    >
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavIconBox({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className={active ? "text-[var(--ios-blue)]" : "text-zinc-500"}
      aria-hidden
    >
      <path
        d="M4 7.5L12 3l8 4.5v9L12 21l-8-4.5v-9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 7.5L12 12l8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function NavIconDoc({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className={active ? "text-[var(--ios-blue)]" : "text-zinc-500"}
      aria-hidden
    >
      <path
        d="M7 3h7l3 3v15a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3v4h4M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function NavIconChart({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className={active ? "text-[var(--ios-blue)]" : "text-zinc-500"}
      aria-hidden
    >
      <path d="M4 19h16M7 16V10M12 16V6M17 16v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function AppBottomNav({ section, onNavigate, onOpenQuickActions }: Props) {
  const item = (s: AppSection, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onNavigate(s)}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
        section === s ? "text-[var(--ios-blue)]" : "text-zinc-500 dark:text-zinc-400"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <nav
      className="ios-blur fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/80 bg-white/85 px-1 pt-1 dark:border-zinc-800 dark:bg-zinc-950/85"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <div className="mx-auto flex max-w-lg items-end justify-between gap-1 pb-1">
        {item("dashboard", "Início", <NavIconDashboard active={section === "dashboard"} />)}
        {item("estoque", "Estoque", <NavIconBox active={section === "estoque"} />)}
        <div className="relative flex flex-1 flex-col items-center">
          <button
            type="button"
            onClick={onOpenQuickActions}
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ios-blue)] text-2xl font-light text-white shadow-lg shadow-blue-900/20 active:scale-95"
            aria-label="Ações rápidas"
          >
            +
          </button>
          <span className="mt-1 text-[10px] font-medium text-zinc-500">Novo</span>
        </div>
        {item("cadastros", "Cadastros", <NavIconDoc active={section === "cadastros"} />)}
        {item("relatorio", "Relatório", <NavIconChart active={section === "relatorio"} />)}
      </div>
    </nav>
  );
}
