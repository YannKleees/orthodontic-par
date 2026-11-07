/**
 * @file VisitsTab.tsx
 * All visits of a patient, newest first: mosaic thumbnail, PAR total, the state of the
 * automatic analysis and notes. "New visit" opens the five-photo upload; "Re-run AI"
 * analyses the stored photos again (clinician boxes are kept).
 */
import { useState } from "react";
import { Calendar, Search, X, PlusCircle, RefreshCw, Bot, AlertTriangle } from "lucide-react";
import FullScreenModal from "./FullScreenModal";
import AddVisitForm from "./AddVisitForm";
import { Button } from "./ui/button";
import { apiClient, type Visit } from "@/lib/api";
import { useVisits } from "@/hooks/useApi";
import "./PatientSidebar.css";

interface VisitsTabProps {
  patientName: string;
  patientId: string;
  onOpenVisit?: (visitId: string) => void;
}

function AiBadge({ visit }: { visit: Visit }) {
  const ai = visit.ai;
  if (!ai) return <span className="text-xs text-gray-500">No automatic analysis</span>;
  if (ai.status !== "done")
    return (
      <span className="text-xs text-amber-700 flex items-center gap-1" title={ai.message}>
        <AlertTriangle className="w-3 h-3" /> AI not run: {ai.message}
      </span>
    );
  const open = (visit.boxes ?? []).filter(b => b.source === "ai" && !b.reviewed).length;
  return (
    <span className="text-xs text-gray-700 flex items-center gap-1">
      <Bot className="w-3 h-3" /> {ai.suggestions} AI suggestion(s), {open} not reviewed
      {ai.applianceDetected ? " · appliance visible" : ""}
    </span>
  );
}

export function VisitsTab({ patientName, patientId, onOpenVisit }: VisitsTabProps) {
  const { data, loading, error, refetch } = useVisits(patientId);
  const [showWizard, setShowWizard] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const visits = [...(data ?? [])].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const q = query.trim().toLowerCase();
  const filtered = q
    ? visits.filter(v =>
        new Date(v.date).toLocaleDateString().includes(q) ||
        (v.notes ?? "").toLowerCase().includes(q) ||
        (v.boxes ?? []).some(b => b.component.toLowerCase().includes(q)))
    : visits;

  /** Sidebar and dashboard refetch on this event (see pages/Index.tsx). */
  const notify = () => window.dispatchEvent(new CustomEvent("par-score-updated", { detail: { patientId } }));

  async function rerun(v: Visit) {
    setBusy(v.id);
    try {
      await apiClient.analyzeVisit(patientId, v.id);
      await refetch();
      notify();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {showWizard && (
        <FullScreenModal title={`New visit – ${patientName}`} onClose={() => setShowWizard(false)}>
          <AddVisitForm
            patientId={patientId}
            patientName={patientName}
            onSave={async () => { setShowWizard(false); await refetch(); notify(); }}
            onCancel={() => setShowWizard(false)}
          />
        </FullScreenModal>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-on-surface">Visits – {patientName}</h2>
          <p className="text-on-surface-variant">Every visit with its photos, PAR total and AI analysis</p>
        </div>

        <div className="flex items-center gap-4 top-controls">
          <form onSubmit={e => e.preventDefault()} className="relative w-60">
            <input
              id="visit-search"
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Escape" && setQuery("")}
              className="w-full h-12 bg-white border rounded-xl px-4 pr-10 text-base outline-none focus:shadow-md"
              placeholder="Search date, notes, component"
              aria-label="Search visits"
            />
            {query
              ? <X onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 cursor-pointer" />
              : <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4070f4]" />}
          </form>
          <button title="New visit" aria-label="New visit" onClick={() => setShowWizard(true)}
                  className="cursor-pointer outline-none hover:rotate-90 duration-300 ml-2">
            <PlusCircle className="w-10 h-10 text-[#4070f4]" />
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading visits…</p>}
      {error && <p className="text-sm text-red-600">Could not load visits: {String(error)}</p>}

      <div className="space-y-4">
        {filtered.map(visit => (
          <div key={visit.id} className="hover:shadow-md transition-shadow bg-white rounded-lg border border-gray-100 p-4 flex gap-4">
            {visit.mosaicUrl
              ? <img src={visit.mosaicUrl} alt="Visit mosaic" className="w-48 h-[75px] object-cover rounded cursor-pointer"
                     onClick={() => onOpenVisit?.(visit.id)} />
              : <div className="w-48 h-[75px] rounded bg-gray-100 flex items-center justify-center text-xs text-gray-500">No photos</div>}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold">
                  <Calendar className="w-4 h-4" /> {new Date(visit.date).toLocaleDateString()}
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-gray-100">{visit.status}</span>
                </span>
                <span className="font-semibold">PAR {visit.parScore ?? 0}</span>
              </div>
              <AiBadge visit={visit} />
              {visit.notes && <p className="text-sm text-on-surface-variant truncate">{visit.notes}</p>}
              <div className="flex gap-2 pt-1">
                {onOpenVisit && visit.mosaicUrl && (
                  <Button size="sm" variant="outline" onClick={() => onOpenVisit(visit.id)}>Open workspace</Button>
                )}
                {visit.mosaicUrl && (
                  <Button size="sm" variant="ghost" disabled={busy === visit.id} onClick={() => rerun(visit)}>
                    <RefreshCw className={`w-4 h-4 mr-1 ${busy === visit.id ? "animate-spin" : ""}`} /> Re-run AI
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}

        {!loading && !filtered.length && (
          <div className="text-center text-gray-500 py-8">
            {q ? `No visits match “${query}”.` : "No visits yet. Use the + button to add the five photos of a first visit."}
          </div>
        )}
      </div>
    </>
  );
}
