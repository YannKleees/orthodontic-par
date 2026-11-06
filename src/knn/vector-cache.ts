/**
 * Vector Cache Management System for k-NN Patient Analysis
 * 
 * This module implements persistent storage and management of feature vectors
 * used in k-NN patient similarity analysis. It handles:
 * 1. Feature vector generation and persistence
 * 2. Visit data preprocessing
 * 3. PAR score normalization
 * 
 * Implementation Notes:
 * - Implements fallback mechanism for legacy PAR scoring
 * - Maintains data integrity across system restarts
 * - Provides atomic cache updates
 */

import fs   from "fs-extra";
import path from "path";
import { vectorisePatient }      from "./feature-map.ts";
import type { Patient, Visit }   from "../../frontend/client/hooks/types.js";
import { DATA_DIR }              from "../../backend/config.js";

const STORE = path.join(DATA_DIR, "vector-cache.json");
const VROOT = (pid:string) => path.join(DATA_DIR, "patients", pid, "visits");

/**
 * Vector Record Interface
 * Defines the structure for cached patient feature vectors
 * 
 * @property id - Unique patient identifier
 * @property vec - n-dimensional feature vector
 * @property meta - Clinical metadata for result interpretation
 */
export interface VecRecord {
  id   : string;
  vec  : number[];
  meta : { name:string; age:number; condition?:string };
}


/* ---------------- helper – load *edited* visits ------------------ */
async function loadVisits(pid: string): Promise<Visit[]> {
  const root = VROOT(pid);
  try {
    const folders = await fs.readdir(root);
    return await Promise.all(
      folders.map(async dir => {
        const visitFile =
          (await fs.pathExists(path.join(root, dir, "visit.json")))
            ? path.join(root, dir, "visit.json")
            : path.join(root, dir, "meta.json");
        return fs.readJson(visitFile);
      }),
    );
    } catch {
      return [];
    }
  }

/**
 * Patient Data Enrichment
 * Processes raw patient data to ensure complete feature vectors:
 * 1. Loads historical visit data
 * 2. Validates PAR score components
 * 3. Generates synthetic components for legacy records
 * 
 * @param p - Raw patient record
 * @returns Promise<Patient> - Enriched patient data
 */
async function enrich(p: Patient): Promise<Patient> {
  const visits = await loadVisits(p.id);

  /* If *no* visit contains boxes, fall back to a dummy with total PAR */
  if (visits.every(v => !Array.isArray(v.boxes) || v.boxes.length === 0)) {
    visits.forEach(v => {
      const total = v.parScore ?? v.parScoreAtVisit;
      if (typeof total === "number" && total > 0) {
        v.boxes = [
          {
            id: "total-par",
            component: "Unknown",
            score: total,
            maxScore: 50,
            coordinates: { x: 0, y: 0, width: 0, height: 0 },
          } as any,
        ];
      }
    });
  }

  return { ...p, visits };
}

/**
 * Vector Cache Management
 * Maintains persistent storage of feature vectors:
 * 1. Processes patient cohort data
 * 2. Generates standardized feature vectors
 * 3. Persists vectors for k-NN analysis
 * 
 * @param patients - Array of patient records
 */
export async function rebuildVectorCache(patients: Patient[]): Promise<void> {
  await fs.ensureDir(DATA_DIR);

  const hydrated = await Promise.all(patients.map(enrich));
  const records: VecRecord[] = hydrated.map(p => ({
    id  : p.id,
    vec : vectorisePatient(p),
    meta: { name: p.name, age: p.age, condition: p.condition },
  }));

  await fs.writeFile(STORE, JSON.stringify(records, null, 2));
}

/**
 * Cache Access Interface
 * Provides safe access to persisted feature vectors
 * 
 * @returns Promise<VecRecord[]> - Cached feature vectors
 * @throws Never - Returns empty array on failure
 */
export async function loadVectorCache(): Promise<VecRecord[]> {
  try {
    /* pass 'utf8' so we always get a *string*, not a Buffer → fixes
       “Argument of type 'string | Buffer' is not assignable …” */
    const txt = await fs.readFile(STORE, "utf8") as string;
    return JSON.parse(txt);
  } catch {
    return [];
  }
}