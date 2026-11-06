/**
 * @file mosaic.js
 * Builds the 3x2 visit mosaic and converts view-image coordinates into mosaic
 * coordinates. Row 1: right, center, left. Row 2: up (upper occlusal), down (lower
 * occlusal). Each view is scaled to fit a 2048x1200 cell and centred on black.
 */
import sharp from "sharp";

export const VIEWS  = ["right", "center", "left", "up", "down"];
export const CELL_W = 2048;
export const CELL_H = 1200;
export const THUMB_W = 1200;
export const THUMB_H = 800;

export function cellOrigin(view) {
  const i = VIEWS.indexOf(view);
  if (i === -1) throw new Error(`unknown view ${view}`);
  return { x: (i % 3) * CELL_W, y: i < 3 ? 0 : CELL_H };
}

/** Scale and offset of an image of size w x h inside its cell ("contain", centred). */
export function placement(w, h) {
  const scale = Math.min(CELL_W / w, CELL_H / h);
  return { scale, offX: (CELL_W - w * scale) / 2, offY: (CELL_H - h * scale) / 2 };
}

/** Map a box [x1, y1, x2, y2] in view-image pixels to {x, y, width, height} in mosaic pixels. */
export function toMosaic(view, [x1, y1, x2, y2], w, h) {
  const { x: cx, y: cy } = cellOrigin(view);
  const { scale, offX, offY } = placement(w, h);
  return {
    x     : Math.round(cx + offX + x1 * scale),
    y     : Math.round(cy + offY + y1 * scale),
    width : Math.round((x2 - x1) * scale),
    height: Math.round((y2 - y1) * scale),
  };
}

/** viewFiles: { right, center, left, up, down } -> image paths */
export async function buildMosaic(viewFiles, outFull, outThumb) {
  const layers = [];
  for (const view of VIEWS) {
    const input = await sharp(viewFiles[view])
      .rotate()                                   // honour EXIF orientation from phones
      .resize(CELL_W, CELL_H, { fit: "contain", background: "#000" })
      .toBuffer();
    const { x, y } = cellOrigin(view);
    layers.push({ input, left: x, top: y });
  }
  await sharp({ create: { width: CELL_W * 3, height: CELL_H * 2, channels: 3, background: "#ffffff" } })
    .composite(layers)
    .png()
    .toFile(outFull);
  await sharp(outFull).resize(THUMB_W, THUMB_H, { fit: "inside" }).toFile(outThumb);
}
