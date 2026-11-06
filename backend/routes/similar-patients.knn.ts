/**
 * @file similar-patients.knn.ts
 * @description k-Nearest Neighbors (k-NN) implementation for orthodontic case similarity
 * 
 * Scientific basis:
 * - Cosine similarity over normalized feature vectors
 * - Features: age, PAR scores, condition encoding
 * - Linear k-NN search (optimal for N < 10k cases)
 * - Real-time patient similarity queries
 * 
 * @endpoint GET /api/similar-patients/:pid
 * @query k - Number of similar cases to return (default: 10)
 */
import { Router } from "express";
import type { Request, Response } from "express-serve-static-core"
import { knn, resetCache }           from "../../src/knn/similarity.ts";
import { rebuildVectorCache }        from "../../src/knn/vector-cache.ts";
import { PATIENT }                   from "../utils/fileStore.js";
import fs   from "fs-extra";
import path from "path";
;

export const router = Router();

/**
 * Vector operations for similarity computation
 * @module VectorMath
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

/**
 * @module SimilarPatientAPI
 * 
 * RESTful endpoints for k-NN similarity search:
 * - GET /:patientId - Find k most similar cases
 * - POST /:patientId/search - Advanced filtered search
 * 
 * Response includes:
 * - Patient demographics
 * - Similarity scores (0-100%)
 * - Treatment outcomes
 * - PAR score deltas
 */
async function neighboursOrThrow(pid:string, k:number) {
  const data = await knn(pid, k);
  return { success:true, data, count:data.length };
}

/* ---------- route ------------------------------------------------ */
router.get("/:pid", async (req, res) => {
  try {
    const raw = Number(req.query.k) || 10;
    const k   = Math.min(Math.max(raw, 1), 20);   // 1 ≤ k ≤ 20
    const data = await knn(req.params.pid, k);
    res.json({ success: true, data, count: data.length });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});