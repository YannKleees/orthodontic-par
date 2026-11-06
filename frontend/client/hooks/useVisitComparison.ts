
/* ------------------------------------------------------------------
   client/hooks/useVisitComparison.ts
   ------------------------------------------------------------------
   Purpose:
   - Produces a paired comparison between two visits of the same patient
     (baseline vs follow-up), yielding per-component PAR score deltas.
   Scientific context:
   - This is a longitudinal analysis; PAR deltas quantify malocclusion
     change per anatomical component between two clinical timepoints.
   - "Baseline" is the reference (earlier) visit, "followUp" is the newer
     visit; positive deltas indicate worsening for that component if
     higher scores denote more severe deviation.
------------------------------------------------------------------- */
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Visit, PARComponent } from "@/hooks/types";

export function useVisitComparison(
  patientId: string,
  baselineId: string,        // chronologically earlier visit
  followUpId: string         // chronologically later visit
) {
  return useQuery({
    enabled : !!patientId && !!baselineId && !!followUpId,
    queryKey: ["visit-comparison", baselineId, followUpId],
    queryFn : async () => {
      // Fetch both visits in parallel to minimise latency
      const [a, b] = await Promise.all([
        apiClient.getVisit(baselineId).then(r => r.data),
        apiClient.getVisit(followUpId).then(r => r.data),
      ]);

      /* Aggregate PAR scores by component name
         Rationale:
         - Normalises across possible multiple bounding boxes for the same
           component in one visit by summation.
         - Component name serves as the primary key for alignment between visits.
      */
      const byName = (v: Visit) =>
        (v.boxes ?? []).reduce<Record<string,number>>(
          (m,c)=>(m[c.component]=(m[c.component]||0)+c.score, m), {}
        );

      const pa = byName(a);
      const pb = byName(b);
      const allNames = new Set([...Object.keys(pa), ...Object.keys(pb)]);

      /* Construct delta array:
         - `before`: baseline score
         - `after` : follow-up score
         - `diff`  : signed change (after − before)
      */
      const deltas = [...allNames].map(name => ({
        component: name,
        before   : pa[name] ?? 0,
        after    : pb[name] ?? 0,
        diff     : (pb[name] ?? 0) - (pa[name] ?? 0),
      }));

      return { before:a, after:b, deltas };
    },
  });
}
