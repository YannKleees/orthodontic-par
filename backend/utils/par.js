/**
 * @file par.js
 * PAR index helpers shared by every route.
 *
 * Weights follow the UK weighting of the PAR index (Richmond et al., Eur J Orthod 1992;
 * 14(3):180-187): anterior segment displacement (crowding/spacing) x1, overjet x6,
 * overbite x2, centreline x4, buccal occlusion (crossbite) x1.
 */
export const WEIGHTS = {
  "Upper Crowding": 1,
  "Lower Crowding": 1,
  "Upper Spacing" : 1,
  "Lower Spacing" : 1,
  "Overjet"       : 6,
  "Overbite"      : 2,
  "Centerline"    : 4,
  "Crossbite"     : 1,
};

/** Highest score the editor allows per component. */
export const MAX_SCORES = {
  "Upper Crowding": 5,
  "Lower Crowding": 5,
  "Upper Spacing" : 5,
  "Lower Spacing" : 5,
  "Overjet"       : 4,
  "Overbite"      : 4,
  "Crossbite"     : 4,
  "Centerline"    : 4,
};

/** Weighted PAR total of a list of components ({ component, score }). */
export function calcPAR(components = []) {
  return components.reduce((sum, c) => sum + (WEIGHTS[c.component] ?? 1) * (Number(c.score) || 0), 0);
}

/**
 * Treatment urgency bands used by the dashboard. These are the prototype's own
 * thresholds for sorting patients, not a clinical guideline.
 */
export function urgencyFromPAR(score = 0) {
  if (score >= 40) return "emergency";
  if (score >= 25) return "high";
  if (score >= 10) return "medium";
  return "low";
}
