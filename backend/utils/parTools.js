/**
 * @file parTools.js
 * @description PAR (Peer Assessment Rating) index utility functions
 * Based on Richmond's standardized orthodontic assessment methodology.
 */

/**
 * @function urgencyFromPAR
 * @description Evaluates treatment priority based on PAR score
 * Modified thresholds for clinical decision support:
 * - Critical: ≥40 (severe functional/aesthetic impact)
 * - High: ≥30 (significant deviation)
 * - Medium: ≥15 (moderate deviation)
 * - Low: <15 (minor irregularities)
 * @param {number} [score=0] - Total weighted PAR score
 * @returns {string} Clinical urgency classification
 */
export function urgencyFromPAR(score = 0) {
  if (score >= 40) return "emergency";
  if (score >= 30) return "high";
  if (score >= 15) return "medium";
  return "low";
}
