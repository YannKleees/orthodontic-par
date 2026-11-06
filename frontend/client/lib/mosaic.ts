/**
 * Mosaic geometry, identical to backend/utils/mosaic.js.
 * 3x2 grid of 2048x1200 cells. Row 1: right, center, left. Row 2: up, down.
 * All PAR box coordinates are stored in this 6144x2400 pixel space.
 */
export const CELL_W = 2048;
export const CELL_H = 1200;
export const MOSAIC_W = CELL_W * 3;
export const MOSAIC_H = CELL_H * 2;
export const VIEWS = ["right", "center", "left", "up", "down"] as const;

/** View whose cell contains the point (x, y); "mosaic" for the empty sixth cell. */
export function viewAt(x: number, y: number): string {
  const col = Math.min(2, Math.max(0, Math.floor(x / CELL_W)));
  const row = Math.min(1, Math.max(0, Math.floor(y / CELL_H)));
  return VIEWS[row * 3 + col] ?? "mosaic";
}

/** CSS percentages of a box in mosaic space. */
export function boxStyle(c: { x: number; y: number; width: number; height: number }) {
  return {
    left  : `${(c.x / MOSAIC_W) * 100}%`,
    top   : `${(c.y / MOSAIC_H) * 100}%`,
    width : `${(c.width / MOSAIC_W) * 100}%`,
    height: `${(c.height / MOSAIC_H) * 100}%`,
  };
}
