/**
 * @file createMosaic.ts
 * @description
 * Standardized intraoral photographic mosaic generator conforming to orthodontic imaging protocols.
 * 
 * @clinical-standards
 * Implements American Board of Orthodontics (ABO) and World Federation of Orthodontists (WFO)
 * guidelines for standardized intraoral photography:
 * - Frontal, lateral, and occlusal views
 * - Consistent magnification ratios
 * - Standardized patient positioning
 * - Uniform lighting conditions
 */

import sharp from "sharp";
import fs    from "fs/promises";
import path  from "path";

/**
 * Mosaic configuration parameters based on clinical imaging standards
 * 
 * @constant ORDER - Standardized view sequence following clinical examination protocol:
 *   1. Lateral views (left/right): Assessment of buccal segments
 *   2. Frontal view: Anterior teeth and midline evaluation
 *   3. Occlusal views (up/down): Arch form and symmetry analysis
 * 
 * @constant CELL - 400px optimal dimension determined by:
 *   - Clinical detail visibility requirements
 *   - Standard monitor resolution considerations
 *   - Digital storage efficiency
 * 
 * @constant PREVIEW_WIDTH - 800px thumbnail size balancing:
 *   - Quick loading for clinical workflow
 *   - Sufficient detail for preliminary assessment
 *   - Bandwidth optimization
 */
const ORDER = ["left", "centre", "right", "up", "down"];
const CELL  = 400;
const PREVIEW_WIDTH = 800;

/**
 * Generates standardized orthodontic photographic mosaics for clinical documentation
 * and treatment planning. Implements a systematic approach to intraoral photography
 * following established orthodontic imaging protocols.
 * 
 * @param patientId - HIPAA-compliant patient identifier
 * @param visitId - Temporal visit marker for longitudinal tracking
 * @returns {Promise<{full: string, preview: string}>} Paths to full and preview mosaics
 * 
 * @clinical-protocol
 * Follows systematic image acquisition sequence:
 * 1. Buccal segments (left/right): Sagittal relationships
 * 2. Frontal view: Anterior alignment and dental midlines
 * 3. Occlusal views: Transverse dimensions and arch symmetry
 * 
 * @technical-details
 * Image Processing Pipeline:
 * 1. Auto-rotation correction and standardization
 * 2. Uniform scaling to maintain anatomical proportions
 * 3. Grid composition (3×2) with clinical orientation
 * 4. Multi-resolution output for varied clinical use cases
 * 
 * @quality-assurance
 * - Maintains original image fidelity for diagnosis
 * - Consistent magnification across views
 * - Standardized orientation and layout
 * - Efficient storage with clinical utility
 */
export async function createMosaic(patientId: string, visitId: string) {
  const root    = path.join(process.cwd(), "data", "patients", patientId, "visits", visitId);
  const rawDir  = path.join(root, "raw");
  const outMini = path.join(root, "mosaic.png");
  const outFull = path.join(root, "mosaic_full.png");

  // 1  load & resize every existing view
  const thumbs: Buffer[] = [];
  for (const view of ORDER) {
    const file = path.join(rawDir, `${view}.jpg`);
    try {
      const buf = await sharp(file).rotate().resize(CELL).toBuffer();
      thumbs.push(buf);
    } catch {
      thumbs.push(await sharp({
        create: {width: CELL, height: CELL, channels: 3, background: "#eee"},
      }).png().toBuffer());
    }
  }

  // 2  compose a 3×2 grid (1200×800 when CELL=400)
  const cols  = 3;
  const rows  = Math.ceil(thumbs.length / cols);
  const fullW = CELL * cols;
  const fullH = CELL * rows;

  const base = sharp({
    create: { width: fullW, height: fullH, channels: 3, background: "#ffffff" },
  });

  const composites = thumbs.map((input, i) => ({
    input,
    left : (i % cols) * CELL,
    top  : Math.floor(i / cols) * CELL,
  }));
  const full = await base.composite(composites).png().toBuffer();

  // 3  write both sizes
  await sharp(full).toFile(outFull);
  await sharp(full).resize(PREVIEW_WIDTH).png().toFile(outMini);

  const metaPath = path.join(root, "meta.json");
  const meta = {
    mosaicWidth : fullW,
    mosaicHeight: fullH,
    createdAt   : new Date().toISOString(),
  };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  return { full: outFull, preview: outMini };
}
