/**
 * @file uploads.js
 * POST /api/upload/:patientId  (multipart, field "images", exactly 5 files)
 *
 * 1. Assign each photo to a view (right, center, left, up, down). The view comes from
 *    the file name (e.g. "up.jpg", "frontal.png", "IMG_lower.jpg") or, if a file name
 *    says nothing, from the remaining free slots in upload order.
 * 2. Store a normalised PNG per view in <visit>/views/ (kept so a visit can be re-analysed).
 * 3. Build the mosaic (mosaic_full.png + mosaic.png thumbnail).
 * 4. Run the detector and save the visit with its suggested PAR boxes.
 *
 * Optional body fields: date (ISO), notes.
 */
import { Router } from "express";
import multer     from "multer";
import path       from "path";
import fs         from "fs-extra";
import sharp      from "sharp";

import { DATA, pJson, vDir, load } from "../utils/fileStore.js";
import { saveVisit } from "../utils/visitStore.js";
import { analyseVisit, viewsDir, viewFile } from "../utils/aiAnalysis.js";
import { VIEWS, buildMosaic } from "../utils/mosaic.js";

export const uploadRouter = Router();

const TEMP = path.join(DATA, "temp");
fs.ensureDirSync(TEMP);
const upload = multer({
  dest: TEMP,
  limits: { files: 5, fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const TOKENS = {
  right : ["RIGHT", "R", "RECHTS", "DROITE"],
  left  : ["LEFT", "L", "LINKS", "GAUCHE"],
  center: ["CENTER", "CENTRE", "C", "FRONT", "FRONTAL", "F", "ANTERIOR"],
  up    : ["UP", "U", "UPPER", "MAXILLA", "MAXILLARY", "OBEN"],
  down  : ["DOWN", "D", "LOWER", "MANDIBLE", "MANDIBULAR", "B", "UNTEN"],
};

/** View named in a file name, matching whole words such as "lower" in "IMG_lower_2.jpg". */
function viewFromName(filename) {
  const words = path.parse(filename).name.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  for (const [view, names] of Object.entries(TOKENS))
    if (words.some(w => names.includes(w))) return view;
  return null;
}

uploadRouter.post("/:patientId", upload.array("images", 5), async (req, res) => {
  const files = req.files || [];
  const cleanup = () => Promise.all(files.map(f => fs.remove(f.path)));
  const { patientId } = req.params;

  try {
    if (!(await load(pJson(patientId)))) {
      await cleanup();
      return res.status(404).json({ success: false, error: "Patient not found" });
    }
    if (files.length !== 5) {
      await cleanup();
      return res.status(400).json({ success: false,
        error: `Upload exactly 5 intraoral photos (got ${files.length}).` });
    }

    // (1) assign views: named files first, the rest fill free slots in upload order
    const assigned = {};
    const unnamed  = [];
    for (const f of files) {
      const view = viewFromName(f.originalname);
      if (view && !assigned[view]) assigned[view] = f; else unnamed.push(f);
    }
    for (const f of unnamed) {
      const free = VIEWS.find(v => !assigned[v]);
      assigned[free] = f;
    }

    const visitId = `visit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const dir     = vDir(patientId, visitId);
    await fs.ensureDir(viewsDir(patientId, visitId));

    // (2) normalised PNG per view (EXIF rotation applied, longest side capped)
    for (const view of VIEWS) {
      await sharp(assigned[view].path)
        .rotate()
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .png()
        .toFile(viewFile(patientId, visitId, view));
    }
    await cleanup();

    // (3) mosaic
    const views = Object.fromEntries(VIEWS.map(v => [v, viewFile(patientId, visitId, v)]));
    await buildMosaic(views, path.join(dir, "mosaic_full.png"), path.join(dir, "mosaic.png"));

    // (4) AI suggestions, then save (recomputes PAR and the patient summary)
    const base = {
      id       : visitId,
      patientId,
      date     : req.body?.date || new Date().toISOString(),
      status   : "completed",
      notes    : req.body?.notes || "",
      mosaicUrl: `/static/patients/${patientId}/visits/${visitId}/mosaic.png`,
      mosaicFullUrl: `/static/patients/${patientId}/visits/${visitId}/mosaic_full.png`,
      viewFiles: Object.fromEntries(Object.entries(assigned).map(([v, f]) => [v, f.originalname])),
      boxes    : [],
    };
    const visit = await saveVisit(await analyseVisit(base));
    res.status(201).json({ success: true, data: visit });
  } catch (e) {
    console.error("[upload]", e);
    await cleanup();
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});
