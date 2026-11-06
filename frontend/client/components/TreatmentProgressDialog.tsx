/* =============================================================================
   TreatmentProgressDialog
   -----------------------------------------------------------------------------
   Full-screen modal dialog for quantitative comparison between the earliest
   recorded visit ("first") and the most recent visit ("latest") for a given
   patient. Displays:
     • Orthodontic mosaic images for both timepoints.
     • Tabulated PAR score deltas (total and per-component).
     • Color-coded performance indication (green for improvement, red for decline).

   Requires: at least two completed visits with computed PAR scores.
============================================================================= */
import { Dialog, DialogContent, DialogHeader, DialogTitle } 
  from "@/components/ui/dialog";
import { Button }           from "@/components/ui/button";
import { cn }               from "@/lib/utils";
import { useFirstVsCurrent } from "@/hooks/useFirstVsCurrent";

interface Props {
  open      : boolean;
  onClose() : void;
  patientId : string;
  patientName: string;
}

export function TreatmentProgressDialog({
  open, onClose, patientId, patientName,
}: Props) {
  const { ready, before, after, deltas } = useFirstVsCurrent(patientId);

  return (
    <Dialog open={open} onOpenChange={(v)=>!v && onClose()}>
      <DialogContent className="max-w-5xl h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Treatment Progress – {patientName}
          </DialogTitle>
        </DialogHeader>

        {!ready && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Need at least two completed visits to show progress.
          </div>
        )}

        {ready && (
          <div className="flex flex-col gap-6 h-full overflow-hidden">
            {/* Image comparison: baseline vs. current mosaics */}
            <div className="grid grid-cols-2 gap-4 h-1/2">
              <figure className="border rounded relative overflow-hidden">
                <img
                  src={before.mosaicUrl}
                  className="object-contain w-full h-full"
                  alt="First visit mosaic"
                />
                <figcaption className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 text-center">
                  First visit • {before.date}
                </figcaption>
              </figure>

              <figure className="border rounded relative overflow-hidden">
                <img
                  src={after.mosaicUrl}
                  className="object-contain w-full h-full"
                  alt="Latest visit mosaic"
                />
                <figcaption className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 text-center">
                  Current visit • {after.date}
                </figcaption>
              </figure>
            </div>

            {/* Numerical metrics: total PAR change + per-component breakdown */}
            <div className="flex flex-col gap-4 overflow-auto">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Total PAR:</span>
                <span className="text-xl font-semibold">{before.parScore ?? "—"}</span>
                <span className="text-2xl">→</span>
                <span className="text-xl font-semibold">{after.parScore ?? "—"}</span>
                <span
                  className={cn(
                    "text-lg font-semibold",
                    (after.parScore ?? 0) - (before.parScore ?? 0) < 0
                      ? "text-green-600"
                      : "text-red-600",
                  )}
                >
                  {((after.parScore ?? 0) - (before.parScore ?? 0)).toFixed(1)}
                </span>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1">Component</th>
                    <th className="text-center py-1">Before</th>
                    <th className="text-center py-1">After</th>
                    <th className="text-center py-1">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {deltas.map((d) => (
                    <tr key={d.component} className="border-b last:border-0">
                      <td className="py-1 pr-2">{d.component}</td>
                      <td className="text-center">{d.before}</td>
                      <td className="text-center">{d.after}</td>
                      <td
                        className={cn(
                          "text-center font-medium",
                          d.diff < 0
                            ? "text-green-600"
                            : d.diff > 0
                              ? "text-red-600"
                              : "text-muted-foreground",
                        )}
                      >
                        {d.diff > 0 && "+"}
                        {d.diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Dialog footer */}
            <div className="mt-auto flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
