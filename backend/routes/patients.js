
/**
 * @file patients.js
 * @description
 *   RESTful API endpoints for managing patient records in an orthodontic context.
 *   Provides CRUD operations and patient-level metadata, including Peer Assessment Rating (PAR) scores,
 *   treatment urgency, and visit history. All patient data is persisted in the file system.
 *
 *   Scientific context:
 *   - The Peer Assessment Rating (PAR) index is a validated tool for quantifying malocclusion severity.
 *   - Treatment urgency is derived from PAR scores using established clinical thresholds.
 *   - Patient age is computed from date of birth using ISO 8601 standards.
 */

import { Router } from "express";
import { differenceInYears, parseISO, isValid } from "date-fns";
import fs from "fs-extra";
import path from "path";
import { z } from "zod";

import {
  PATIENT, pJson, vDir, vJson, load, save
} from "../utils/fileStore.js";

import { rebuildVectorCache }        from "../../src/knn/vector-cache.ts";
import { refreshSimilarityCache }    from "../utils/simCache.js";
import { resetCache }                from "../../src/knn/similarity.ts";
import { PAR_WEIGHTS }               from "../../src/knn/feature-map.ts";
import { urgencyFromPAR }            from "../utils/parTools.js";       // ← NEW import

export const router = Router();


/**
 * Load all patient records from the file system.
 * @returns {Promise<Array<Object>>} Array of patient metadata objects.
 */

async function loadAllPatients() {
  if (!(await fs.pathExists(PATIENT))) return [];
  const ids = await fs.readdir(PATIENT);
  return Promise.all(
    ids.map(id =>
      fs.readJson(path.join(PATIENT, id, "patient.json")).catch(() => null),
    ),
  ).then(arr => arr.filter(Boolean));
}

const P_SCHEMA = z.object({
  name        : z.string().min(1),
  dateOfBirth : z.string().refine(s => isValid(parseISO(s)), "invalid ISO date"),
  status      : z.enum(["Active","Archived"]).optional(),
  treatmentUrgency: z.enum(["low","medium","high","emergency"]).optional(),
});


/**
 * Calculate the weighted total PAR score for a visit.
 * @param {Array<Object>} boxes - Array of PAR component objects.
 * @returns {number} Weighted sum of component scores.
 */
function parTotal(boxes = []) {
  return boxes.reduce(
    (s, b) => s + (b.score ?? 0) * (PAR_WEIGHTS[b.component] ?? 1),
    0
  );
}


/**
 * Aggregate patient-level metadata, including visit history, current PAR score,
 * and treatment urgency, for use in patient dashboards and analytics.
 * @param {string} pid - Patient ID.
 * @returns {Promise<Object>} Patient summary object.
 */
async function hydrate(pid) {
  if (!pid) return {};
  const dir = vDir(pid);
  if (!(await fs.pathExists(dir))) return {};

  const vIds = await fs.readdir(dir);
  if (!vIds.length) return {};

  const visits = (await Promise.all(
    vIds.map(vid => load(vJson(pid, vid)))
  )).filter(Boolean);
  const completed = visits.filter(v => v.status === "completed");

  const latest   = completed
                    .sort((a,b)=>Date.parse(b.date)-Date.parse(a.date))[0];
  const current  = latest?.parScore ?? parTotal(latest?.boxes);
  const comps    = (latest?.boxes ?? []).map(b => b.component);

  return {
    visits,
    totalVisits      : completed.length,
    lastVisitDate    : latest?.date ?? null,
    currentPARScore  : current,
    parScore         : current,
    treatmentUrgency : urgencyFromPAR(current),
    parComponents    : comps,
  };
}

/**
 * GET /api/patients
 * Returns a list of all patients with computed metadata.
 */
router.get("/", async (_q, r) => {
  const ids   = (await fs.pathExists(PATIENT)) ? await fs.readdir(PATIENT) : [];
  const items = [];

  for (const id of ids) {
    const meta = await load(pJson(id));
    if (!meta) continue;

    const add  = await hydrate(id);
    const dob  = parseISO(meta.dateOfBirth);
    meta.age   = isValid(dob) ? differenceInYears(new Date(), dob) : 0;

    items.push({ ...meta, ...add });
  }
  r.json({ success:true, data:items });
});

/**
 * GET /api/patients/:id
 * Returns a single patient by ID with computed metadata.
 */
router.get("/:id", async (q,r) => {
  const meta = await load(pJson(q.params.id));
  if (!meta) return r.status(404).json({ success:false, error:"not found" });

  const add  = await hydrate(q.params.id);
  const dob  = parseISO(meta.dateOfBirth);
  meta.age   = isValid(dob) ? differenceInYears(new Date(), dob) : 0;

  r.json({ success:true, data:{ ...meta, ...add } });
});

/**
 * POST /api/patients
 * Creates a new patient record with validated metadata.
 */
router.post("/", async (q,r) => {
  const parse = P_SCHEMA.safeParse(q.body);
  if (!parse.success)
    return r.status(400).json({ success:false, error:"invalid data", details:parse.error.errors });

  const id  = `PAT-${Date.now()}`;
  const dob = parseISO(parse.data.dateOfBirth);

  const pat = {
    id,
    createdAt        : new Date().toISOString(),
    status           : "Active",
    visits           : [],
    age              : differenceInYears(new Date(), dob),
    currentPARScore  : 0,
    parScore         : 0,                     // keep alias at zero
    treatmentUrgency : "low",
    totalVisits      : 0,
    lastVisitDate    : null,
    ...parse.data,
  };

  await save(pJson(id), pat);
  await rebuildVectorCache(await loadAllPatients());
  await resetCache();
  await refreshSimilarityCache();
  r.status(201).json({ success:true, data:pat });
});

/**
 * PUT /api/patients/:id
 * Updates an existing patient record by ID.
 */
router.put("/:id", async (q,r) => {
  const file = pJson(q.params.id);
  const pat  = await load(file);
  if (!pat) return r.status(404).json({ success:false, error:"not found" });

  const parse = P_SCHEMA.partial().safeParse(q.body);
  if (!parse.success)
    return r.status(400).json({ success:false, error:"invalid data", details:parse.error.errors });

  Object.assign(pat, parse.data);
  await save(file, pat);
  await refreshSimilarityCache();
  r.json({ success:true, data:pat });
});

/**
 * DELETE /api/patients/:id
 * Deletes a patient record and associated visit data by ID.
 */
router.delete("/:id", async (q,r) => {
  await fs.remove(pJson(q.params.id));
  await fs.remove(vDir(q.params.id));
  await rebuildVectorCache(await loadAllPatients());
  await resetCache();
  await refreshSimilarityCache();                 // ensure similarity index is clean
  r.status(204).end();
});
