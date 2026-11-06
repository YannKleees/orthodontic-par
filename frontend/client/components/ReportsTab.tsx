/**
 * @file ReportsTab.tsx
 * PDF reports of one patient: list, generate (latest visit or a chosen visit),
 * open, download and delete. Data comes from /api/reports.
 */
import { useState } from "react";
import { FileText, Download, Eye, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { apiClient, type Report, type Visit } from "@/lib/api";
import { useReports, useVisits } from "@/hooks/useApi";

interface ReportsTabProps {
  patientName: string;
  patientId: string;
}

export function ReportsTab({ patientName, patientId }: ReportsTabProps) {
  const { data: reports, loading, error, refetch } = useReports(patientId);
  const { data: visits } = useVisits(patientId);
  const completed = (visits ?? [])
    .filter((v: Visit) => v.status === "completed")
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  const [visitId, setVisitId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      await apiClient.generateReport(patientId, visitId || undefined);
      await refetch();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Report) {
    await apiClient.deleteReport(patientId, r.id);
    await refetch();
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-on-surface">Reports – {patientName}</h2>
          <p className="text-on-surface-variant">
            PDF with the mosaic, PAR breakdown, change since the first visit and the AI findings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border px-2 text-sm bg-white"
            value={visitId}
            onChange={e => setVisitId(e.target.value)}
            aria-label="Visit to report on"
          >
            <option value="">Latest visit</option>
            {completed.map(v => (
              <option key={v.id} value={v.id}>
                {new Date(v.date).toLocaleDateString()} (PAR {v.parScore ?? 0})
              </option>
            ))}
          </select>
          <Button onClick={generate} disabled={busy || completed.length === 0} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Generate report
          </Button>
        </div>
      </div>

      {completed.length === 0 && (
        <p className="text-sm text-gray-500 mb-4">Add a visit with the five photos first; reports need at least one.</p>
      )}
      {message && <p className="text-sm text-red-600 mb-4">{message}</p>}
      {error && <p className="text-sm text-red-600 mb-4">Could not load reports: {String(error)}</p>}
      {loading && <p className="text-sm text-gray-500">Loading reports…</p>}

      <div className="space-y-4">
        {(reports as Report[] | null)?.map(r => (
          <Card key={r.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-4 h-4" /> {r.name}
                </CardTitle>
                <span className="text-sm font-medium">PAR {r.parScore}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-on-surface-variant mb-3">
                {r.description}. Generated {new Date(r.date).toLocaleString()}.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={r.fileUrl} target="_blank" rel="noreferrer"><Eye className="w-4 h-4 mr-1" />Open</a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/reports/${patientId}/${r.id}/download`}><Download className="w-4 h-4 mr-1" />Download</a>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(r)} aria-label={`Delete ${r.name}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && reports && (reports as Report[]).length === 0 && (
          <p className="text-center text-gray-500 py-8">No reports yet.</p>
        )}
      </div>
    </div>
  );
}
