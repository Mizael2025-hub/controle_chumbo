/** Paleta oficial das ligas (tons suaves, não neon). */

export type AlloyColorKey =
  | "blue"
  | "yellow"
  | "red"
  | "black"
  | "gray"
  | "none"
  | "green"
  | "white";

export const ALLOY_COLOR_OPTIONS: { key: AlloyColorKey; labelPt: string }[] = [
  { key: "blue", labelPt: "Azul" },
  { key: "yellow", labelPt: "Amarelo" },
  { key: "red", labelPt: "Vermelho" },
  { key: "black", labelPt: "Preto" },
  { key: "gray", labelPt: "Cinza" },
  { key: "none", labelPt: "Sem cor" },
  { key: "green", labelPt: "Verde" },
  { key: "white", labelPt: "Branco" },
];

const CARD_BY_KEY: Record<AlloyColorKey, string> = {
  blue: "bg-sky-50/85 border-sky-200/70 dark:bg-sky-950/25 dark:border-sky-900/45",
  yellow: "bg-amber-50/80 border-amber-200/65 dark:bg-amber-950/22 dark:border-amber-900/40",
  red: "bg-rose-50/80 border-rose-200/65 dark:bg-rose-950/22 dark:border-rose-900/40",
  black: "bg-zinc-300/55 border-zinc-400/45 dark:bg-zinc-700/45 dark:border-zinc-600/40",
  gray: "bg-zinc-100/90 border-zinc-200/80 dark:bg-zinc-800/40 dark:border-zinc-700/50",
  none: "bg-zinc-50/70 border-zinc-200/60 dark:bg-zinc-900/30 dark:border-zinc-700/40",
  green: "bg-emerald-50/80 border-emerald-200/65 dark:bg-emerald-950/22 dark:border-emerald-900/40",
  white: "bg-white/95 border-zinc-200/90 dark:bg-zinc-100/10 dark:border-zinc-500/35",
};

/** Bolinha do seletor (preview da cor). */
const SWATCH_BY_KEY: Record<AlloyColorKey, string> = {
  blue: "bg-sky-200 dark:bg-sky-800",
  yellow: "bg-amber-200 dark:bg-amber-800",
  red: "bg-rose-200 dark:bg-rose-800",
  black: "bg-zinc-500 dark:bg-zinc-500",
  gray: "bg-zinc-300 dark:bg-zinc-600",
  none: "bg-zinc-100 ring-1 ring-inset ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600",
  green: "bg-emerald-200 dark:bg-emerald-800",
  white: "bg-white ring-1 ring-inset ring-zinc-300 dark:bg-zinc-200 dark:ring-zinc-500",
};

const DEFAULT_KEY: AlloyColorKey = "gray";

export function isAlloyColorKey(v: string | null | undefined): v is AlloyColorKey {
  return ALLOY_COLOR_OPTIONS.some((o) => o.key === v);
}

export function normalizeAlloyColorKey(v: string | null | undefined): AlloyColorKey {
  return isAlloyColorKey(v) ? v : DEFAULT_KEY;
}

export function alloyCardClassName(colorKey: string | null | undefined): string {
  return CARD_BY_KEY[normalizeAlloyColorKey(colorKey)];
}

export function alloySwatchClassName(colorKey: AlloyColorKey): string {
  return SWATCH_BY_KEY[colorKey];
}

/** Aba Estoque: destaque suave quando a liga está selecionada. */
export function alloyTabActiveClassName(colorKey: string | null | undefined): string {
  const k = normalizeAlloyColorKey(colorKey);
  const map: Record<AlloyColorKey, string> = {
    blue: "bg-sky-100 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100",
    yellow: "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100",
    red: "bg-rose-100 text-rose-950 dark:bg-rose-950/50 dark:text-rose-100",
    black: "bg-zinc-300 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100",
    gray: "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100",
    none: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
    green: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100",
    white: "bg-white text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-100 dark:text-zinc-900",
  };
  return map[k];
}

export function nextDefaultColorKey(existing: (string | null | undefined)[]): AlloyColorKey {
  const used = new Set(existing.map((k) => normalizeAlloyColorKey(k)));
  for (const o of ALLOY_COLOR_OPTIONS) {
    if (!used.has(o.key)) return o.key;
  }
  return DEFAULT_KEY;
}
