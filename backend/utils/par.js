/**
 * @constant {Object} WEIGHTS
 * @description PAR index component weights as defined by Richmond et al. (1992)
 * Used to calculate weighted PAR scores for malocclusion severity assessment.
 * Higher weights indicate greater clinical significance in overall occlusal deviation.
 * Reference: Richmond S, et al. Eur J Orthod. 1992;14(3):180-187.
 */
const WEIGHTS = {
  "Upper Crowding": 1,  
  "Lower Crowding": 1,  
  "Upper Spacing": 1,   
  "Lower Spacing": 1,   
  "Overjet": 6,        
  "Centerline": 4,    
  "Overbite": 2,       
  "Crossbite": 1,      
};

/**
 * @function calcPAR
 * @description Calculates weighted PAR score from component measurements
 * @param {Array<Object>} components - Array of PAR components with scores
 * @returns {number} Total weighted PAR score
 */
export function calcPAR(components) {
  return components.reduce((sum, c) => {
    const weight = WEIGHTS[c.component] ?? 1;
    return sum + weight * c.score;
  }, 0);
}

/**
 * @function urgencyFromPAR
 * @description Determines treatment urgency based on PAR thresholds
 * Clinical thresholds based on orthodontic consensus:
 * - ≥40: Severe malocclusion requiring immediate intervention
 * - ≥25: Significant deviation requiring priority treatment
 * - ≥10: Moderate deviation requiring routine treatment
 * - <10: Minor deviation, monitoring recommended
 * @param {number} score - Total weighted PAR score
 * @returns {string} Urgency level: "emergency", "high", "medium", or "low"
 */
export function urgencyFromPAR(score) {
  if (score >= 40) return "emergency";
  if (score >= 25) return "high";
  if (score >= 10) return "medium";
  return "low";
}
