"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  onEntrada: () => void;
  onLigas: () => void;
  onSaida: () => void;
};

export function QuickActionSheet({ open, onClose, onEntrada, onLigas, onSaida }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative mx-auto mb-[max(env(safe-area-inset-bottom),12px)] w-full max-w-md rounded-t-3xl border border-zinc-200/80 bg-white/95 p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900/95">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
        <div className="grid gap-1 p-1">
          <button
            type="button"
            className="rounded-2xl px-4 py-3.5 text-left text-base font-semibold text-zinc-900 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-50 dark:hover:bg-zinc-800"
            onClick={() => {
              onEntrada();
              onClose();
            }}
          >
            Apontamento de entrada de chumbo
          </button>
          <button
            type="button"
            className="rounded-2xl px-4 py-3.5 text-left text-base font-semibold text-zinc-900 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-50 dark:hover:bg-zinc-800"
            onClick={() => {
              onLigas();
              onClose();
            }}
          >
            Cadastro de ligas / modelos
          </button>
          <button
            type="button"
            className="rounded-2xl px-4 py-3.5 text-left text-base font-semibold text-zinc-900 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-50 dark:hover:bg-zinc-800"
            onClick={() => {
              onSaida();
              onClose();
            }}
          >
            Apontamento de saída de chumbo
          </button>
          <button
            type="button"
            className="mt-1 rounded-2xl px-4 py-3 text-center text-sm font-medium text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
