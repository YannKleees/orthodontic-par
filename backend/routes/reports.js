/**
 * @file reports.js
 * @description Clinical reporting system for orthodontic treatment analysis
 * 
 * TODO: This module needs significant improvements:
 * - Implement proper clinical report templates
 * - Add standardized measurements and analysis sections
 * - Include comparative analysis between visits
 * - Support for multiple report types (progress, analysis, treatment plan)
 * - Add proper clinical image annotation support
 * - Implement proper clinical metadata handling
 * 
 * @endpoint POST /api/reports/:pid/generate
 * Generates PDF reports from clinical data:
 * - Treatment progress visualization
 * - PAR score analysis
 * - Intraoral photo documentation
 * - Treatment timeline
 */
import { Router }  from "express";
import PDFDocument from "pdfkit";
import fs          from "fs-extra";
import path        from "path";
import sizeOf      from "image-size";
import { fileURLToPath } from "url";

import { visits as visitsCache }   from "./visits.js";
import { pJson, load as loadJson } from "../utils/fileStore.js";

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);

const REPORT_ROOT   = path.join(__dirname, "..", "data", "reports");
const STATIC_PREFIX = "/static/reports";
const PUBLIC_HOST   = process.env.API_PUBLIC_HOST
                    ?? "http://localhost:8000";          // ← adjust for prod

export const router = Router();
fs.ensureDirSync(REPORT_ROOT);

/**
 * @typedef {Object} VisitSelection
 * @property {Object} first - Initial patient visit for baseline comparison
 * @property {Object} latest - Most recent completed visit
 */

/**
 * Select clinically relevant visits for report generation
 * @param {string} pid - Patient identifier
 * @returns {VisitSelection} First and latest visits
 */
function pickVisits(pid) { /* …see previous version… */ }

/**
 * Clinical measurement metadata for PAR components
 * @constant {Object} META
 */
const META = { /* …see previous version… */ };

/**
 * Convert PAR component measurements to indexed format
 * @param {Array} boxes - Array of PAR component measurements
 * @returns {Object} Indexed PAR components
 */
function toDict(boxes = []) { /* …see previous version… */ }

/* ------------------------------------------------------------------ */
router.post("/:pid/generate", async (req, res) => {
  try {
    const { pid } = req.params;
    const { visitId } = req.body ?? {};

    /* resolve patient + visit */
    const patient = await loadJson(pJson(pid));
    if (!patient) throw new Error(`Patient ${pid} not found`);
    const { first, latest } = pickVisits(pid);
    if (!latest) throw new Error("No completed visits yet");
    const visited = visitId
      ? (visitsCache[pid] || []).find(v => v.id === visitId) || latest
      : latest;

    const currentBoxes = toDict(visited.boxes);
    const firstBoxes   = toDict(first?.boxes);

    /* output paths */
    const folder   = path.join(REPORT_ROOT, pid);
    await fs.ensureDir(folder);
    const filename = `${pid}-${Date.now()}.pdf`;
    const absPath  = path.join(folder, filename);
    const pubUrl   = `${PUBLIC_HOST}${STATIC_PREFIX}/${pid}/${filename}`;

    /* ---- build PDF (identical to previous message) ---- */
    const doc    = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(absPath);
    doc.pipe(stream);
    /* … same PDF generation logic … */
    doc.end();
    await new Promise(ok => stream.on("finish", ok));

    res.json({ success:true, data:{
      id        : `report-${Date.now()}`,
      patientId : pid,
      name      : "Progress report",
      date      : new Date().toISOString().slice(0,10),
      type      : "AI Analysis",
      status    : "ready",
      description: "Automatic PDF export",
      fileUrl   : pubUrl,
    }});
  } catch (err) {
    console.error("[reports] generate failed:", err);
    res.status(500).json({ success:false, error:err.message });
  }
});
