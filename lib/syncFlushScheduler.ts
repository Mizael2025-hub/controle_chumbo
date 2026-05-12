/** Evita import circular syncEngine ↔ syncOutbox: só agenda o dreno da outbox. */

let flushRunner: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 400;

export function setOutboxFlushRunner(run: () => void): void {
  clearOutboxFlushRunner();
  flushRunner = run;
}

export function clearOutboxFlushRunner(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  flushRunner = null;
}

export function notifyOutboxMayHaveNewWork(): void {
  if (!flushRunner) return;
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    try {
      flushRunner?.();
    } catch (e) {
      console.error("[syncFlushScheduler] flush runner", e);
    }
  }, DEBOUNCE_MS);
}
