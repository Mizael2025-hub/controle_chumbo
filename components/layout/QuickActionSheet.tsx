"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  onEntrada: () => void;
  onLigas: () => void;
  onSaida: () => void;
};

function ActionRow({
  label,
  sub,
  iconBg,
  icon,
  onClick,
}: {
  label: string;
  sub: string;
  iconBg: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-800 dark:active:bg-zinc-700/80"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg} shadow-sm`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-zinc-900 dark:text-zinc-50">{label}</span>
        <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{sub}</span>
      </span>
    </button>
  );
}

function QuickActionOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 py-8">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function QuickActionSheet({ open, onClose, onEntrada, onLigas, onSaida }: Props) {
  if (!open) return null;

  return (
    <QuickActionOverlay onClose={onClose}>
      <div
        className="relative w-[min(100%,22rem)] rounded-2xl border border-zinc-200/90 bg-white p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-actions-title"
      >
        <p id="quick-actions-title" className="sr-only">
          Ações rápidas
        </p>
        <div className="flex flex-col gap-0.5 p-1">
          <ActionRow
            label="Entrada de chumbo"
            sub="Cadastrar lote e montes na grade"
            iconBg="bg-orange-500"
            icon={
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 3v12M12 15l-4-4M12 15l4-4M4 19h16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            onClick={() => {
              onEntrada();
              onClose();
            }}
          />
          <ActionRow
            label="Cadastro de ligas"
            sub="Criar ou excluir ligas"
            iconBg="bg-sky-600"
            icon={
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M7 7h.01M3 11l8.59 8.59a2 2 0 002.83 0l6.17-6.17a2 2 0 000-2.83L12 2 3 11z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            onClick={() => {
              onLigas();
              onClose();
            }}
          />
          <ActionRow
            label="Saída de chumbo"
            sub="Ir para estoque e liberar montes"
            iconBg="bg-emerald-600"
            icon={
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 21V9M12 9l-4 4M12 9l4 4M4 5h16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            onClick={() => {
              onSaida();
              onClose();
            }}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full rounded-xl py-3 text-center text-sm font-medium text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Cancelar
        </button>
      </div>
    </QuickActionOverlay>
  );
}
