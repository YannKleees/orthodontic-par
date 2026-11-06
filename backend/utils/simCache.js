/**
 * @file simCache.js
 * @description
 * Cache management utility for the k-NN similarity search system. Maintains
 * vector representations of patient records used in case-based reasoning.
 * 
 * The system computes feature vectors from PAR components and clinical metrics,
 * enabling rapid similarity queries for treatment planning support.
 */

import { rebuildVectorCache } from "../../src/knn/vector-cache.ts";
import { resetCache }         from "../../src/knn/similarity.ts";
import { PATIENT }            from "./fileStore.js";
import fs   from "fs-extra";
import path from "path";

/**
 * Rebuilds the patient similarity cache by:
 * 1. Loading all valid patient records
 * 2. Regenerating feature vectors (vector-cache.json)
 * 3. Reloading the in-memory k-NN search index
 * 
 * Called after patient updates to maintain search accuracy.
 */
export async function refreshSimilarityCache() {
  const ids = (await fs.pathExists(PATIENT)) ? await fs.readdir(PATIENT) : [];
  const pats = await Promise.all(
    ids.map(id =>
      fs.readJson(path.join(PATIENT, id, "patient.json")).catch(() => null),
    ),
  ).then(arr => arr.filter(Boolean));

  await rebuildVectorCache(pats);  // Persist vectors to disk
  await resetCache();              // Update in-memory search index
}
