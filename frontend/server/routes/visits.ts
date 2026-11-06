/* ------------------------------------------------------------------ */
/*  routes/visits.ts – in-memory implementation                       */
/* ------------------------------------------------------------------ */
/** ============================================================================
 * Visits API — visit lifecycle + disk-backed mosaics (hybrid source)
 * =============================================================================
 * SOURCES
 *  - Primary: visits on disk (…/data/patients/<pid>/visits/<vid>/meta.json).
 *  - Fallback: seeded in-memory demo if disk tree absent.
 * CONTRACT
 *  - date is sortable ISO (string) enabling stable chronology.
 *  - mosaicUrl points to a thumbnail; if missing, a deterministic placeholder
 *    is substituted to keep the UI resilient.
 * VALIDATION
 *  - zod schemas enforce status ∈ {completed, upcoming, cancelled} and bound
 *    PAR values ∈ [0,50], aligning with PAR instrument limits.
 * PERFORMANCE
 *  - Directory scan is O(n visits). For production, index metadata in a DB.
 * ============================================================================ */
import { Router, Request, Response } from "express";
import { z }                         from "zod";
import type {SimilarPatient} from "@/hooks/types";
import fs from "fs/promises";
import path from "path";
/* --------------------------- data model --------------------------- */
export interface Visit {
  id              : string;
  patientId       : string;
  date            : string;           // ISO or yyyy-mm-dd
  time?           : string;
  type?           : string;
  status          : "completed" | "upcoming" | "cancelled";
  doctor?         : string;
  description?    : string;
  treatmentPhase? : string;
  parScoreAtVisit?: number;
  nextVisitDate?  : string;
  mosaicUrl?      : string;           // ← added for editor
  parScore?       : number;           // ← aggregate from boxes
  boxes?          : any[];            // ← raw PAR boxes
  notes?          : string;
}
const PLACEHOLDER = "/static/placeholders/mosaic_placeholder.png";
/* patientId → array<Visit> */
const visits: Record<string, Visit[]> = {};

/* --- helper to seed some demo records ---------------------------- */
/** Initialize a synthetic longitudinal sequence for a patient (demo only). */
function seedPatient(pid: string) {
  if (visits[pid]) return;

  const rnd = (min:number,max:number)=> Math.floor(Math.random()*(max-min))+min;

  visits[pid] = [
    {
      id   : `${pid}-visit-1`,
      patientId: pid,
      date : "2024-01-15",
      time : "10:30",
      type : "Braces Adjustment",
      status: "completed",
      doctor: "Dr. Sarah Johnson",
      description:
        "Wire change and ligature placement. PAR score improving.",
      treatmentPhase : "Active Treatment",
      parScoreAtVisit: rnd(30,50),
      notes          :
        "Patient compliance excellent. Minor discomfort expected 24-48 h."
    },
    {
      id   : `${pid}-visit-2`,
      patientId: pid,
      date : "2024-01-08",
      time : "14:15",
      type : "Initial Consultation",
      status: "completed",
      doctor: "Dr. Michael Chen",
      description:
        "Orthodontic records taken. PAR index calculated. Plan discussed.",
      treatmentPhase : "Planning",
      parScoreAtVisit: rnd(40,60),
      notes:
        "Options reviewed with patient & guardian."
    },
    {
      id   : `${pid}-visit-3`,
      patientId: pid,
      date : "2024-02-22",
      time : "11:00",
      type : "Progress Review",
      status: "upcoming",
      doctor: "Dr. Sarah Johnson",
      description:
        "6-month evaluation and PAR reassessment scheduled.",
      treatmentPhase : "Active Treatment",
      nextVisitDate  : "2024-03-22",
      notes          :
        "Include new radiographs and clinical photos."
    }
  ];
}

["patient-1","patient-2","patient-3","patient-4","patient-5","patient-6"]
  .forEach(seedPatient);

/* ---------------------------- validation ------------------------- */
const VisitSchema = z.object({
  patientId       : z.string(),
  date            : z.string(),
  time            : z.string().optional(),
  type            : z.string().optional(),
  status          : z.enum(["completed","upcoming","cancelled"]),
  doctor          : z.string().optional(),
  description     : z.string().optional(),
  treatmentPhase  : z.string().optional(),
  parScoreAtVisit : z.number().min(0).max(50).optional(),
  nextVisitDate   : z.string().optional(),
  notes           : z.string().optional(),
});

const UpdateVisitSchema = VisitSchema.partial();

/* ------------------------------------------------------------------ */
/*  router                                                            */
/* ------------------------------------------------------------------ */
export const router = Router();

/* -------- helpers ------------------------------------------------- */
/** Safe lookup for a visit (patient-scoped). */
const findVisit = (pid:string, vid:string)=> (visits[pid]||[]).find(v=>v.id===vid);

/** ============================================================================
 * GET /:patientId — list visits, preferring on-disk metadata (if present).
 * Adds resilient mosaic URLs (thumbnail + full) with placeholder fallback.
 * Query:
 *  - status?: filter by visit status
 *  - type?:   filter by type (string equality)
 *  - limit?:  clamp result length
 * ========================================================================== */
router.get("/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status, type, limit } = req.query;

    /* --------------------------------------------------------
     * Load every   …/patients/<pid>/visits/<visitId>/meta.json
     * ------------------------------------------------------ */
    const root = path.join(
      process.cwd(),
      "data",
      "patients",
      patientId,
      "visits"
    );

    let list: Visit[] = [];
    try {
      const folders = await fs.readdir(root);
      for (const dir of folders) {
        const metaPath = path.join(root, dir, "meta.json");
        const raw = await fs.readFile(metaPath, "utf8");
        const meta: Visit = { ...JSON.parse(raw) };

        /* add URLs the front-end expects */
        /*  add a thumbnail url that ALWAYS resolves – 
            if real file missing we fall back to placeholder           */
        const expected = `/static/patients/${patientId}/visits/${dir}/mosaic.png`;
        try {
          await fs.access(path.join(root, dir, "mosaic.png"));
          meta.mosaicUrl = expected;
          
        } catch {
          meta.mosaicUrl = PLACEHOLDER;
        }
        (meta as any).mosaicFullUrl = `/static/patients/${patientId}/visits/${dir}/mosaic_full.png`;
        
        list.push(meta);
      }
    } catch {
      /* no visits on disk – fall through to in-memory demo */
      list = (visits[patientId] ?? []).slice();
    }
    list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

    if (typeof limit === "string") {
      const n = parseInt(limit, 10);
      if (!Number.isNaN(n)) list = list.slice(0, n);
    }

    res.json({ success: true, data: list, count: list.length });
  } catch (err) {
     res.status(500).json({ success:false, error:"Fetch failed",
                            details: (err as Error).message });
   }
 });

/** GET /:patientId/upcoming — chronological list of scheduled visits. */
router.get("/:patientId/upcoming", (req,res)=>{
  const { patientId } = req.params;
  const up = (visits[patientId]||[])
             .filter(v=>v.status==="upcoming")
             .sort((a,b)=> Date.parse(a.date)-Date.parse(b.date));
  res.json({ success:true, data:up, count:up.length });
});

/** GET /:patientId/history — reverse-chronological completed visits. */
router.get("/:patientId/history", (req,res)=>{
  const { patientId } = req.params;
  const done = (visits[patientId]||[])
               .filter(v=>v.status==="completed")
               .sort((a,b)=> Date.parse(b.date)-Date.parse(a.date));
  res.json({ success:true, data:done, count:done.length });
});

/** GET /visit/:visitId — visit lookup by global visit ID. */
router.get("/visit/:visitId", (req,res)=>{
  const { visitId } = req.params;
  const hit = Object.values(visits)
               .flat()
               .find(v=>v.id===visitId);
  return hit
    ? res.json({ success:true, data:hit })
    : res.status(404).json({ success:false, error:"Visit not found"});
});

/** GET /:patientId/:visitId — patient-scoped visit fetch (compat). */
router.get("/:patientId/:visitId", (req,res)=>{
  const { patientId, visitId } = req.params;
  const v = findVisit(patientId, visitId);
  return v
    ? res.json({ success:true, data:v })
    : res.status(404).json({ success:false, error:"Visit not found"});
});

/** POST /:patientId — create visit; defaults ensure sortable dates and IDs. */
router.post("/:patientId", (req,res)=>{
  const { patientId } = req.params;
  const check = VisitSchema.safeParse({ ...req.body, patientId });
  if (!check.success)
    return res.status(400).json({ success:false,
      error:"Invalid data", details:check.error.errors });

  const newVisit: Visit = {
    id       : `${patientId}-visit-${Date.now()}`,
    patientId,
    date     : check.data.date ?? new Date().toISOString().slice(0,10),
    status   : check.data.status ?? "completed",
    ...check.data,
  };
  (visits[patientId] ||= []).push(newVisit);
  res.status(201).json({ success:true, data:newVisit });
});

/** PUT /:patientId/:visitId — partial update with schema validation. */
router.put("/:patientId/:visitId", (req,res)=>{
  const { patientId, visitId } = req.params;
  const idx = (visits[patientId]||[]).findIndex(v=>v.id===visitId);
  if (idx === -1)
    return res.status(404).json({ success:false, error:"Visit not found"});

  const check = UpdateVisitSchema.safeParse(req.body);
  if (!check.success)
    return res.status(400).json({ success:false,
      error:"Invalid data", details:check.error.errors });

  visits[patientId][idx] = { ...visits[patientId][idx], ...check.data };
  res.json({ success:true, data:visits[patientId][idx] });
});

/** DELETE /:patientId/:visitId — idempotent removal (404 on miss). */
router.delete("/:patientId/:visitId", (req,res)=>{
  const { patientId, visitId } = req.params;
  const idx = (visits[patientId]||[]).findIndex(v=>v.id===visitId);
  if (idx === -1)
    return res.status(404).json({ success:false, error:"Visit not found"});

  const [removed] = visits[patientId].splice(idx,1);
  res.json({ success:true, data:removed });
});
