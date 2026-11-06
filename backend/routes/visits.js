/**
 * @file visits.js
 * Visit endpoints. Visits with photos are created by POST /api/upload/:patientId;
 * this router lists, schedules, edits, deletes and re-analyses them.
 *
 *   GET    /api/visits/:patientId                  ?status=&limit=
 *   GET    /api/visits/:patientId/upcoming
 *   GET    /api/visits/:patientId/history
 *   GET    /api/visits/visit/:visitId
 *   GET    /api/visits/:patientId/:visitId
 *   POST   /api/visits/:patientId                  schedule a visit without photos
 *   PUT    /api/visits/:patientId/:visitId         notes, status, date, ...
 *   POST   /api/visits/:patientId/:visitId/analyze re-run the detector on the stored photos
 *   DELETE /api/visits/:patientId/:visitId
 */
import { Router } from "express";
import { z }      from "zod";

import {
  visits, listVisits, getVisit, findVisitById, saveVisit, deleteVisit,
} from "../utils/visitStore.js";
import { analyseVisit } from "../utils/aiAnalysis.js";

export { visits };   // kept for older imports

export const visitsRouter = Router();

const STATUS = ["completed", "upcoming", "cancelled", "analyzing", "reviewed"];

const VisitSchema = z.object({
  date          : z.string(),
  time          : z.string().optional(),
  type          : z.string().optional(),
  status        : z.enum(STATUS).default("upcoming"),
  doctor        : z.string().optional(),
  description   : z.string().optional(),
  treatmentPhase: z.string().optional(),
  notes         : z.string().optional(),
});
// Boxes and PAR scores are changed through /api/par-components, never here
const UpdateSchema = VisitSchema.partial();

const newest = (a, b) => Date.parse(b.date) - Date.parse(a.date);

visitsRouter.get("/:patientId", (req, res) => {
  const { status, limit } = req.query;
  let list = listVisits(req.params.patientId).sort(newest);
  if (status) list = list.filter(v => v.status === status);
  if (limit)  list = list.slice(0, Number(limit));
  res.json({ success: true, data: list, count: list.length });
});

visitsRouter.get("/:patientId/upcoming", (req, res) => {
  const up = listVisits(req.params.patientId).filter(v => v.status === "upcoming");
  res.json({ success: true, data: up, count: up.length });
});

visitsRouter.get("/:patientId/history", (req, res) => {
  const done = listVisits(req.params.patientId).filter(v => v.status === "completed").sort(newest);
  res.json({ success: true, data: done, count: done.length });
});

visitsRouter.get("/visit/:visitId", (req, res) => {
  const hit = findVisitById(req.params.visitId);
  hit ? res.json({ success: true, data: hit })
      : res.status(404).json({ success: false, error: "Visit not found" });
});

visitsRouter.get("/:patientId/:visitId", (req, res) => {
  const v = getVisit(req.params.patientId, req.params.visitId);
  v ? res.json({ success: true, data: v })
    : res.status(404).json({ success: false, error: "Visit not found" });
});

visitsRouter.post("/:patientId", async (req, res) => {
  const chk = VisitSchema.safeParse(req.body);
  if (!chk.success)
    return res.status(400).json({ success: false, error: "Invalid data", details: chk.error.errors });

  const { patientId } = req.params;
  const visit = await saveVisit({
    id: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    patientId,
    ...chk.data,
    boxes: [],
  });
  res.status(201).json({ success: true, data: visit });
});

visitsRouter.put("/:patientId/:visitId", async (req, res) => {
  const visit = getVisit(req.params.patientId, req.params.visitId);
  if (!visit) return res.status(404).json({ success: false, error: "Visit not found" });

  const chk = UpdateSchema.safeParse(req.body);
  if (!chk.success)
    return res.status(400).json({ success: false, error: "Invalid data", details: chk.error.errors });

  const saved = await saveVisit({ ...visit, ...chk.data });
  res.json({ success: true, data: saved });
});

visitsRouter.post("/:patientId/:visitId/analyze", async (req, res) => {
  const visit = getVisit(req.params.patientId, req.params.visitId);
  if (!visit) return res.status(404).json({ success: false, error: "Visit not found" });
  try {
    // Clinician boxes are kept; earlier unreviewed AI suggestions are replaced
    const saved = await saveVisit(await analyseVisit(visit, { keepClinicianBoxes: true }));
    res.json({ success: true, data: saved });
  } catch (e) {
    console.error("[analyze]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

visitsRouter.delete("/:patientId/:visitId", async (req, res) => {
  const removed = await deleteVisit(req.params.patientId, req.params.visitId);
  removed ? res.json({ success: true, data: removed })
          : res.status(404).json({ success: false, error: "Visit not found" });
});
