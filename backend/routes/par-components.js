/**
 * @file Manages Peer Assessment Rating (PAR) components for patient visits.
 * @description This module defines the API endpoints for creating, reading,
 * updating, and deleting PAR components associated with a specific patient visit.
 * It handles data persistence by reading from and writing to `visit.json` files.
 */

import { Router } from "express";
import { z }      from "zod";
import { load, save, vJson } from "../utils/fileStore.js";
import fs   from "fs-extra";
import path from "path";
import { PAR_WEIGHTS } from "../../src/knn/feature-map.ts";

/**
 * @description Zod schema for validating a PAR component.
 * The Peer Assessment Rating (PAR) is an index used to measure malocclusion.
 * Each component represents a specific occlusal trait assessment.
 */
const compSchema = z.object({
  component  : z.enum([
    "Upper Crowding",
    "Lower Crowding",
    "Upper Spacing",
    "Lower Spacing",
    "Overjet",
    "Overbite",
    "Crossbite",
    "Centerline",
  ]),
  toothRegion  : z.string(),
  score        : z.number().min(0),
  maxScore     : z.number().min(1),
  confidence   : z.number().min(0).max(100),
  previousScore: z.number().min(0).optional(),
  coordinates  : z.object({
    x: z.number(), y: z.number(), width: z.number(), height: z.number(),
  }),
  viewId     : z.string(),
  editable   : z.boolean().default(true),
  modifiedBy : z.string().default("backend"),
});
const patchSchema = compSchema.partial();

/**
 * Calculates the total PAR score for a given set of components.
 * The score is a weighted sum of the individual component scores.
 * @param {Array<Object>} [boxes=[]] - An array of PAR component objects.
 * @returns {number} The total weighted PAR score.
 */
function parTotal(boxes = []) {
  return boxes.reduce((sum, b) => {
    const w = PAR_WEIGHTS[b.component] ?? PAR_WEIGHTS.Unknown ?? 1;
    return sum + (b.score ?? 0) * w;
  }, 0);
}

/**
 * Retrieves the data for a specific visit.
 * If the `visit.json` file for the visit does not exist, it falls back
 * to loading the patient's `meta.json` as a legacy or initial state.
 * @param {string} pid - The patient ID.
 * @param {string} vid - The visit ID.
 * @returns {Promise<Object>} A promise that resolves to the visit object.
 */
async function getVisit(pid, vid) {
  const json = vJson(pid, vid);
  if (await fs.pathExists(json)) return (await load(json)) || { boxes: [] };
  const meta = path.join(path.dirname(json), "meta.json");
  return (await fs.pathExists(meta)) ? (await fs.readJson(meta)) : { boxes: [] };
}

/**
 * Persists the visit data to its corresponding `visit.json` file.
 * @param {string} pid - The patient ID.
 * @param {string} vid - The visit ID.
 * @param {Object} visit - The visit object to save.
 * @returns {Promise<void>}
 */
async function writeVisit(pid, vid, visit) {
  await save(vJson(pid, vid), visit);
}

/**
 * Synchronizes PAR component data and calculated scores.
 * After any modification to a visit's components, this function updates
 * the `visit.json` with the new total PAR score and also updates the
 * patient's `meta.json` to reflect the latest score.
 * @param {string} pid - The patient ID.
 * @param {string} vid - The visit ID.
 * @param {Array<Object>} boxes - The current array of PAR components for the visit.
 * @returns {Promise<void>}
 */
async function syncVisitBoxes(pid, vid, boxes) {
  // 1. Update visit.json with the new total PAR score.
  const vFile = vJson(pid, vid);
  const visit = await getVisit(pid, vid);
  visit.status   = visit.status || "completed";
  visit.parScore = parTotal(boxes);
  await fs.writeJson(vFile, visit, { spaces: 2 });

  // 2. Update the patient's meta.json with the current PAR score for quick access.
  const pFile = path.join(path.dirname(path.dirname(vFile)), "meta.json");
  if (await fs.pathExists(pFile)) {
    const pat = await fs.readJson(pFile);
    pat.currentPARScore = visit.parScore;
    await fs.writeJson(pFile, pat, { spaces: 2 });
  }
}

export const router = Router();

/**
 * @route GET /:patientId/:visitId
 * @description Retrieves all PAR components for a specific visit.
 */
router.get("/:patientId/:visitId", async (req, res) => {
  const { patientId: pid, visitId: vid } = req.params;
  const visit = await getVisit(pid, vid);
  res.json({ success: true, data: visit.boxes || [] });
});

/**
 * @route GET /:patientId/:visitId/:cid
 * @description Retrieves a single PAR component by its ID.
 */
router.get("/:patientId/:visitId/:cid", async (req, res) => {
  const { patientId: pid, visitId: vid, cid } = req.params;
  const visit = await getVisit(pid, vid);
  const comp  = (visit.boxes || []).find(c => c.id === cid);
  comp
    ? res.json({ success: true, data: comp })
    : res.status(404).json({ success: false, error: "Not found" });
});

/**
 * @route POST /:patientId/:visitId
 * @description Creates a new PAR component for a visit.
 */
router.post("/:patientId/:visitId", async (req, res) => {
  const parse = compSchema.safeParse(req.body);
  if (!parse.success)
    return res.status(400).json({ success:false,
      error:"Invalid data", details: parse.error.errors });

  const { patientId: pid, visitId: vid } = req.params;
  const visit = await getVisit(pid, vid);

  const comp = {
    id          : `comp-${Date.now()}`,
    ...parse.data,
    lastModified: new Date().toISOString(),
  };

  visit.boxes = [...(visit.boxes || []), comp];
  await writeVisit(pid, vid, visit);
  await syncVisitBoxes(pid, vid, visit.boxes);

  res.status(201).json({ success: true, data: comp });
});

/**
 * @route PUT /:patientId/:visitId/:cid
 * @description Updates an existing PAR component.
 */
router.put("/:patientId/:visitId/:cid", async (req, res) => {
  const parse = patchSchema.safeParse(req.body);
  if (!parse.success)
    return res.status(400).json({ success:false,
      error:"Invalid data", details: parse.error.errors });

  const { patientId: pid, visitId: vid, cid } = req.params;
  const visit = await getVisit(pid, vid);
  const list  = visit.boxes || [];
  const idx   = list.findIndex(c => c.id === cid);

  if (idx === -1)
    return res.status(404).json({ success:false, error:"Not found" });

  list[idx] = {
    ...list[idx],
    ...parse.data,
    lastModified: new Date().toISOString(),
  };
  visit.boxes = list;
  await writeVisit(pid, vid, visit);
  await syncVisitBoxes(pid, vid, visit.boxes);

  res.json({ success: true, data: list[idx] });
});

/**
 * @route DELETE /:patientId/:visitId/:cid
 * @description Deletes a PAR component from a visit.
 */
router.delete("/:patientId/:visitId/:cid", async (req, res) => {
  const { patientId: pid, visitId: vid, cid } = req.params;
  const visit = await getVisit(pid, vid);
  const list  = visit.boxes || [];
  const idx   = list.findIndex(c => c.id === cid);

  if (idx === -1)
    return res.status(404).json({ success:false, error:"Not found" });

  const [removed] = list.splice(idx, 1);
  visit.boxes = list;
  await writeVisit(pid, vid, visit);
  await syncVisitBoxes(pid, vid, visit.boxes);

  res.json({ success: true, data: removed });
});
