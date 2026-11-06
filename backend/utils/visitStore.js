/**
 * @file visitStore.js
 * Single source of truth for visits.
 *
 * Every visit lives in data/patients/<pid>/visits/<vid>/meta.json. All routes read
 * and write visits through this module, so the in-memory cache, the visit file and
 * the patient summary (current PAR, urgency, visit count) can never drift apart.
 */
import fs   from "fs-extra";
import path from "path";

import { PATIENT, vDir, pJson, load, save } from "./fileStore.js";
import { calcPAR, urgencyFromPAR } from "./par.js";
import { refreshSimilarityCache } from "./simCache.js";

/** In-memory cache: { [patientId]: Visit[] } */
export const visits = {};

export const metaPath = (pid, vid) => path.join(vDir(pid, vid), "meta.json");

/** Read every visit of every patient from disk into the cache (server start). */
export async function hydrateVisits() {
  for (const key of Object.keys(visits)) delete visits[key];
  const pids = (await fs.pathExists(PATIENT)) ? await fs.readdir(PATIENT) : [];
  for (const pid of pids) {
    visits[pid] = await readVisitsFromDisk(pid);
  }
  return Object.values(visits).flat().length;
}

async function readVisitsFromDisk(pid) {
  const root = vDir(pid);
  if (!(await fs.pathExists(root))) return [];
  const out = [];
  for (const vid of await fs.readdir(root)) {
    const v = await load(metaPath(pid, vid));
    if (v) out.push(v);
  }
  return out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/** All visits of a patient, oldest first. */
export function listVisits(pid) {
  return (visits[pid] || []).slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/** vid may be "latest" for the most recent completed visit. */
export function getVisit(pid, vid) {
  if (vid === "latest") return firstAndLatest(pid).latest;
  return (visits[pid] || []).find(v => v.id === vid) || null;
}

export function findVisitById(vid) {
  return Object.values(visits).flat().find(v => v.id === vid) || null;
}

/** Completed visits, first and latest (null when there are none). */
export function firstAndLatest(pid) {
  const done = listVisits(pid).filter(v => v.status === "completed");
  return { first: done[0] ?? null, latest: done[done.length - 1] ?? null, count: done.length };
}

/**
 * Persist a visit: recompute its PAR total, write meta.json, update the cache and
 * refresh the patient summary.
 */
export async function saveVisit(visit) {
  const { patientId: pid, id: vid } = visit;
  visit.boxes    = visit.boxes || [];
  visit.parScore = calcPAR(visit.boxes);
  visit.updatedAt = new Date().toISOString();

  await save(metaPath(pid, vid), visit);

  const list = (visits[pid] ||= []);
  const idx  = list.findIndex(v => v.id === vid);
  if (idx === -1) list.push(visit); else list[idx] = visit;

  await syncPatient(pid);
  await refreshSimilarityCache();
  return visit;
}

export async function deleteVisit(pid, vid) {
  const list = visits[pid] || [];
  const idx  = list.findIndex(v => v.id === vid);
  if (idx === -1) return null;
  const [removed] = list.splice(idx, 1);
  await fs.remove(vDir(pid, vid));
  await syncPatient(pid);
  await refreshSimilarityCache();
  return removed;
}

/** Recompute the summary fields stored in patient.json from its visits. */
export async function syncPatient(pid) {
  const patient = await load(pJson(pid));
  if (!patient) return null;
  const all = listVisits(pid);
  const { latest, count } = firstAndLatest(pid);
  const current = latest?.parScore ?? 0;

  patient.visits = all.map(v => ({
    id: v.id, date: v.date, status: v.status, parScore: v.parScore ?? 0, mosaicUrl: v.mosaicUrl ?? null,
  }));
  patient.totalVisits      = count;
  patient.lastVisitDate    = latest?.date ?? null;
  patient.currentPARScore  = current;
  patient.parScore         = current;
  patient.treatmentUrgency = urgencyFromPAR(current);
  patient.parComponents    = (latest?.boxes ?? []).map(b => b.component);

  await save(pJson(pid), patient);
  return patient;
}
