/** ==================================================================
 * mosaicUrl — Utility to construct static mosaic image URL
 * ===================================================================
 * PURPOSE:
 * - Generates the HTTP URL for a patient's visit mosaic image.
 *
 * SCIENTIFIC CONTEXT:
 * - Ensures consistent access paths for both thumbnail and full
 *   resolution mosaics in the static file system.
 *
 * @param patientId Unique patient identifier
 * @param visitId   Unique visit identifier
 * @param thumb     If true, returns the downscaled thumbnail path;
 *                  if false, returns full resolution mosaic path.
 * @returns URL string (relative to server base)
 * ===================================================================
 */
const API = import.meta.env.VITE_API_URL ?? ""; // "" in dev for proxy

export function mosaicUrl(patientId:string, visitId:string, thumb=true){
  const file = thumb ? "mosaic.png" : "mosaic_full.png";
  return `/static/patients/${patientId}/visits/${visitId}/${file}`;
}
