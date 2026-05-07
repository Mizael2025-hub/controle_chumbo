const nfInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nfKg1 = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatIntPtBr(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return nfInt.format(n);
}

/** Formata kg no padrão BR, com até 1 casa decimal. */
export function formatKgPtBr(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return nfKg1.format(n);
}

/** Arredonda kg para 1 casa decimal (ex.: 25,3). */
export function roundKg1(n: number): number {
  return Math.round(n * 10) / 10;
}

