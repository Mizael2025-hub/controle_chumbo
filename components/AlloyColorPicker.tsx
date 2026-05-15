"use client";

import {
  ALLOY_COLOR_OPTIONS,
  alloySwatchClassName,
  normalizeAlloyColorKey,
  type AlloyColorKey,
} from "@/lib/alloyColors";

type Props = {
  value: AlloyColorKey;
  onChange: (key: AlloyColorKey) => void;
  /** `compact` para linha da lista de ligas. */
  variant?: "default" | "compact";
  disabled?: boolean;
};

/** Seletor da paleta oficial (tons suaves). */
export function AlloyColorPicker({ value, onChange, variant = "default", disabled }: Props) {
  const current = normalizeAlloyColorKey(value);
  const swatch = variant === "compact" ? "h-7 w-7 rounded-full" : "h-9 w-9 rounded-full";

  return (
    <div
      role="radiogroup"
      aria-label="Cor da liga"
      className={variant === "compact" ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-2"}
    >
      {ALLOY_COLOR_OPTIONS.map((o) => {
        const selected = o.key === current;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.labelPt}
            title={o.labelPt}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className={`${swatch} shrink-0 transition-transform active:scale-95 disabled:opacity-50 ${alloySwatchClassName(o.key)} ${
              selected
                ? "ring-2 ring-[var(--ios-blue)] ring-offset-2 ring-offset-white dark:ring-offset-zinc-900"
                : "opacity-80 hover:opacity-100"
            }`}
          />
        );
      })}
    </div>
  );
}
