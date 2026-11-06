/* ============================================================================
   Domain primitives and DTOs
   ----------------------------------------------------------------------------
   Type definitions for visits, patients, PAR annotations, similarity, reports.
============================================================================= */

/* ---------------------------- primitives ------------------------- */
export type VisitStatus =
  | "completed"
  | "upcoming"
  | "cancelled"
  | "analyzing"
  | "reviewed";

/* ---------------------------- PAR box ---------------------------- */
export interface PARBox {
  id         : string;          // unique within a visit
  component  : string;          // e.g., “Upper Crowding”
  score      : number;          // observed component score (integer scale)
  maxScore   : number;          // component-specific theoretical maximum
  coordinates: { x:number; y:number; width:number; height:number }; // image-space (px)
}

/* ---------------------------- Visit ------------------------------ */
export interface Visit {
  id              : string;
  patientId       : string;
  date            : string;     // ISO-8601 (yyyy-mm-dd)
  time?           : string;
  type?           : string;
  status          : VisitStatus;
  doctor?         : string;
  description?    : string;
  treatmentPhase? : string;
  parScoreAtVisit?: number;     // clinician-entered scalar (overrides if present)
  mosaicUrl?      : string;     // relative asset path
  parScore?       : number;     // model-derived aggregate (Σ component scores)
  boxes?          : PARBox[];   // component-level annotations
  nextVisitDate?  : string;
  notes?          : string;
  mosaicWidth?    : number;     // intrinsic image width (px)
  mosaicHeight?   : number;     // intrinsic image height (px)
}

/* ---------------------------- Patient ---------------------------- */
export interface Patient {
  id              : string;
  name            : string;
  dateOfBirth     : string;
  age             : number;
  condition?      : string;
  parScore?       : number;     // latest PAR for quick display (if precomputed)
  currentPARScore?: number;     // alias for UI surfaces that expect a scalar
  treatmentUrgency?: "low" | "medium" | "high" | "emergency";
  createdAt       : string;
  status          : "Active" | "Archived" | "Completed" | "On Hold";
  visits          : Visit[];
}

export interface PARComponent {
  id: string;
  component:
    | "Upper Crowding"
    | "Lower Crowding"
    | "Upper Spacing"
    | "Lower Spacing"
    | "Overjet"
    | "Overbite"
    | "Crossbite"
    | "Centerline";
  toothRegion: string;
  score      : number;
  maxScore   : number;
  confidence : number;          // model confidence (0–100, %)
  previousScore?: number;
  coordinates: { x:number; y:number; width:number; height:number };
  viewId     : string;          // mosaic subview identifier
  editable   : boolean;
  lastModified?: string;
  modifiedBy?  : string;
}

/* ---------------------------- Similar ---------------------------- */
export interface SimilarPatient extends Patient {
  similarity: number;           // similarity index in percent
  outcome   : "excellent" | "good" | "fair";
  treatment : string;
  initialParScore?: number;
  finalParScore?  : number;
}

/* ---------------------------- Report ----------------------------- */
export interface ReportSummary {
  id       : string;
  patientId: string;
  name     : string;
  date     : string;
  type     : string;
  status   : "ready" | "draft" | "pending";
  description?: string;
}
