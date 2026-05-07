/** Grade máxima do PROJECT_MAP (7 colunas × 4 linhas). */
export const GRID_COLS = 7;
export const GRID_ROWS = 4;
export const MAX_PILES_PER_BATCH = GRID_COLS * GRID_ROWS;

export function gridCoordsFromIndex(index: number): { x: number; y: number } {
  return { x: index % GRID_COLS, y: Math.floor(index / GRID_COLS) };
}
