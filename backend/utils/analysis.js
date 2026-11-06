
/**
 * @file analysis.js
 * @description
 *   Provides image analysis utilities for orthodontic patient records, including
 *   construction of dental mosaics and extraction of Peer Assessment Rating (PAR) components
 *   from model predictions. The PAR index is a validated clinical tool for quantifying malocclusion severity.
 *
 *   Scientific context:
 *   - Mosaic images are constructed from standardized intraoral photographs (views: up, left, centre, right, down).
 *   - Detected regions are mapped to PAR components using a class-to-label mapping.
 *   - Bounding box coordinates are normalized and mapped to pixel space for annotation.
 *   - The quick PAR score is a placeholder for a more rigorous algorithm based on component scoring.
 */

import fs   from "fs-extra";
import path from "path";
import Jimp from "jimp";
import { DATA_DIR } from "../config";

/**
 * Mapping from model class indices to PAR component labels.
 * Keys correspond to class indices from the detection model.
 * Values are clinical component names as defined in the PAR index.
 */
const LABELS = {
  7 : "Overjet",
  16: "Upper Crowding",
  22: "Upper Spacing",
  41: "Lower Crowding",
  44: "Crossbite",
  46: "Centerline",
  48: "Lower Spacing",
  49: "Overbite",
};


/**
 * Constructs a dental mosaic image from multiple intraoral photographs and extracts bounding boxes
 * for detected PAR components based on model output. Returns the mosaic image URL, a quick PAR score,
 * and the list of detected boxes.
 *
 * @param {string} visitId - Unique identifier for the patient visit.
 * @param {Object} images - Object mapping view names (up, left, centre, right, down) to image URLs.
 * @returns {Promise<{mosaicUrl: string, parScore: number, boxes: Array<Object>}>}
 */
export async function buildMosaicAndBoxes (visitId, images) {
  const ordered = ["up","left","centre","right","down"]
        .map(k => images[k]).filter(Boolean);
  const bitmaps  = await Promise.all(ordered.map(src => Jimp.read(path.join("public", src))));

  const TILE_W = 400, TILE_H = 266;
  const mosaic = new Jimp(TILE_W*3, TILE_H*3, 0xffffffff);

  // Define grid positions for each view to mimic clinical layout
  const grid = {
    up     : [TILE_W, 0],
    left   : [0, TILE_H],
    centre : [TILE_W, TILE_H],
    right  : [TILE_W*2, TILE_H],
    down   : [TILE_W, TILE_H*2],
  };

  // Paste and scale each image into the mosaic grid
  Object.entries(images).forEach(([view, url], i) => {
    const [gx, gy] = grid[view];
    mosaic.composite(bitmaps[i].resize(TILE_W, TILE_H), gx, gy);
  });

  // Save the resulting mosaic image to disk
  const mosaicName = `${visitId}-mosaic.jpg`;
  const mosaicPath = path.join("public/uploads", visitId, mosaicName);
  await fs.ensureDir(path.dirname(mosaicPath));
  await mosaic.quality(85).writeAsync(mosaicPath);

  // Parse model output labels and convert to bounding box objects
  const lblFile = path.join("uploads_raw", visitId, "classes.txt");
  const rawTxt  = await fs.readFile(lblFile, "utf8");
  const boxes   = rawTxt.trim().split(/\r?\n/).map((line,idx) => {
    const [cls, xc, yc, w, h] = line.split(/\s+/).map(Number);
    const comp = LABELS[cls];
    if (!comp) return null; // Ignore unknown classes
    return {
      id         : `box-${idx}`,
      component  : comp,
      score      : 0, 
      maxScore   : 5,
      confidence : 100,
      viewId     : "centre",
      coordinates: {
        x      : (xc - w/2) * mosaic.bitmap.width,
        y      : (yc - h/2) * mosaic.bitmap.height,
        width  : w * mosaic.bitmap.width,
        height : h * mosaic.bitmap.height,
      },
    };
  }).filter(Boolean);

  // Quick PAR score: number of detected components
  const parScore = boxes.length;

  return {
    mosaicUrl : `/uploads/${visitId}/${mosaicName}`,
    parScore,
    boxes,
  };
}
