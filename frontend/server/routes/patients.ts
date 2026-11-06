/** ============================================================================
 * routes/patients.ts — Patient directory (in-memory demo)
 * =============================================================================
 * SCOPE
 *  - Canonical patient registry for demos; supports CRUD + simple search and
 *    an aggregate stats endpoint. Replace with a database in production.
 * CLINICAL CONTEXT
 *  - Records include PAR score snapshots and basic demographics to support
 *    triage (e.g., treatment urgency) and longitudinal monitoring.
 * VALIDATION
 *  - zod schemas enforce structural integrity (e.g., email format) and bound
 *    PAR scores within instrument limits [0, 50].
 * ANALYTICS
 *  - /stats/overview returns cohort-level indicators (counts, mean PAR).
 * ============================================================================ */
import { Router, Request, Response } from "express";
import { z }                         from "zod";

/* ===== In-memory storage (replace with DB in production) ==========
 * ▸ exported to allow cross-route access (e.g., similar-patients). */
export let patients = [
  {
    id         : "patient-1",
    name       : "John Doe",
    age        : 16,
    condition  : "Severe Crowding",
    parScore   : 42,
    maxParScore: 50,
    dateOfBirth: "2008-03-15",
    gender     : "Male" as const,
    contactInfo: {
      phone   : "+1 (555) 123-4567",
      email   : "john.doe@email.com",
      address : "123 Main St, City, State 12345",
    },
    treatmentStartDate: "2024-01-15",
    orthodontist      : "Dr. Sarah Johnson",
    status            : "Active" as const,
  },
  {
    id         : "patient-6",
    name       : "Sarah Wilson",
    age        : 12,
    condition  : "Crossbite",
    parScore   : 32,
    maxParScore: 50,
    dateOfBirth: "2012-01-27",
    gender     : "Female" as const,
    contactInfo: {
      phone   : "+1 (555) 789-0123",
      email   : "sarah.wilson@email.com",
      address : "987 Birch Rd, City, State 12345",
    },
    treatmentStartDate: "2024-04-01",
    orthodontist      : "Dr. Michael Chen",
    status            : "Active" as const,
  },
];

/* ------------------ validation schemas ---------------------------
 * Note: In a real system, age is derived from dateOfBirth; the demo schema
 * keeps both to reduce front-end transformation in examples. */
const PatientSchema       = z.object({
  name              : z.string().min(1),
  age               : z.number().min(1).max(100),
  condition         : z.string().min(1),
  parScore          : z.number().min(0).max(50),
  maxParScore       : z.number().min(0).max(50),
  dateOfBirth       : z.string(),
  gender            : z.enum(["Male", "Female", "Other"]),
  contactInfo       : z.object({
    phone  : z.string(),
    email  : z.string().email(),
    address: z.string(),
  }),
  treatmentStartDate: z.string(),
  orthodontist      : z.string(),
  status            : z.enum(["Active", "Completed", "On Hold"]),
});
const UpdatePatientSchema = PatientSchema.partial();

/* ------------------------------------------------------------------ */
export const router = Router();

/* GET / — list/search with simple full-text filter on name/condition/id */
router.get("/", (req:Request, res:Response) => {
  try {
    const { search } = req.query as { search?:string };
    let filtered = patients;

    if (search) {
      const q = search.toLowerCase();
      filtered = patients.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.condition.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    }

    res.json({ success:true, data:filtered, count:filtered.length });
  } catch (err:any) {
    res.status(500).json({ success:false, error:"Failed to fetch patients",
                           details: err.message });
  }
});

/* GET /:id — fetch a single patient (404 on miss) */
router.get("/:id", (req:Request, res:Response) => {
  try {
    const hit = patients.find(p => p.id === req.params.id);
    return hit
      ? res.json({ success:true, data:hit })
      : res.status(404).json({ success:false, error:"Patient not found" });
  } catch (err:any) {
    res.status(500).json({ success:false, error:"Failed to fetch patient",
                           details: err.message });
  }
});

/* POST / — create new patient (schema-validated) */
router.post("/", (req:Request, res:Response) => {
  const check = PatientSchema.safeParse(req.body);
  if (!check.success)
    return res.status(400).json({ success:false, error:"Invalid data",
                                  details:check.error.errors });

  const patient = { id:`patient-${Date.now()}`, ...check.data };
  patients.push(patient);
  res.status(201).json({ success:true, data:patient,
                         message:"Patient created successfully" });
});

/* PUT /:id — partial update with validation */
router.put("/:id", (req:Request, res:Response) => {
  const idx = patients.findIndex(p => p.id === req.params.id);
  if (idx === -1)
    return res.status(404).json({ success:false, error:"Patient not found" });

  const check = UpdatePatientSchema.safeParse(req.body);
  if (!check.success)
    return res.status(400).json({ success:false, error:"Invalid data",
                                  details:check.error.errors });

  patients[idx] = { ...patients[idx], ...check.data };
  res.json({ success:true, data:patients[idx],
             message:"Patient updated successfully" });
});

/* DELETE /:id — remove a patient (idempotent 404 on miss) */
router.delete("/:id", (req:Request, res:Response) => {
  const idx = patients.findIndex(p => p.id === req.params.id);
  if (idx === -1)
    return res.status(404).json({ success:false, error:"Patient not found" });

  const removed = patients.splice(idx,1)[0];
  res.json({ success:true, data:removed,
             message:"Patient deleted successfully" });
});

/* GET /stats/overview — cohort-level summary metrics
 *  - averagePARScore reported to 2 decimals for readability. */
router.get("/stats/overview", (_req:Request, res:Response) => {
  const total      = patients.length;
  const active     = patients.filter(p => p.status==="Active").length;
  const completed  = patients.filter(p => p.status==="Completed").length;
  const avgPar     = total === 0 ? 0 :
                     Math.round(
                       patients.reduce((s,p)=> s+p.parScore,0) / total * 100
                     ) / 100;

  res.json({ success:true, data:{
    totalPatients:total, activePatients:active,
    completedPatients:completed, averagePARScore:avgPar
  }});
});
