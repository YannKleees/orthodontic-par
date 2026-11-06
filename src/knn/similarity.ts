/**
 * K-Nearest Neighbors Implementation for Orthodontic Patient Similarity Analysis
 * 
 * This module implements a weighted k-NN algorithm using cosine similarity metrics
 * for patient comparison in high-dimensional feature space. The implementation
 * uses standardized (z-score) features with domain-specific weightings.
 */

import { loadVectorCache } from "./vector-cache.ts";
import { FEATURE_WEIGHTS } from "./feature-map.ts";
import type { VecRecord }  from "./vector-cache.ts";

/**
 * Runtime Cache Management
 * μ: Feature-wise mean vectors for standardization
 * σ: Population standard deviations for feature normalization
 */
let cache: VecRecord[] = [];
let μ: number[] = [];   // per‑dimension mean
let σ: number[] = [];   // per‑dimension population std‑dev

/**
 * Statistical Functions
 * 
 * Implementation of fundamental statistical operations for feature normalization:
 * - mean: Calculates feature-wise arithmetic means
 * - std: Computes population standard deviations
 * - dot: Vector dot product for similarity computation
 * - mag: Vector magnitude (L2 norm)
 */
const mean = (M: number[][]): number[] =>
  M[0].map((_, i) => M.reduce((s, v) => s + v[i], 0) / M.length);

const std = (M: number[][], mu: number[]): number[] =>
  M[0].map((_, i) => {
    const v = Math.sqrt(
      M.reduce((s, row) => s + (row[i] - mu[i]) ** 2, 0) / M.length,
    );
    return v || 1;                        // avoid divide‑by‑zero
  });

const dot = (a: number[], b: number[]) =>
  a.reduce((s, v, i) => s + v * b[i], 0);

const mag = (v: number[]) => Math.sqrt(dot(v, v));

/**
 * Distance Metric Implementation
 * 
 * Cosine distance calculation:
 * d(a,b) = 1 - cos(θ) = 1 - (a·b)/(||a||·||b||)
 * 
 * Range: [0,2] where:
 * - 0: vectors point in same direction (most similar)
 * - 1: vectors are orthogonal
 * - 2: vectors point in opposite directions (least similar)
 */
function cosineDistance(a: number[], b: number[]): number | undefined {
  const denom = mag(a) * mag(b);
  if (denom === 0) return undefined;
  return 1 - dot(a, b) / denom;
}

/**
 * Feature Standardization
 * 
 * Applies z-score standardization with domain weights:
 * z = ((x - μ)/σ) * w
 * where w is the feature-specific weight
 */
const zWeight = (v: number[]): number[] =>
  v.map((x, i) => ((x - μ[i]) / σ[i]) * FEATURE_WEIGHTS[i]);

async function ensureCache() {
  if (cache.length) return;
  cache = await loadVectorCache();
  const M = cache.map(r => r.vec);
  μ = mean(M);
  σ = std(M, μ);
}

/**
 * K-Nearest Neighbors Core Algorithm
 * 
 * Identifies k most similar patients based on weighted feature vectors:
 * 1. Standardizes target patient features
 * 2. Computes pairwise distances to all other patients
 * 3. Returns k nearest matches with similarity metrics
 * 
 * @param patientId - Target patient identifier
 * @param k - Number of neighbors to return (default: 10)
 * @returns Array of k most similar patients with distance metrics
 */
export interface SimilarPatient {
  id        : string;
  name      : string;
  age       : number;
  condition?: string;
  similarity: number;   // percentage 0‑100 (higher = more similar)
  distance  : number;   // raw cosine distance 0‑2   (lower  = more similar)
}
export async function resetCache(): Promise<void> {
  cache = [];
  μ = [];
  σ = [];
  await ensureCache();               // ← rebuilds everything lazily
  console.log("✔︎ similarity cache rebuilt");
}
export async function knn(patientId: string, k = 10): Promise<SimilarPatient[]> {
  await ensureCache();

  const target = cache.find(r => r.id === patientId);
  if (!target)
    throw new Error(`Vector for ${patientId} not found – rebuild cache first`);

  const tz = zWeight(target.vec);  

  return cache
    .filter(r => r.id !== patientId)
    .map(r => {
      const dz = zWeight(r.vec);
      const dist = cosineDistance(dz, tz);

      if (dist === undefined) return null; 
      const simPct = ((2 - dist) / 2) * 100;
      // clamp, then %
      return {
        id        : r.id,
        name      : r.meta.name,
        age       : r.meta.age,
        condition : r.meta.condition,
        distance  : +dist.toFixed(6),
        similarity: +simPct.toFixed(2),
      } as SimilarPatient;
    })
    .filter((p): p is SimilarPatient => p !== null)
    /* sort by highest similarity (= lowest distance) */
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
}
