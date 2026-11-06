/** ==================================================================
 * api.ts — Core Domain Entity Types
 * ===================================================================
 * Defines the main data structures for patient management,
 * orthodontic treatment tracking, and reporting.
 * These interfaces are the "schema contracts" between the client,
 * backend API, and persistent storage.
 * They ensure type-safety across all data flow layers.
 * -------------------------------------------------------------------
 * NOTE:
 * - PAR scores refer to the Peer Assessment Rating, a clinical metric
 *   for malocclusion severity, scored per component and aggregated.
 * - The "currentPARScore" is often AI-derived, but can be clinician-verified.
 * - Computed fields like `treatmentUrgency` are dynamic and not always stored.
 * ===================================================================
 */
export interface Patient {
  id: string;                          // Globally unique Patient ID (e.g., PAT-1234567890)
  name: string;                        // Full patient name
  age: number;                         // Derived from dateOfBirth
  dateOfBirth: string;                 // ISO date string
  visits: Visit[];                     // Chronological array of clinical visits
  createdAt: string;                   // Record creation timestamp (ISO)

  status: "Active" | "Completed" | "On Hold"; // Lifecycle stage of treatment

  /** Computed / Derived properties */
  currentPARScore?: number;            // Latest visit PAR score
  treatmentUrgency?: "low" | "medium" | "high" | "emergency"; // Derived from PAR
  lastVisitDate?: string;               // ISO date of most recent visit
  totalVisits?: number;                 // Aggregate count of visits
}

/** ==================================================================
 * PARComponent — Represents a single measurable malocclusion metric
 * ===================================================================
 * Each component is scored independently, weighted in Richmond Index,
 * and used to calculate total PAR.
 * The coordinates refer to bounding boxes in mosaic images.
 * -------------------------------------------------------------------
 */
export interface PARComponent {
  id: string;                          // Unique per visit
  component:
    | "Upper Crowding"
    | "Lower Crowding"
    | "Upper Spacing"
    | "Lower Spacing"
    | "Overjet"
    | "Overbite"
    | "Crossbite"
    | "Centerline";
  toothRegion: string;                 // Anatomical subset (e.g., "Anterior")
  score: number;                       // Clinician/AI assigned score
  maxScore: number;                    // Max possible for this component
  confidence: number;                  // AI confidence (%)
  previousScore?: number;              // For longitudinal comparison
  coordinates: { x: number; y: number; width: number; height: number }; // in mosaic pixel space
  viewId: string;                       // Which intraoral view this belongs to
  editable: boolean;                    // UI flag for editability
  lastModified: string;                 // ISO timestamp of last change
  modifiedBy: string;                   // Origin of last change
}

/** ==================================================================
 * Visit — A single patient interaction + AI + clinician review
 * ===================================================================
 * Encapsulates:
 * - Raw data (images, notes)
 * - Automated analysis results
 * - Clinician review
 * - Generated reports
 * -------------------------------------------------------------------
 */
export interface Visit {
  id: string;
  patientId: string;
  date: string;                        // ISO timestamp of creation
  images: File[] | string[];           // Original intraoral images (File in browser or path string)
  notes?: string;                      // Clinician general notes

  /** Automated AI Analysis results */
  aiAnalysis: {
    parScore: number;
    parComponents: {
      upperCrowding: number;
      lowerCrowding: number;
      upperSpacing: number;
      lowerSpacing: number;
      overjet: number;
      overbite: number;
      crossbite: number;
      centerline: number;
    };
    detectedConditions: string[];     // Named conditions detected
    treatmentUrgency: "low" | "medium" | "high" | "emergency";
    confidence: number;               // Aggregate AI model confidence
    processingTime: string;           // Duration of AI pipeline
    mosaicImageUrl?: string;          // Path to generated mosaic image
  };

  /** Clinician review of AI findings */
  doctorReview: {
    status: "pending" | "reviewed" | "approved";
    reviewedBy?: string;
    reviewDate?: string;
    modifiedPARScore?: number;        // If clinician adjusted score
    doctorNotes?: string;
    treatmentRecommendations?: string[];
  };

  /** Generated clinical report */
  report: {
    id: string;
    generatedAt: string;
    type: "AI Generated" | "Doctor Reviewed";
    content: string;
    downloadUrl?: string;
  };

  status: "analyzing" | "completed" | "reviewed"; // Processing/review state
  createdAt: string;
}

/** ==================================================================
 * Report — Structured document summarising findings & plan
 * ===================================================================
 */
export interface Report {
  id: string;
  patientId: string;
  name: string;
  date: string;
  type: "AI Analysis" | "Clinical" | "Planning" | "Progress";
  status: "ready" | "draft" | "pending";
  description: string;
  parScore?: number;
  generatedBy: string;                 // Origin (AI system / clinician)
  fileUrl?: string;                     // Download path
  findings: string[];
  recommendations: string[];
}

/** ==================================================================
 * SimilarPatient — Result of similarity search
 * ===================================================================
 * Represents a case from the patient corpus with high similarity to
 * a given index patient, used for case-based reasoning and prognosis.
 * -------------------------------------------------------------------
 */
export interface SimilarPatient {
  id: string;
  name: string;
  age: number;
  condition: string;                   // Primary diagnosis
  similarity: number;                  // Similarity score (%)
  outcome: "excellent" | "good" | "fair" | "poor";
  treatment: string;
  treatmentDuration: string;
  finalParScore: number;
  initialParScore: number;
  completionDate: string;
  improvementPercentage: number;
  orthodontist: string;
  complications: string;
  patientSatisfaction: number;         // Survey result (0-100)
}

/** ==================================================================
 * UploadView — UI state tracking for image upload pipeline
 * ===================================================================
 */
export interface UploadView {
  id: string;
  name: string;
  description: string;
  uploading: boolean;
  analyzing: boolean;
  completed: boolean;
  progress: number;                     // Upload % completion
  analysisProgress: number;             // AI processing % completion
  imageUrl?: string;
  analysisResults?: {
    componentsDetected: number;
    confidence: number;
    processingTime: number;
  };
}

// API Response types
export interface ApiResponse<T> { success:boolean; data:T }

// API Client class
class ApiClient {
  private baseURL: string;
  private isDevelopment: boolean;

  constructor() {
    const fromEnv = import.meta.env.VITE_API_URL?.trim() ?? "";
    this.baseURL = (fromEnv || "/api").replace(/\/+$/, "");
    // fallback to the proxy “/api” when VITE_API_URL is not set
    this.isDevelopment = false;                     // flip to `true` for mocks
  }

  /* -------------------------------------------------------------- */
  /* Generic request helper                                          */
  /* -------------------------------------------------------------- */
  public async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {

    /* ----------  dev mode fake data  ---------- */
    if (this.isDevelopment && endpoint.includes("/par-components/")) {
      return this.handleMockPARRequest<T>(endpoint, options);
    }

    /* ----------  tidy up headers & body  ---------- */
    const { body, headers = {}, ...rest } = options;
    const newHeaders: HeadersInit = { ...headers };
    let   finalBody: BodyInit | undefined = body as BodyInit;

    if (body instanceof FormData) {
      /* LET the browser add the multipart boundary, otherwise
         the server cannot parse the payload.                */
    } else if (body !== undefined) {
      newHeaders["Content-Type"] ??= "application/json";
      if (typeof body !== "string") finalBody = JSON.stringify(body);
    }

    /* ----------  perform fetch  ---------- */
    const response = await fetch(
      `${this.baseURL}${endpoint}`,
      { ...rest, headers: newHeaders, body: finalBody },
    );

    /* ----------  parse response safely  ---------- */
    let data: any = {};
    const cType = response.headers.get("content-type");
    if (cType && cType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      if (text) data = { message: text };
    }

    if (!response.ok) {
      // propagate a useful error
      throw new Error(data.error ?? data.message ?? `HTTP ${response.status}`);
    }

    return data;
  }

  /* -------------------------------------------------------------- */
  /* very small mock layer used only when this.isDevelopment = true  */
  /* -------------------------------------------------------------- */
  private async handleMockPARRequest<T>(
    _endpoint: string,
    opts: RequestInit = {},
  ): Promise<ApiResponse<T>> {

    await new Promise(r => setTimeout(r, 120));      // simulate latency

    /* CRUD stubs -------------------------------------------------- */
    switch (opts.method) {
      case "POST":
        return { success: true, data: { id: `comp-${Date.now()}` } as T };
      case "PUT":
      case "DELETE":
        return { success: true, data: {} as T };
      default: {                                      // GET
        const demo: any[] = [
          {
            id: "comp-1",
            component: "Upper Crowding",
            toothRegion: "Anterior",
            score: 4,
            maxScore: 5,
            confidence: 94,
            coordinates: { x: 180, y: 120, width: 120, height: 80 },
            viewId: "centre",
            editable: true,
          },
          {
            id: "comp-2",
            component: "Lower Crowding",
            toothRegion: "Anterior",
            score: 3,
            maxScore: 5,
            confidence: 89,
            coordinates: { x: 200, y: 220, width: 100, height: 70 },
            viewId: "centre",
            editable: true,
          },
          {
            id: "comp-3",
            component: "Overjet",
            toothRegion: "Incisors",
            score: 6,
            maxScore: 9,
            confidence: 91,
            coordinates: { x: 220, y: 160, width: 80, height: 60 },
            viewId: "centre",
            editable: true,
          },
        ];
        return { success: true, data: demo as T };
      }
    }
  }


  // Patients API
  async getPatients(search?: string): Promise<ApiResponse<Patient[]>> {
    const searchParam = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.request<Patient[]>(`/patients${searchParam}`);
  }
  /* ------------------------------------------------------------------ */
/* Download any ready report                                          */
/* ------------------------------------------------------------------ */
async downloadReport(patientId: string, reportId: string): Promise<void> {
  const resp = await fetch(
    `/api/reports/${patientId}/${reportId}/download`,
    { credentials:"include" }
  );
  if (!resp.ok) throw new Error("Download failed");

  const blob = await resp.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${reportId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

  async getPatient(id: string): Promise<ApiResponse<Patient>> {
    return this.request<Patient>(`/patients/${id}`);
  }

  async createPatient(
    patient: Omit<Patient, "id">,
  ): Promise<ApiResponse<Patient>> {
    return this.request<Patient>("/patients", {
      method: "POST",
      body: JSON.stringify(patient),
    });
  }

  async updatePatient(
    id: string,
    updates: Partial<Patient>,
  ): Promise<ApiResponse<Patient>> {
    return this.request<Patient>(`/patients/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deletePatient(id: string): Promise<ApiResponse<Patient>> {
    return this.request<Patient>(`/patients/${id}`, {
      method: "DELETE",
    });
  }

  async getPatientStats(): Promise<
    ApiResponse<{
      totalPatients: number;
      activePatients: number;
      completedPatients: number;
      averagePARScore: number;
    }>
  > {
    return this.request("/patients/stats/overview");
  }


  async getPARComponent(
    patientId: string,
    visitId: string
  ): Promise<ApiResponse<PARComponent[]>> {
    return this.request<PARComponent[]>(
      `/par-components/${patientId}/${visitId}`,
    );
  }

  async createPARComponent(
    patientId: string,
    visitId: string,
    component: Omit<PARComponent, "id" | "lastModified">,
  ): Promise<ApiResponse<PARComponent>> {
    return this.request<PARComponent>(`/par-components/${patientId}/${visitId}`, {
      method: "POST",
      body: JSON.stringify(component),
    });
  }

  async updatePARComponent(
    patientId: string,
    visitId: string,
    componentId: string,
    updates: Partial<PARComponent>,
  ): Promise<ApiResponse<PARComponent>> {
    return this.request<PARComponent>(
      `/par-components/${patientId}/${visitId}/${componentId}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      },
    );
  }

  async deletePARComponent(
    patientId: string,
    visitId: string,
    componentId: string,
  ): Promise<ApiResponse<PARComponent>> {
    return this.request<PARComponent>(
      `/par-components/${patientId}/${visitId}/${componentId}`,
      {
        method: "DELETE",
      },
    );
  }

  async analyzePARComponents(
    patientId: string,
  ): Promise<ApiResponse<PARComponent[]>> {
    return this.request<PARComponent[]>(
      `/par-components/${patientId}/analyze`,
      {
        method: "POST",
      },
    );
  }

  // Visits API
  async getVisits(
    patientId: string,
    filters?: { status?: string; type?: string; limit?: number },
  ): Promise<ApiResponse<Visit[]>> {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.type) params.append("type", filters.type);
    if (filters?.limit) params.append("limit", filters.limit.toString());

    const queryString = params.toString();
    const endpoint = `/visits/${patientId}${queryString ? `?${queryString}` : ""}`;

    return this.request<Visit[]>(endpoint);
  }

  async getVisit(
    visitId: string
  ): Promise<ApiResponse<Visit>> {
    return this.request<Visit>(`/visits/visit/${visitId}`);
  }

  async createVisit(
    patientId: string,
    visit: Omit<Visit, "id" | "patientId">,
  ): Promise<ApiResponse<Visit>> {
    // matches Express router.post("/:patientId")
    return this.request<Visit>(`/visits/${patientId}`, {
      method: "POST",
      body: JSON.stringify(visit),
    });
  }

  async updateVisit(
    patientId: string,
    visitId: string,
    updates: Partial<Visit>,
  ): Promise<ApiResponse<Visit>> {
    return this.request<Visit>(`/visits/${patientId}/${visitId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteVisit(
    patientId: string,
    visitId: string,
  ): Promise<ApiResponse<Visit>> {
    return this.request<Visit>(`/visits/${patientId}/${visitId}`, {
      method: "DELETE",
    });
  }

  async getUpcomingVisits(patientId: string): Promise<ApiResponse<Visit[]>> {
    return this.request<Visit[]>(`/visits/${patientId}/upcoming`);
  }

  async getVisitHistory(patientId: string): Promise<ApiResponse<Visit[]>> {
    return this.request<Visit[]>(`/visits/${patientId}/history`);
  }

  // Reports API
  async getReports(
    patientId: string,
    filters?: { type?: string; status?: string; limit?: number },
  ): Promise<ApiResponse<Report[]>> {
    const params = new URLSearchParams();
    if (filters?.type) params.append("type", filters.type);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.limit) params.append("limit", filters.limit.toString());

    const queryString = params.toString();
    const endpoint = `/reports/${patientId}${queryString ? `?${queryString}` : ""}`;

    return this.request<Report[]>(endpoint);
  }

  async getReport(
    patientId: string,
    reportId: string,
  ): Promise<ApiResponse<Report>> {
    return this.request<Report>(`/reports/${patientId}/${reportId}`);
  }

  async createReport(
    patientId: string,
    report: Omit<Report, "id" | "patientId" | "date">,
  ): Promise<ApiResponse<Report>> {
    return this.request<Report>(`/reports/${patientId}`, {
      method: "POST",
      body: JSON.stringify(report),
    });
  }

  async updateReport(
    patientId: string,
    reportId: string,
    updates: Partial<Report>,
  ): Promise<ApiResponse<Report>> {
    return this.request<Report>(`/reports/${patientId}/${reportId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteReport(
    patientId: string,
    reportId: string,
  ): Promise<ApiResponse<Report>> {
    return this.request<Report>(`/reports/${patientId}/${reportId}`, {
      method: "DELETE",
    });
  }

  async generateReport(
    patientId: string,
    type?: string,
  ): Promise<ApiResponse<Report>> {
    return this.request<Report>(`/reports/${patientId}/generate`, {
      method: "POST",
      body: JSON.stringify({ type }),
    });
  }

  async getReportSummary(patientId: string): Promise<
    ApiResponse<{
      totalReports: number;
      readyReports: number;
      draftReports: number;
      pendingReports: number;
      reportTypes: Record<string, number>;
      latestReport: Report | null;
    }>
  > {
    return this.request(`/reports/${patientId}/summary`);
  }

  // Similar Patients API
  async getSimilarPatients(id: string, k = 10) {
    return this.request<SimilarPatient[]>(
       `/similar-patients/${id}?k=${k}`);
  };

  async getSimilarPatient(
    patientId: string,
    similarId: string,
  ): Promise<ApiResponse<SimilarPatient>> {
    return this.request<SimilarPatient>(
      `/similar-patients/${patientId}/${similarId}`,
    );
  }

  async searchSimilarPatients(
    patientId: string,
    criteria: {
      conditions?: string[];
      ageRange?: { min: number; max: number };
      parScoreRange?: { min: number; max: number };
      outcomes?: string[];
      minSimilarity?: number;
    },
  ): Promise<ApiResponse<SimilarPatient[]>> {
    return this.request<SimilarPatient[]>(
      `/similar-patients/${patientId}/search`,
      {
        method: "POST",
        body: JSON.stringify(criteria),
      },
    );
  }

  async getSimilarPatientOutcomes(patientId: string): Promise<
    ApiResponse<{
      totalSimilarPatients: number;
      outcomeDistribution: Record<string, number>;
      averages: {
        similarity: number;
        treatmentDuration: number;
        improvementPercentage: number;
        patientSatisfaction: number;
      };
      successRate: number;
    }>
  > {
    return this.request(`/similar-patients/${patientId}/outcomes`);
  }

  // Uploads API
  async getUploadViews(): Promise<ApiResponse<UploadView[]>> {
    return this.request<UploadView[]>("/uploads");
  }

  async getUploadView(viewId: string): Promise<ApiResponse<UploadView>> {
    return this.request<UploadView>(`/uploads/${viewId}`);
  }

  async updateUploadView(
    viewId: string,
    updates: Partial<UploadView>,
  ): Promise<ApiResponse<UploadView>> {
    return this.request<UploadView>(`/uploads/${viewId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async startUpload(viewId: string): Promise<ApiResponse<UploadView>> {
    
    return this.request<UploadView>(`/uploads/${viewId}/upload`, {
      method: "POST",
    });
  }

  async resetUploads(): Promise<ApiResponse<UploadView[]>> {
    return this.request<UploadView[]>("/uploads/reset", {
      method: "POST",
    });
  }

  async getUploadProgress(): Promise<
    ApiResponse<{
      totalViews: number;
      completedViews: number;
      uploadingViews: number;
      analyzingViews: number;
      overallProgress: number;
      avgUploadProgress: number;
      avgAnalysisProgress: number;
      allCompleted: boolean;
    }>
  > {
    return this.request("/uploads/progress/overview");
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export utility functions for common operations
export const apiUtils = {
  // Calculate total PAR score from components
  calculateTotalPARScore: (components: PARComponent[]): number => {
    return components.reduce((total, comp) => total + comp.score, 0);
  },

  // Format treatment duration
  formatTreatmentDuration: (months: number): string => {
    if (months < 12) return `${months} months`;
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) return `${years} year${years > 1 ? "s" : ""}`;
    return `${years} year${years > 1 ? "s" : ""}, ${remainingMonths} month${remainingMonths > 1 ? "s" : ""}`;
  },

  // Get outcome color for similar patients
  getOutcomeColor: (outcome: SimilarPatient["outcome"]): string => {
    switch (outcome) {
      case "excellent":
        return "text-green-600";
      case "good":
        return "text-blue-600";
      case "fair":
        return "text-yellow-600";
      case "poor":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  },

  // Format PAR score with percentage
  formatPARScore: (score: number, maxScore: number = 50): string => {
    if (!maxScore) return `${score} / –`;
      const percentage = Math.round((score / maxScore) * 100);
    return `${score}/${maxScore} (${percentage}%)`;
  },

  // Check if patient needs attention based on PAR score
  needsAttention: (parScore: number, maxScore: number = 50): boolean => {
    return parScore / maxScore > 0.8; // Above 80% of max score
  },
};
