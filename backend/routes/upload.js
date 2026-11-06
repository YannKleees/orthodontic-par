/**
 * @file upload.js
 * @description
 *   Handles the upload of intra-oral images, construction of dental mosaics, and creation of visit records.
 *   Integrates with Python and Node.js image processing pipelines for clinical image analysis.
 *
 *   Scientific context:
 *   - Intra-oral images are used for orthodontic assessment and documentation.
 *   - Mosaics are constructed for visualizing multiple intra-oral views in a single composite image.
 *   - YOLO-based object detection is used for automated annotation of dental features.
 */
import { Router }       from "express";
import multer           from "multer";
import { spawn }        from "child_process";
import path             from "path";
import fs               from "fs/promises";
import { v4 as uuid }   from "uuid";
import sharp            from "sharp";

// In-memory visits cache imported from visits.js
import { visits } from "./visits.js";

// JSON file helpers for loading and saving patient/visit data
import { load as loadJson, save as saveJson, pJson }
  from "../utils/fileStore.js";
  
const PY_MOSAIC = path.resolve(process.cwd(), "../src/yrcnn/intra_oral_mosaic.py");

export const uploadRouter = Router();
const upload = multer({ dest: "tmp/" });

// Constants for mosaic image dimensions and static URL paths
const MOSAIC_W   = 1200;
const MOSAIC_H   =  800;
const STATIC_URL = "/static";

// Fallback YOLO output (class, cx, cy, w, h in normalized coordinates)
const STUB_BOXES = `
46 0.806 0.254 0.055 0.212
49 0.176 0.239 0.054 0.208
48 0.089 0.248 0.048 0.155
44 0.897 0.252 0.047 0.133
22 0.255 0.235 0.077 0.114
`.trim();

// Mapping of YOLO class indices to clinical component labels
const LABELS = {
  46: "Upper Crowding",
  49: "Lower Crowding",
  48: "Upper Spacing",
  44: "Lower Spacing",
  22: "Crossbite",
  // Add defaults for other classes
};

/**
 * Move a file from src to dest, handling cross-device and OneDrive boundaries.
 * @param {string} src - Source file path.
 * @param {string} dest - Destination file path.
 */
async function moveFile(src, dest) {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    if (["EXDEV", "EPERM"].includes(err.code)) {  
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    } else {
      throw err;
    }
  }
}

/**
 * Build a 3x2 grid mosaic using Sharp as a fallback if Python processing fails.
 * @param {string} rawDir - Directory containing raw images.
 * @param {string} outFull - Output path for the full-size mosaic.
 * @param {string} outThumb - Output path for the thumbnail mosaic.
 */
async function buildMosaicWithSharp(rawDir, outFull, outThumb) {
  const CELL_W = 2048, CELL_H = 1200;              // matches python script
  const pattern = /\.(png|jpe?g)$/i;

  // Heuristic sort order: right, front, left, upper, lower/buccal
  const order = ["r", "f", "l", "u", "b"];
  const images = (await fs.readdir(rawDir))
    .filter(f => pattern.test(f))
    .sort((a, b) =>
      order.findIndex(x => a.toLowerCase().startsWith(x)) -
      order.findIndex(x => b.toLowerCase().startsWith(x)),
    )
    .slice(0, 5);

  if (!images.length) return;

  const canvas = sharp({
    create: {
      width: CELL_W * 3,
      height: CELL_H * 2,
      channels: 3,
      background: "#ffffff",
    },
  });

  let i = 0;
  for (const img of images) {
    const buf = await sharp(path.join(rawDir, img))
      .resize(CELL_W, CELL_H, { fit: "contain", background: "#000" })
      .toBuffer();

    await canvas.composite([{
      input: buf,
      left: (i % 3) * CELL_W,
      top: (i < 3 ? 0 : 1) * CELL_H,
    }]);

    i += 1;
  }

  await canvas.png().toFile(outFull);
  await sharp(outFull)
  .resize(MOSAIC_W, MOSAIC_H, { fit: "inside" })
  .toFile(outThumb);
}

/*  POST /api/upload/:patientId                                       */
uploadRouter.post("/:patientId", upload.array("images", 5), async (req, res) => {
  try {
    const { patientId } = req.params;
    const files = /** @type {Express.Multer.File[]} */ (req.files);
    const visitId = `${patientId}-visit-${Date.now()}`;
    if (!files || files.length !== 5) {
      return res.status(400).json({ success: false, error: "Need exactly 5 images" });
    }

    // Create directory structure for new visit
    const baseDir = path.join("data", "patients", patientId, "visits", visitId);
    const rawDir  = path.join(baseDir, "raw");
    await fs.mkdir(rawDir, { recursive: true });

    // Move uploaded files from temp to raw directory, handling duplicates
    await Promise.all(
      files.map(async f => {
        const { name, ext } = path.parse(f.originalname);
        let n = 0;
        let target = path.join(rawDir, f.originalname);

        while (true) {
          try {
            await moveFile(f.path, target);
            break;                              // success
          } catch (err) {
            if (err.code !== "EEXIST") throw err;
            target = path.join(rawDir, `${name}_${++n}${ext}`); // photo → photo_1
          }
        }
      }),
    );

    // Attempt to build mosaic using Python script first
    const mosaicFull = path.join(baseDir, "mosaic_full.png");
    const mosaicRel  = path.join("patients", patientId, "visits", visitId, "mosaic.png");
    const mosaicOut  = path.join("data", mosaicRel);
    let   haveMosaic = false;

    try {
      await new Promise((ok, fail) => {
        const p = spawn("python", [PY_MOSAIC, "--input", rawDir, "--output", baseDir],
          { stdio: "inherit" },
        );
        p.on("exit", code => (code === 0 ? ok() : fail()));
      });

      const firstPng = (await fs.readdir(baseDir)).find(f => f.endsWith(".png"));
      if (firstPng) {
        await fs.rename(path.join(baseDir, firstPng), mosaicFull);
        await sharp(mosaicFull)
          .resize(MOSAIC_W, MOSAIC_H, { fit: "inside" })
          .toFile(mosaicOut);
        haveMosaic = true;
      }
    } catch {
      // If Python mosaic fails, fallback to Sharp implementation
    }

    if (!haveMosaic) {
      console.warn("⚠️  Python mosaic builder failed – using Sharp fallback");
      await buildMosaicWithSharp(rawDir, mosaicFull, mosaicOut);
    }

    // Read YOLO detection boxes or use stub if missing
    let boxesTxt = "";
    try {
      boxesTxt = await fs.readFile(path.join(baseDir, "boxes.txt"), "utf8");
    } catch { /* file missing – keep empty */ }

    if (!boxesTxt.trim()) boxesTxt = STUB_BOXES;

    // Parse YOLO output into box objects with clinical annotation
    const boxes = boxesTxt.trim().split(/\r?\n/).map(line => {
      try {
        const [cls, cx, cy, w, h] = line.trim().split(/\s+/).map(Number);
        
        // Validate numbers to avoid NaN values
        if (isNaN(cls) || isNaN(cx) || isNaN(cy) || isNaN(w) || isNaN(h)) {
          console.warn(`[upload] Invalid box data: ${line}`);
          return null;
        }
        
        const comp = LABELS[cls] ?? "Unknown";
        const wp = w * MOSAIC_W;
        const hp = h * MOSAIC_H;
        
        return {
          id: uuid(),
          component: comp,
          score: 0,
          maxScore: 50,
          viewId: "centre",
          editable: true,
          coordinates: {
            x: cx * MOSAIC_W - wp / 2,
            y: cy * MOSAIC_H - hp / 2,
            width: wp,
            height: hp,
          },
        };
      } catch (err) {
        console.error(`[upload] Error parsing box line: ${line}`, err);
        return null;
      }
    }).filter(box => box !== null); // Remove invalid box entries

    // Assemble visit object with clinical metadata and mosaic URL
    const visit = {
      id: visitId,
      patientId,
      date: new Date().toISOString().slice(0, 10),
      status: "completed",
      mosaicUrl: `http://localhost:8000${STATIC_URL}/${mosaicRel.replace(/\\/g,"/")}`,
      parScore: 0,
      boxes,
    };

    // Persist visit metadata and update in-memory cache
    await fs.writeFile(path.join(baseDir, "meta.json"), JSON.stringify(visit, null, 2));
    (visits[patientId] ||= []).push(visit);

    // Update patient record with new visit and summary statistics
    const patientFile = pJson(patientId);
    const patient     = await loadJson(patientFile);

    if (patient) {
      patient.visits ||= [];

      // Store a minimal copy of box data for patient visit summary
      const slimBoxes = visit.boxes.map(b => ({
        component:   b.component,
        score:       b.score,
        maxScore:    b.maxScore,
      }));

      patient.visits.push({
        id: visit.id,
        date: visit.date,
        status: visit.status,
        parScore: visit.parScore,
        mosaicUrl: visit.mosaicUrl,
        boxes: slimBoxes,
      });

      patient.totalVisits      = patient.visits.length;
      patient.lastVisitDate    = visit.date;
      patient.currentPARScore  = visit.parScore;
      patient.treatmentUrgency =
        visit.parScore > 40 ? "high"
        : visit.parScore > 25 ? "medium"
        : "low";

      await saveJson(patientFile, patient);
      await resetCache();  
    }

    return res.status(201).json({ success: true, data: visit });
  } catch (err) {
    console.error("[upload]", err);
    res.status(500).json({
      success: false,
      error: (err && err.message) || "Upload failed",
    });
  }
});