type Props = {
  message: string | null;
  onDismiss: () => void;
};

/** Alerta de erro visível (PROJECT_MAP §3). */
export function ErrorBanner({ message, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div
      className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
      role="alert"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded border border-red-400 px-2 py-0.5 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/50"
      >
        Fechar
      </button>
    </div>
  );
}
