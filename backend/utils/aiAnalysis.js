/**
 * @file aiAnalysis.js
 * Runs the OMNI detector (ml/infer.py) on the five stored views of a visit and turns
 * the detections into suggested PAR component boxes on the mosaic.
 *
 * What the detector can and cannot do
 * -----------------------------------
 * The model is trained on the public OMNI dataset, whose labels are findings
 * (deep overjet, tooth torsion, tooth misalignment, ...) rather than PAR scores.
 * So the mapping below only proposes WHERE a PAR component is affected:
 *   deep_overjet                       -> Overjet
 *   tooth_torsion, tooth_misalignment  -> Upper / Lower Crowding (arch from the view)
 * Every suggestion starts at score 1, the lowest non-zero grade, and is marked
 * source "ai" + reviewed false. The clinician sets the real grade in the editor.
 * Other findings (appliances, mandibular retrusion, erupting teeth) are listed on
 * the visit but not scored, because they have no direct PAR component.
 */
import { spawn } from "child_process";
import fs   from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

import { vDir } from "./fileStore.js";
import { MAX_SCORES } from "./par.js";
import { VIEWS, toMosaic } from "./mosaic.js";

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const INFER  = path.join(ROOT, "ml", "infer.py");
export const MODEL = process.env.OMNI_MODEL ? path.resolve(process.env.OMNI_MODEL)
                                            : path.join(ROOT, "models", "omni_yolo11.pt");
const PYTHON = process.env.PYTHON || "python";
const CONF   = Number(process.env.OMNI_CONF || 0.3);
const TIMEOUT_MS = 180_000;

const CROWDING   = new Set(["tooth_torsion", "tooth_misalignment"]);
const APPLIANCES = new Set(["orthodontic_brace", "fixed_device", "cast_fixed_appliance", "invisible_attachment"]);
const OCCLUSAL_VIEW = { Upper: "up", Lower: "down" };

/** Where the normalised view images of a visit are stored. */
export const viewsDir  = (pid, vid) => path.join(vDir(pid, vid), "views");
export const viewFile  = (pid, vid, view) => path.join(viewsDir(pid, vid), `${view}.png`);

function runDetector(files) {
  return new Promise((resolve, reject) => {
    const args = [INFER, "--model", MODEL, "--conf", String(CONF),
                  ...VIEWS.map(v => `${v}=${files[v]}`)];
    const proc = spawn(PYTHON, args, { cwd: ROOT });
    let out = "", err = "";
    const timer = setTimeout(() => { proc.kill(); reject(new Error("detector timed out")); }, TIMEOUT_MS);
    proc.stdout.on("data", d => { out += d; });
    proc.stderr.on("data", d => { err += d; });
    proc.on("error", e => { clearTimeout(timer); reject(e); });
    proc.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`detector exited with ${code}: ${err.trim().split("\n").pop()}`));
      try { resolve(JSON.parse(out)); } catch { reject(new Error("detector returned invalid JSON")); }
    });
  });
}

function archOf(view, det, height) {
  if (view === "up")   return "Upper";
  if (view === "down") return "Lower";
  const centreY = (det.box[1] + det.box[3]) / 2;   // frontal/buccal: upper arch is the top half
  return centreY < height / 2 ? "Upper" : "Lower";
}

function iou(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const area = r => (r[2] - r[0]) * (r[3] - r[1]);
  return inter / (area(a) + area(b) - inter);
}

/** One box per tooth: torsion and misalignment often mark the same tooth. Keep the more confident. */
function mergeOverlaps(items, threshold = 0.5) {
  const kept = [];
  for (const it of [...items].sort((a, b) => b.det.confidence - a.det.confidence)) {
    if (!kept.some(k => k.view === it.view && iou(k.det.box, it.det.box) > threshold)) kept.push(it);
  }
  return kept;
}

const regionOf = view => (view === "center" ? "Anterior" : view === "up" || view === "down" ? "Occlusal" : "Buccal");

function suggestion(component, view, det, size, now) {
  return {
    id          : `ai-${view}-${Math.random().toString(36).slice(2, 9)}`,
    component,
    toothRegion : component === "Overjet" ? "Anterior" : regionOf(view),
    score       : 1,
    maxScore    : MAX_SCORES[component],
    confidence  : Math.round(det.confidence * 100),
    coordinates : toMosaic(view, det.box, size.width, size.height),
    viewId      : view,
    editable    : true,
    source      : "ai",
    aiLabel     : det.label,
    reviewed    : false,
    modifiedBy  : "ai",
    lastModified: now,
  };
}

/** Turn detector output into PAR suggestions and a findings summary. */
export function toSuggestions(result) {
  const now = new Date().toISOString();
  const boxes = [];
  const crowding = { Upper: [], Lower: [] };   // [{view, det, size}]
  let overjet = null;
  const findings = {};

  for (const [view, data] of Object.entries(result.views)) {
    const size = { width: data.width, height: data.height };
    for (const det of data.detections) {
      const f = (findings[det.label] ||= { label: det.label, count: 0, maxConfidence: 0, views: [] });
      f.count += 1;
      f.maxConfidence = Math.max(f.maxConfidence, Math.round(det.confidence * 100));
      if (!f.views.includes(view)) f.views.push(view);

      if (CROWDING.has(det.label)) crowding[archOf(view, det, data.height)].push({ view, det, size });
      if (det.label === "deep_overjet" && (!overjet || det.confidence > overjet.det.confidence))
        overjet = { view, det, size };
    }
  }

  // A rotated tooth is often visible in the occlusal AND a frontal/buccal photo. To avoid
  // counting it twice, use the occlusal view of an arch when it has detections and fall
  // back to the other views only when it has none.
  for (const arch of ["Upper", "Lower"]) {
    const occlusal = crowding[arch].filter(c => c.view === OCCLUSAL_VIEW[arch]);
    const chosen   = mergeOverlaps(occlusal.length ? occlusal : crowding[arch]);
    for (const c of chosen) boxes.push(suggestion(`${arch} Crowding`, c.view, c.det, c.size, now));
  }
  // Overjet is one measurement per patient: keep the most confident detection only
  if (overjet) boxes.push(suggestion("Overjet", overjet.view, overjet.det, overjet.size, now));

  const list = Object.values(findings).sort((a, b) => b.count - a.count);
  return {
    boxes,
    findings: list,
    applianceDetected  : list.some(f => APPLIANCES.has(f.label)),
    mandibularRetrusion: list.some(f => f.label === "mandibular_retrusion"),
  };
}

/**
 * Analyse a visit and return the updated visit (not yet saved).
 * keepClinicianBoxes: keep boxes a clinician drew or reviewed; replace old AI suggestions.
 */
export async function analyseVisit(visit, { keepClinicianBoxes = true } = {}) {
  const { patientId: pid, id: vid } = visit;
  const files = Object.fromEntries(VIEWS.map(v => [v, viewFile(pid, vid, v)]));
  const kept  = keepClinicianBoxes
    ? (visit.boxes || []).filter(b => b.source !== "ai" || b.reviewed)
    : [];
  const ranAt = new Date().toISOString();

  if (!(await fs.pathExists(MODEL))) {
    return { ...visit, boxes: kept, ai: { status: "no-model", ranAt,
      message: `Detector weights not found at ${path.relative(ROOT, MODEL)}. Train them with ml/train.py.` } };
  }
  for (const v of VIEWS) {
    if (!(await fs.pathExists(files[v])))
      return { ...visit, boxes: kept, ai: { status: "failed", ranAt, message: `Missing stored view: ${v}` } };
  }

  try {
    const result = await runDetector(files);
    const { boxes, ...summary } = toSuggestions(result);
    return { ...visit, boxes: [...kept, ...boxes],
             ai: { status: "done", ranAt, model: result.model, confidenceThreshold: result.conf,
                   suggestions: boxes.length, ...summary } };
  } catch (e) {
    console.error("[ai]", e.message);
    return { ...visit, boxes: kept, ai: { status: "failed", ranAt, message: e.message } };
  }
}
