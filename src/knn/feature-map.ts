/******************************************************************
 * Orthodontic Feature Vector Generation and Normalization
 * 
 * Mathematical Model:
 * This module implements a multi-dimensional feature space transformation
 * for orthodontic case analysis. It combines:
 * 1. Peer Assessment Rating (PAR) indices (Richmond et al., 1992)
 * 2. Temporal treatment parameters
 * 3. Clinical severity metrics
 * 
 * Feature Vector Format: R^n where n = |PAR components| + 3
 * Each vector element ∈ [0,1] after normalization
 ******************************************************************/
import type { Patient } from "../../frontend/client/hooks/types.js";

/**
 * PAR Index Component Weights (β)
 * Derived from validated clinical studies (Richmond et al., 1992)
 * 
 * Weighting Schema:
 * - Major displacement factors (β ≥ 4): Centerline, Overjet
 * - Moderate factors (1.5 ≤ β < 4): Crossbite, Overbite
 * - Minor factors (β < 1.5): Crowding, Spacing
 */
export const PAR_WEIGHTS: Record<string, number> = {
  "Upper Crowding": 1,
  "Lower Crowding": 1,
  "Upper Spacing" : 0.7,
  "Lower Spacing" : 0.7,
  Overjet         : 6,
  Overbite        : 2,
  Crossbite       : 1.5,
  Centerline      : 4,
  Unknown         : 0.5,          // fallback “total only”
};

/**
 * Global Feature Weight Coefficients (α)
 * 
 * Linear combination parameters for the composite similarity metric:
 * S = Σ(αᵢxᵢ) where:
 * - xᵢ: normalized feature values
 * - αᵢ: corresponding weight coefficients
 */
export const TOTAL_PAR_W      = 3;   // Comprehensive PAR coefficient
export const AGE_W            = 0.8; // Age normalization coefficient (years/100)
export const SEVERITY_W       = 1;   // Clinical urgency coefficient
export const TREATMENT_LEN_W  = 0.5; // Treatment duration coefficient (months/60)

/**
 * Ordinal Severity Scale Transformation
 * Maps categorical urgency levels to normalized numerical domain [0,1]
 * Using equal interval discretization
 */
const SEV_MAP = { low: 0, medium: 1, high: 2, emergency: 3 } as const;

/**
 * Feature Vector Generation Algorithm
 * 
 * Input: Patient clinical data P
 * Output: Normalized feature vector v ∈ R^n where n = dim(feature space)
 * 
 * Process:
 * 1. Temporal data extraction (t_latest)
 * 2. Component-wise PAR normalization: p_i = PAR_i/MAX_PAR
 * 3. Clinical parameter normalization: c_j ∈ [0,1]
 * 4. Vector composition: v = [p₁,...,pₙ, c₁,...,cₘ]
 * 
 * @param p - Patient clinical record
 * @returns Normalized n-dimensional feature vector
 */
export function vectorisePatient(p: Patient): number[] {
  // Find most recent completed visit with valid PAR measurements
  const latest = [...(p.visits ?? [])]
    .filter(v =>
      (v.status === "completed" || v.status === undefined) &&
      Array.isArray(v.boxes) && v.boxes.length > 0
    )
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];

  // Calculate normalized component-wise PAR scores (scale: 0-1)
  const parScores = Object.keys(PAR_WEIGHTS).map(() => 0);
  latest?.boxes?.forEach(b => {
    const key = b.component in PAR_WEIGHTS ? b.component : "Unknown";
    const i   = Object.keys(PAR_WEIGHTS).indexOf(key);
    parScores[i] = b.score ?? 0;
  });

  const MAX_COMP = 5;                         // Richmond components: 0‑5
  const parNorm  = parScores.map(s => s / MAX_COMP);     // 0 – 1

  /* ── 3.  Scalar features – all forced into a safe 0–1 domain */
  const age = Math.min(Math.max(p.age ?? 0, 0), 120) / 100; // clamp 0‑120 yr

  const totalPAR = Math.min(
    (p.currentPARScore ?? 0) / 50,             // 0‑50 → 0‑1
    1,
  );

  const severity =
    SEV_MAP[p.treatmentUrgency ?? "low"] / 3;  // 0,0.33,0.66,1

  const completed = (p.visits ?? []).filter(v => v.status === "completed");
  const dates     = completed.map(v => Date.parse(v.date)).sort((a, b) => a - b);
  const months    =
    dates.length >= 2
      ? Math.min(
          (dates.at(-1)! - dates[0]) / (1000 * 3600 * 24 * 30.44),
          60,                                   // cap at 5 years
        ) / 60                                  // → 0‑1
      : 0;

  return [
    ...parNorm,
    totalPAR,
    age,
    severity,
    months,
  ];
}

/**
 * Feature Weight Vector
 * Parallel weight vector w where:
 * - dim(w) = dim(feature vector)
 * - Preserves component ordering for dot product operations
 */
export const FEATURE_WEIGHTS: number[] = [
  ...Object.values(PAR_WEIGHTS),
  TOTAL_PAR_W,
  AGE_W,
  SEVERITY_W,
  TREATMENT_LEN_W,
];
