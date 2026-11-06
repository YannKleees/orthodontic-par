
/**
 * @file visits.js
 * @description
 *   API endpoints for managing patient visits in an orthodontic clinical system.
 *   Supports creation, retrieval, update, and deletion of visit records.
 *   Each visit may include PAR component annotations and associated metadata.
 *
 *   Scientific context:
 *   - Visit records are timestamped and linked to patient IDs.
 *   - Visit status reflects clinical workflow (e.g., completed, upcoming).
 *   - PAR scores are stored per visit for longitudinal tracking.
 */
import { Router }          from "express";
import { promises as fs }  from "fs";
import path                from "path";
import { z }               from "zod";
import { refreshSimilarityCache } from "../utils/simCache.js";
export const visitsRouter = Router();


/**
 * In-memory cache of visits, keyed by patient ID.
 * @type {Record<string, any[]>}
 */
export const visits = {};


/**
 * Load visit metadata from disk.
 * @param {string} metaPath - Path to visit meta.json.
 * @returns {Promise<Object|null>} Visit metadata or null if not found.
 */
async function loadVisitMeta(metaPath) {
  try {
    return JSON.parse(await fs.readFile(metaPath, "utf8"));
  } catch {
    return null;
  }
}


// Hydrate the in-memory visits cache from disk at server start.
(async () => {
  try {
    const patientRoot = "data/patients";
    const pids = await fs.readdir(patientRoot).catch(() => []);
    for (const pid of pids) {
      const vRoot = path.join(patientRoot, pid, "visits");
      const dirOk = await fs
        .stat(vRoot)
        .then(s => s.isDirectory())
        .catch(() => false);
      if (!dirOk) continue;

      const vids = await fs.readdir(vRoot);
      for (const vid of vids) {
        const meta = await loadVisitMeta(path.join(vRoot, vid, "meta.json"));
        if (meta) (visits[pid] ||= []).push(meta);
      }
    }
    console.log(
      `✔︎ Visits cache hydrated (${Object.values(visits).flat().length} total)`,
    );
  } catch (e) {
    console.error("Failed to hydrate visits cache:", e);
  }
})();

// Validation schema for visit objects using Zod.
const VisitSchema = z.object({
  patientId:       z.string(),
  date:            z.string(),
  time:            z.string().optional(),
  type:            z.string().optional(),
  status:          z.enum([
    "completed",
    "upcoming",
    "cancelled",
    "analyzing",
    "reviewed",
  ]),
  doctor:          z.string().optional(),
  description:     z.string().optional(),
  treatmentPhase:  z.string().optional(),
  parScoreAtVisit: z.number().min(0).max(50).optional(),
  nextVisitDate:   z.string().optional(),
  notes:           z.string().optional(),
  mosaicUrl:       z.string().optional(),
  parScore:        z.number().optional(),
  boxes:           z.array(z.any()).optional(),
});

const UpdateVisitSchema = VisitSchema.partial();


/**
 * Find a visit by patient ID and visit ID.
 * @param {string} pid - Patient ID.
 * @param {string} vid - Visit ID.
 * @returns {Object|undefined} The visit object, if found.
 */
function findVisit(pid, vid) {
  return (visits[pid] || []).find(v => v.id === vid);
}


// -------------------- API routes --------------------

/**
 * GET /:patientId
 * List all visits for a patient, with optional filtering by status, type, and limit.
 */
visitsRouter.get("/:patientId", (req, res) => {
  const { patientId } = req.params;
  const { status, type, limit } = req.query;

  let list = (visits[patientId] || []).slice();

  if (status) list = list.filter(v => v.status === status);
  if (type)
    list = list.filter(v =>
      (v.type || "").toLowerCase().includes(type.toLowerCase()),
    );

  list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  if (limit) list = list.slice(0, Number(limit));

  res.json({ success: true, data: list, count: list.length });
});

/**
 * GET /:patientId/upcoming
 * List all upcoming visits for a patient.
 */
visitsRouter.get("/:patientId/upcoming", (req, res) => {
  const { patientId } = req.params;
  const up = (visits[patientId] || [])
    .filter(v => v.status === "upcoming")
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  res.json({ success: true, data: up, count: up.length });
});

/**
 * GET /:patientId/history
 * List all completed visits for a patient (visit history).
 */
visitsRouter.get("/:patientId/history", (req, res) => {
  const { patientId } = req.params;
  const done = (visits[patientId] || [])
    .filter(v => v.status === "completed")
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  res.json({ success: true, data: done, count: done.length });
});

/**
 * GET /visit/:visitId
 * Retrieve a single visit by visit ID (across all patients).
 */
visitsRouter.get("/visit/:visitId", (req, res) => {
  const { visitId } = req.params;
  const hit = Object.values(visits)
    .flat()
    .find(v => v.id === visitId);
  return hit
    ? res.json({ success: true, data: hit })
    : res.status(404).json({ success: false, error: "Visit not found" });
});

/**
 * GET /:patientId/:visitId
 * Retrieve a single visit by patient ID and visit ID.
 */
visitsRouter.get("/:patientId/:visitId", (req, res) => {
  const { patientId, visitId } = req.params;
  const v = findVisit(patientId, visitId);
  return v
    ? res.json({ success: true, data: v })
    : res.status(404).json({ success: false, error: "Visit not found" });
});

/**
 * POST /:patientId
 * Create a new visit for a patient.
 */
visitsRouter.post("/:patientId", async (req, res) => {
  const { patientId } = req.params;
  const chk = VisitSchema.safeParse({ ...req.body, patientId });
  if (!chk.success)
    return res
      .status(400)
      .json({ success: false, error: "Invalid data" });

  const newVisit = {
    id: `${patientId}-visit-${Date.now()}`,
    patientId,
    date: chk.data.date ?? new Date().toISOString().slice(0, 10),
    status: chk.data.status ?? "completed",
    ...chk.data,
  };

  (visits[patientId] ||= []).push(newVisit);

  const baseDir = path.join("data", "patients", patientId, "visits", newVisit.id);
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(
    path.join(baseDir, "meta.json"),
    JSON.stringify(newVisit, null, 2),
  );
  await refreshSimilarityCache();
  res.status(201).json({ success: true, data: newVisit });
});

/**
 * PUT /:patientId/:visitId
 * Update an existing visit for a patient.
 */
visitsRouter.put("/:patientId/:visitId", (req, res) => {
  const { patientId, visitId } = req.params;
  const idx = (visits[patientId] || []).findIndex(v => v.id === visitId);
  if (idx === -1)
    return res
      .status(404)
      .json({ success: false, error: "Visit not found" });

  const chk = UpdateVisitSchema.safeParse(req.body);
  if (!chk.success)
    return res
      .status(400)
      .json({ success: false, error: "Invalid data" });

  visits[patientId][idx] = { ...visits[patientId][idx], ...chk.data };
  if (chk.data.boxes && chk.data.boxes.length) {
    visits[patientId][idx].mosaicUrl =
      `/static/mosaics/${visits[patientId][idx].id}.png`;
  }
  res.json({ success: true, data: visits[patientId][idx] });
});

/**
 * DELETE /:patientId/:visitId
 * Delete a visit for a patient.
 */
visitsRouter.delete("/:patientId/:visitId", (req, res) => {
  const { patientId, visitId } = req.params;
  const idx = (visits[patientId] || []).findIndex(v => v.id === visitId);
  if (idx === -1)
    return res
      .status(404)
      .json({ success: false, error: "Visit not found" });

  const [removed] = visits[patientId].splice(idx, 1);
  res.json({ success: true, data: removed });
});
