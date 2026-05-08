/** Contador reentrante para operações de rede do sync (pull / flush). */

type Listener = () => void;

const listeners = new Set<Listener>();
let depth = 0;

export function syncActivityEnter(): void {
  depth += 1;
  if (depth === 1) {
    for (const l of listeners) l();
  }
}

export function syncActivityLeave(): void {
  const was = depth;
  depth = Math.max(0, depth - 1);
  if (was > 0 && depth === 0) {
    for (const l of listeners) l();
  }
}

export function syncActivityIsBusy(): boolean {
  return depth > 0;
}

export function subscribeSyncActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
