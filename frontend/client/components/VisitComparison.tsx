/* =============================================================================
   VisitComparison
   -----------------------------------------------------------------------------
   Component for paired comparative analysis of two distinct visits for a
   single patient: a baseline and a follow-up.
   Outputs:
     • Side-by-side mosaics with annotated PAR scores.
     • Tabulated per-component PAR differences (Δ) with visual color coding.
============================================================================= */
import { useVisitComparison } from "@/hooks/useVisitComparison";
import { MosaicWithBoxes } from "./MosaicWithBoxes";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

export function VisitComparison({
  patientId, baselineId, followUpId,
}: { patientId:string; baselineId:string; followUpId:string }) {
  const { data, isLoading, error } =
    useVisitComparison(patientId, baselineId, followUpId);

  if (isLoading) return <p>Loading…</p>;
  if (error || !data) return <p>Error loading visits</p>;

  return (
    <div className="space-y-8">
      {/* Mosaics: visual baseline vs follow-up */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <p className="font-medium">
              {new Date(data.before.date).toLocaleDateString()} (baseline)
            </p>
            <p className="text-sm text-muted-foreground">
              Total PAR: {data.before.parScore}
            </p>
          </CardHeader>
          <CardContent>
            <MosaicWithBoxes visit={data.before} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="font-medium">
              {new Date(data.after.date).toLocaleDateString()} (follow-up)
            </p>
            <p className="text-sm text-muted-foreground">
              Total PAR: {data.after.parScore} &nbsp;
              <span
                className={
                  data.after.parScore! < data.before.parScore!
                    ? "text-emerald-600"
                    : "text-destructive"
                }
              >
                ({data.after.parScore! - data.before.parScore!})
              </span>
            </p>
          </CardHeader>
          <CardContent>
            <MosaicWithBoxes visit={data.after} />
          </CardContent>
        </Card>
      </div>

      {/* Quantitative Δ table: per-component breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Component</th>
              <th>Baseline</th>
              <th>Follow-up</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {data.deltas.map(d => (
              <tr key={d.component} className="border-b last:border-0">
                <td className="py-1">{d.component}</td>
                <td className="text-center">{d.before}</td>
                <td className="text-center">{d.after}</td>
                <td
                  className={
                    "text-center " +
                    (d.diff < 0
                      ? "text-emerald-600"
                      : d.diff > 0
                      ? "text-destructive"
                      : "text-muted-foreground")
                  }
                >
                  {d.diff > 0 ? "+" : ""}
                  {d.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
