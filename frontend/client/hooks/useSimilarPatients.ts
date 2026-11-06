/* ------------------------------------------------------------------
   useSimilarPatients.ts — data hook for nearest-neighbour retrieval
   ------------------------------------------------------------------
   Purpose:
   - Encapsulates the retrieval of K most similar patients for a
     given patient identifier (pid).
   - Uses @tanstack/react-query for caching, background refresh, and
     request deduplication.
   Scientific context:
   - The "similarity" here is typically computed by a KNN (k-nearest
     neighbours) or embedding-based search over patient feature vectors,
     where each vector encodes clinical attributes (e.g., PAR components,
     demographics, treatment history).
   - The hook is parameterised by `k`, the neighbourhood size in patient
     similarity space; higher k yields broader, potentially less similar,
     matches.
------------------------------------------------------------------- */
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { SimilarPatient } from "@/lib/api";

export const useSimilarPatients = (pid: string, k = 10) =>
  useQuery<SimilarPatient[]>({
    enabled : !!pid,                                        // only run when pid is truthy
    queryKey: ["similar", pid, k],                          // key includes k to isolate caches
    queryFn : () =>
      apiClient.getSimilarPatients(pid, k).then(r => r.data),
  });