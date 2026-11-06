/* ------------------------------------------------------------------
   Returns first-visit vs latest-visit summary and per-component deltas
   ------------------------------------------------------------------
   Intent:
   - Canonicalize longitudinal comparison to bookend visits (oldest vs newest)
     among completed observations, enabling interpretable change metrics.
   - Delegates delta computation to useVisitComparison to ensure consistent
     PAR component weighting and naming across the application.
------------------------------------------------------------------- */
import { useVisits }           from "./useApi";
import { useVisitComparison }  from "./useVisitComparison";

export function useFirstVsCurrent(patientId: string) {
  /* 1) Acquire visit universe and filter to completed observations. --------- */
  const { data: visitList } = useVisits(patientId);
  const completed = Array.isArray(visitList)
    ? visitList.filter(v => v.status === "completed")
    : [];

  /* 2) Determine bookends: chronologically earliest vs latest. -------------- */
  const sortedCompleted = [...completed].sort(
    (a, b) => Date.parse(a.date) - Date.parse(b.date),
  );

  const first  = sortedCompleted[0];
  const latest = sortedCompleted[sortedCompleted.length - 1];

  /* 3) Maintain hook call order: invoke comparison unconditionally. ---------- */
  const cmp = useVisitComparison(
    patientId,
    first  ? first.id  : "",
    latest ? latest.id : "",
  );

  /* 4) Output structure: readiness indicator + raw visits + deltas. ---------- */
  return {
    ready : completed.length >= 2,
    before: first,
    after : latest,
    deltas: cmp.deltas ?? [],
    ...cmp,                     // exposes aligned before/after aggregates
  };
}
  return {
    ready : uniqueCompleted.length >= 2,
    before: first,
    after : latest,
    deltas: cmp.deltas ?? [],
    ...cmp,                     // also exposes before / after PAR etc.
  };
}
