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
// One definition for the whole client, matching what the backend stores
import type { Visit } from "../lib/api";
export type { Visit };

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

export type { PARComponent } from "../lib/api";

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
