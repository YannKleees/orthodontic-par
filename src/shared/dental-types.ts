/* shared/dental-types.ts
   -------------------------------------------------------------
   KEEP THIS FILE SMALL – only the pieces your backend needs for
   vectorisation / K‑NN.  The frontend can import the same file
   (or extend it locally) so we never have duplicate definitions.
----------------------------------------------------------------*/

export type VisitStatus =
  | "completed"
  | "upcoming"
  | "cancelled"
  | "analyzing"
  | "reviewed";

export interface PARBox {
  id: string;
  component: string;
  score: number;
  maxScore: number;
  coordinates: { x: number; y: number; width: number; height: number };
}

export interface Visit {
  id: string;
  patientId: string;
  date: string;                 
  status: VisitStatus;
  boxes?: PARBox[];
  notes?          : string;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  condition?: string;
  currentPARScore?: number;
  treatmentUrgency?: "low" | "medium" | "high" | "emergency";
  visits: Visit[];
}
