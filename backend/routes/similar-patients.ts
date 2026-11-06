
/**
 * @file similar-patients.ts
 * @description
 *   Provides endpoints for k-nearest neighbor (k-NN) similarity search among patients,
 *   based on vectorized clinical features (e.g., PAR scores, visit history).
 *   Used for clinical decision support and case-based reasoning.
 *
 *   Scientific context:
 *   - Similarity is computed using weighted cosine distance over patient feature vectors.
 *   - Vector cache is rebuilt as needed to ensure up-to-date results.
 */

import { Router } from "express";
import { knn, resetCache } from "../../src/knn/similarity.ts";
import { rebuildVectorCache } from "../../src/knn/vector-cache.ts";
import fs from "fs-extra";
import path from "path";


/**
 * Load all patient records for similarity computation.
 * @returns {Promise<Array<Object>>} Array of patient objects.
 */
async function loadAllPatients() {
  const dir = path.join(process.cwd(), "data", "patients");
  if (!(await fs.pathExists(dir))) return [];
  const ids = await fs.readdir(dir);
  return Promise.all(
    ids.map(id =>
      fs.readJson(path.join(dir, id, "patient.json")).catch(() => null),
    ),
  ).then(arr => arr.filter(Boolean));
}
export const router = Router();


/**
 * GET /api/similar-patients/:pid?k=5
 * Returns the k most similar patients to the given patient ID, based on feature vectors.
 * Rebuilds the vector cache if necessary.
 */
router.get("/:pid", async (req, res) => {
  try {
    const k = Number(req.query.k) || 5;
    let data;
      try {
        data = await knn(req.params.pid, k);
      } catch (e:any) {
        // If vector is missing, rebuild cache and retry
        if (/not found/i.test(e.message)) {
          const pats = await loadAllPatients();
          await rebuildVectorCache(pats);
          await resetCache();
          data = await knn(req.params.pid, k);
        } else {
          throw e;
        }
      }

    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, error: (e as Error).message });
  }
});
