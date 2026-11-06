import path from "path";
import fs   from "fs-extra";
const { join } = path;
export const DATA    = join(process.cwd(), "data");
export const PATIENT = join(DATA, "patients");
export const UPLOADS = join(DATA, "uploads");          // ⇠ legacy – still used by FE
export const DATA_DIR = DATA;
export const pDir   = pid            => join(PATIENT, pid);
export const pJson  = pid            => join(pDir(pid), "patient.json");

export const vDir = (pid, vid) =>
  vid ? join(PATIENT, pid, "visits", vid)
      : join(PATIENT, pid, "visits");
export const vJson  = (pid, vid)     => join(vDir(pid, vid), "visit.json");
export const vImg   = (pid, vid)     => join(vDir(pid, vid), "images");

/**
 * @async
 * @function load
 * @description Safe JSON loader with fallback for clinical data
 * @param {string} path - File path to load
 * @param {any} fallBack - Default value if file missing/invalid
 * @returns {Promise<any>} Parsed JSON or fallback value
 */
export async function load(path, fallBack = null) {
  try { return await fs.readJson(path); } catch { return fallBack; }
}

/**
 * @async
 * @function save
 * @description Safe JSON writer with directory creation
 * @param {string} path - Target file path
 * @param {Object} obj - Data to serialize
 */
export async function save(path, obj) {
  await fs.ensureDir(join(path, ".."));
  await fs.writeJson(path, obj, { spaces: 2 });
}

/**
 * @function visitTemplate
 * @description Generate standard visit record structure
 * @param {string} pid - Patient identifier
 * @param {string} vid - Visit identifier
 * @param {string} dateISO - ISO date string
 * @returns {Object} Visit record template with standard fields
 */
export const visitTemplate = (pid, vid, dateISO) => ({
  id        : vid,
  patientId : pid,
  createdAt : dateISO,
  status    : "uploading",
  images    : { up:null, down:null, left:null, right:null, centre:null },
  mosaicUrl : null,
  parComponents : [],
  parScore  : 0,
  reportUrl : null
});

/**
 * Generates a unique filename with timestamp prefix
 * @param {string} originalName - Original filename
 * @returns {string} Unique filename
 */
export function uniqueFilename(originalName) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 7);
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  return `${base}-${timestamp}-${random}${ext}`;
}
