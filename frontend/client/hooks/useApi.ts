/* ------------------------------------------------------------------
   client/hooks/useApi.ts — React data-access hooks over apiClient
   ------------------------------------------------------------------
   Purpose:
   - Provide minimal, composable hooks for network I/O with consistent
     loading/error semantics.
   - Favor idempotent GET-style reads through a generic helper (useApi),
     and expose thin hook wrappers per resource to preserve type safety.
------------------------------------------------------------------- */
import { useState, useEffect, useCallback } from "react";
import { apiClient, type ApiResponse }      from "@/lib/api";

/* Domain types: hydrate API payloads with compile-time structure ---- */
import type {
  Visit,
  Patient,
  PARComponent,
  SimilarPatient,
} from "@/hooks/types";

/* ===================================================================
   1) Generic helper — converts an async GET into a React hook
   -------------------------------------------------------------------
   Behaviour:
   - Executes apiFn() on mount and whenever `deps` changes.
   - Encapsulates tri-state control flow: data | loading | error.
   - Returns a stable `refetch` function (memoized with deps).
   Rationale:
   - Minimizes repetitive hook boilerplate while preserving explicit
     dependency control for cache invalidation or parameter changes.
=================================================================== */
export function useApi<T>(
  apiFn: () => Promise<ApiResponse<T>>,
  deps : any[] = [],                                      // recompute criterion
) {
  const [data,    setData   ] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError  ] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { success, data } = await apiFn();
      success ? setData(data) : setError("Request failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/* ===================================================================
   2) Read-only hooks — paramized selectors with automatic refetch
   -------------------------------------------------------------------
   Notes:
   - Patients: options object is stringified to form a stable memo key
     so deep-equal changes trigger refetch while avoiding referential
     mismatch on equivalent objects.
   - Other hooks use primitive dependencies (e.g., ids) for clarity.
=================================================================== */
export const usePatients = (opts?: { q?: string; parMin?: number; parMax?: number; severity?: string }) =>
  useApi<Patient[]>(
    () => apiClient.getPatients(opts),                     // pass the entire filter object
    [JSON.stringify(opts ?? {})],                          // deterministic memoization
  );

export const usePatient = (id?: string) =>
  useApi<Patient>(() => apiClient.getPatient(id!), [id]);

export const useVisits = (pid?: string, filter?: any) =>
  useApi<Visit[]>(() => apiClient.getVisits(pid!, filter), [pid, filter]);

export const useVisitDetail = (vid?: string) =>
  useApi<Visit>(() => apiClient.getVisit(vid!), [vid]);

export const useReports = (pid?: string, filter?: any) =>
  useApi<any[]>(() => apiClient.getReports(pid!, filter), [pid, filter]);

export const useSimilarPatients = (pid?: string, k = 10) =>
  useApi<SimilarPatient[]>(
    () =>
      apiClient.getSimilarPatients(pid!, k) as unknown as Promise<
        ApiResponse<SimilarPatient[]>
      >,
    [pid, k],
  );

/* ------------------------------------------------------------------
   Live PAR component stream for a visit (editor & dashboards)
   ------------------------------------------------------------------
   Semantics:
   - Observes patient/visit identity; on change, re-queries the set
     of annotated components intended for PAR aggregation and review.
------------------------------------------------------------------- */
export const usePARComponentList = (pid?: string, vid?: string) =>
  useApi<PARComponent[]>(
    () => apiClient.getPARComponent(pid!, vid!), [pid, vid]);

/* Backwards-compat alias: preserve earlier import casing semantics --- */
export const useParComponentList = usePARComponentList;

/* ===================================================================
   3) CRUD helpers — side-effectful operations as plain async calls
   -------------------------------------------------------------------
   Rationale:
   - Keep mutation semantics explicit; callers can chain invalidation
     or optimistic updates in their own scope if needed.
=================================================================== */

/** Create a new PAR component with provenance metadata (frontend tag). */
export const createPARComponent = async (
  patientId : string,
  visitId   : string,
  component : Omit<PARComponent, "id" | "lastModified">,
) =>
  apiClient.createPARComponent(patientId, visitId, {
    ...component,
    modifiedBy: "frontend",
  });

/** Patch an existing PAR component; merges partial fields. */
export const updatePARComponent = async (
  patientId   : string,
  visitId     : string,
  componentId : string,
  updates     : Partial<PARComponent>,
) =>
  apiClient.updatePARComponent(patientId, visitId, componentId, {
    ...updates,
    modifiedBy: "frontend",
  });

/** Hard-delete a PAR component by identifier. */
export const deletePARComponent = async (
  patientId   : string,
  visitId     : string,
  componentId : string,
) => apiClient.deletePARComponent(patientId, visitId, componentId);
