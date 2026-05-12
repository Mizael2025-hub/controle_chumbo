export type AppErrorBannerEntry = {
  id: string;
  /** Linha principal em PT-BR (texto vermelho). */
  summary: string;
  /** Detalhe técnico opcional (fonte menor). */
  detail?: string;
};

type Props = {
  entries: AppErrorBannerEntry[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
};

/** Alertas de erro empilhados (PT-BR, vermelho) + detalhe para debug. */
export function ErrorBanner({ entries, onDismiss, onDismissAll }: Props) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-4 space-y-2" role="region" aria-label="Mensagens de erro">
      {entries.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismissAll}
            className="rounded border border-red-400 bg-red-50 px-2 py-1 text-xs font-medium text-red-900 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-900/40"
          >
            Fechar todos
          </button>
        </div>
      )}
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
          role="alert"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug text-red-900 dark:text-red-50">{e.summary}</p>
            {e.detail ? (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-red-200/80 bg-white/80 p-2 text-xs leading-relaxed text-red-800 dark:border-red-900/60 dark:bg-zinc-950/50 dark:text-red-200">
                {e.detail}
              </pre>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(e.id)}
            className="shrink-0 rounded border border-red-400 px-2 py-0.5 text-xs font-medium text-red-900 hover:bg-red-100 dark:border-red-600 dark:text-red-100 dark:hover:bg-red-900/50"
          >
            Fechar
          </button>
        </div>
      ))}
    </div>
  );
}
