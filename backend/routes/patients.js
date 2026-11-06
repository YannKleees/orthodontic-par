/**
 * @file patients.js
 *
 *   GET    /api/patients            ?search=
 *   GET    /api/patients/:id
 *   POST   /api/patients            { name, dateOfBirth, status?, notes? }
 *   PUT    /api/patients/:id
 *   DELETE /api/patients/:id
 *
 * Summary fields (current PAR, urgency, visit count) are derived from the visits by
 * utils/visitStore.js; they are never accepted from the client.
 */
import { Router } from "express";
import { differenceInYears, parseISO, isValid } from "date-fns";
import fs from "fs-extra";
import { z } from "zod";

import { PATIENT, pJson, pDir, load, save } from "../utils/fileStore.js";
import { visits, syncPatient } from "../utils/visitStore.js";
import { refreshSimilarityCache } from "../utils/simCache.js";

export const router = Router();

const P_SCHEMA = z.object({
  name        : z.string().trim().min(1),
  dateOfBirth : z.string().refine(s => isValid(parseISO(s)), "invalid ISO date"),
  status      : z.enum(["Active", "Archived"]).optional(),
  notes       : z.string().optional(),
});

function withAge(p) {
  const dob = parseISO(p.dateOfBirth);
  return { ...p, age: isValid(dob) ? differenceInYears(new Date(), dob) : 0 };
}

async function loadAll() {
  const ids = (await fs.pathExists(PATIENT)) ? await fs.readdir(PATIENT) : [];
  const out = [];
  for (const id of ids) {
    const p = await load(pJson(id));
    if (p) out.push(withAge(p));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

router.get("/", async (req, res) => {
  const q = String(req.query.search || "").trim().toLowerCase();
  let list = await loadAll();
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  res.json({ success: true, data: list, count: list.length });
});

router.get("/:id", async (req, res) => {
  const p = await load(pJson(req.params.id));
  p ? res.json({ success: true, data: withAge(p) })
    : res.status(404).json({ success: false, error: "Patient not found" });
});

router.post("/", async (req, res) => {
  const parse = P_SCHEMA.safeParse(req.body);
  if (!parse.success)
    return res.status(400).json({ success: false, error: "Invalid data", details: parse.error.errors });

  const id = `PAT-${Date.now()}`;
  await save(pJson(id), {
    id,
    createdAt: new Date().toISOString(),
    status   : "Active",
    ...parse.data,
    visits: [], totalVisits: 0, lastVisitDate: null,
    currentPARScore: 0, parScore: 0, treatmentUrgency: "low", parComponents: [],
  });
  const patient = await syncPatient(id);
  await refreshSimilarityCache();
  res.status(201).json({ success: true, data: withAge(patient) });
});

router.put("/:id", async (req, res) => {
  const file = pJson(req.params.id);
  const pat  = await load(file);
  if (!pat) return res.status(404).json({ success: false, error: "Patient not found" });

  const parse = P_SCHEMA.partial().safeParse(req.body);
  if (!parse.success)
    return res.status(400).json({ success: false, error: "Invalid data", details: parse.error.errors });

  await save(file, { ...pat, ...parse.data });
  const updated = await syncPatient(req.params.id);
  await refreshSimilarityCache();
  res.json({ success: true, data: withAge(updated) });
});

router.delete("/:id", async (req, res) => {
  if (!(await load(pJson(req.params.id))))
    return res.status(404).json({ success: false, error: "Patient not found" });
  await fs.remove(pDir(req.params.id));
  delete visits[req.params.id];
  await refreshSimilarityCache();
  res.status(204).end();
});
