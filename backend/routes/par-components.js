/**
 * @file par-components.js
 * CRUD for the PAR component boxes of one visit.
 *
 *   GET    /api/par-components/:patientId/:visitId
 *   GET    /api/par-components/:patientId/:visitId/:cid
 *   POST   /api/par-components/:patientId/:visitId
 *   PUT    /api/par-components/:patientId/:visitId/:cid
 *   DELETE /api/par-components/:patientId/:visitId/:cid
 *
 * Every change goes through visitStore.saveVisit, which recomputes the visit's PAR
 * total and the patient summary.
 */
import { Router } from "express";
import { z }      from "zod";

import { getVisit, saveVisit } from "../utils/visitStore.js";
import { MAX_SCORES } from "../utils/par.js";

const COMPONENTS = Object.keys(MAX_SCORES);

const compSchema = z.object({
  component    : z.enum(COMPONENTS),
  toothRegion  : z.string().default("Unspecified"),
  score        : z.number().min(0),
  maxScore     : z.number().min(1).optional(),
  confidence   : z.number().min(0).max(100).default(100),
  previousScore: z.number().min(0).optional(),
  coordinates  : z.object({
    x: z.number(), y: z.number(), width: z.number(), height: z.number(),
  }),
  viewId     : z.string().default("mosaic"),
  editable   : z.boolean().default(true),
  modifiedBy : z.string().default("clinician"),
});
const patchSchema = compSchema.partial();

export const router = Router();

function visitOr404(req, res) {
  const visit = getVisit(req.params.patientId, req.params.visitId);
  if (!visit) res.status(404).json({ success: false, error: "Visit not found" });
  return visit;
}

router.get("/:patientId/:visitId", (req, res) => {
  const visit = visitOr404(req, res);
  if (visit) res.json({ success: true, data: visit.boxes || [] });
});

router.get("/:patientId/:visitId/:cid", (req, res) => {
  const visit = visitOr404(req, res);
  if (!visit) return;
  const comp = (visit.boxes || []).find(c => c.id === req.params.cid);
  comp
    ? res.json({ success: true, data: comp })
    : res.status(404).json({ success: false, error: "Component not found" });
});

router.post("/:patientId/:visitId", async (req, res) => {
  const parse = compSchema.safeParse(req.body);
  if (!parse.success)
    return res.status(400).json({ success: false, error: "Invalid data", details: parse.error.errors });

  const visit = visitOr404(req, res);
  if (!visit) return;

  const comp = {
    id          : `comp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...parse.data,
    maxScore    : parse.data.maxScore ?? MAX_SCORES[parse.data.component],
    source      : "clinician",
    lastModified: new Date().toISOString(),
  };
  visit.boxes = [...(visit.boxes || []), comp];
  await saveVisit(visit);
  res.status(201).json({ success: true, data: comp });
});

router.put("/:patientId/:visitId/:cid", async (req, res) => {
  const parse = patchSchema.safeParse(req.body);
  if (!parse.success)
    return res.status(400).json({ success: false, error: "Invalid data", details: parse.error.errors });

  const visit = visitOr404(req, res);
  if (!visit) return;
  const list = visit.boxes || [];
  const idx  = list.findIndex(c => c.id === req.params.cid);
  if (idx === -1) return res.status(404).json({ success: false, error: "Component not found" });

  const updated = { ...list[idx], ...parse.data, lastModified: new Date().toISOString() };
  if (parse.data.component) updated.maxScore = MAX_SCORES[parse.data.component];
  // An AI suggestion that a clinician edited is no longer an unreviewed suggestion
  if (updated.source === "ai") updated.reviewed = true;
  list[idx] = updated;
  visit.boxes = list;
  await saveVisit(visit);
  res.json({ success: true, data: updated });
});

router.delete("/:patientId/:visitId/:cid", async (req, res) => {
  const visit = visitOr404(req, res);
  if (!visit) return;
  const list = visit.boxes || [];
  const idx  = list.findIndex(c => c.id === req.params.cid);
  if (idx === -1) return res.status(404).json({ success: false, error: "Component not found" });

  const [removed] = list.splice(idx, 1);
  visit.boxes = list;
  await saveVisit(visit);
  res.json({ success: true, data: removed });
});
