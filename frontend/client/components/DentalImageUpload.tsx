/**
 * @file DentalImageUpload.tsx
 * @role
 *   Minimal-upload workflow for a single visit: collects five canonical
 *   intra-oral views, issues a single multipart POST to the back-end,
 *   and hands back the created visit identifier.
 *
 * @protocol
 *   POST /api/upload/:patientId
 *   - field name: "images" (array, length=5) — expected by server-side multer:
 *     upload.array("images", 5)
 *   - response: Visit { id: string, ... }
 *
 * @scientific-notes
 *   - Enforces completeness (5/5 views) before submission, matching model
 *     assumptions for a fixed-layout mosaic (reduces domain shift).
 *   - No client-side compression applied to preserve pixel fidelity; prefer
 *     server-side preprocessing to align with training pipeline.
 */

import { useState, useRef } from "react";
import { Upload, CheckCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { cn } from "../lib/utils";
import { apiClient } from "@/lib/api";

type Visit = {
  id: string;
};

type ViewId = "up" | "down" | "left" | "right" | "centre";

type View = {
  id: ViewId;
  name: string;
  description: string;
  file?: File;
  progress: number;
};

const VIEW_PRESET: View[] = [
  { id: "up",     name: "Upper Jaw",  description: "Occlusal upper",  progress: 0 },
  { id: "down",   name: "Lower Jaw",  description: "Occlusal lower",  progress: 0 },
  { id: "left",   name: "Left Side",  description: "Left buccal",     progress: 0 },
  { id: "right",  name: "Right Side", description: "Right buccal",    progress: 0 },
  { id: "centre", name: "Front View", description: "Anterior",        progress: 0 },
];

export function DentalImageUpload({
  patientId,
  patientName,
  onAllCompleted,
}: {
  patientId: string;
  patientName: string;
  onAllCompleted: (visitId: string) => void;
}) {
  const [views, setViews] = useState<View[]>(VIEW_PRESET);
  const fileRefs = useRef<Record<ViewId, HTMLInputElement | null>>({} as any);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [visitId] = useState(() => `${patientId}-visit-${Date.now()}`);

  /**
   * sendAll
   * @summary
   *   Aggregates the five selected files into a single FormData payload and
   *   submits to the upload endpoint. On success, propagates the Visit.id to
   *   the parent so it can open the analysis workspace.
   */
  async function sendAll() {
    setUploading(true);

    const fd = new FormData();
    views.forEach(v => fd.append("images", v.file!, v.file!.name));

    const { data: visit } = await apiClient.request<Visit>(
      `/upload/${patientId}`,
      { method: "POST", body: fd }
    );

    setUploading(false);
    setSubmitted(true);
    onAllCompleted(visit.id);
  }

  /**
   * onSelect
   * @description
   *   Registers a single view file and sets its progress to 100% locally.
   *   Progress here reflects selection completeness, not network transfer.
   */
  const onSelect = (vId: ViewId, file: File) => {
    setViews(prev =>
      prev.map(v => (v.id === vId ? { ...v, file, progress: 100 } : v)),
    );
  };

  const allPicked = views.every(v => v.file);

  if (allPicked && !uploading && !submitted) {
    void sendAll().catch(console.error);
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold">PAR Analysis – {patientName}</h2>
        <p>Upload the five intra-oral views. AI will analyse them automatically.</p>
      </div>

      {uploading && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
          <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-green-800 font-medium">Upload finished – processing…</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {views.map(view => (
          <Card key={view.id}>
            <CardHeader className="text-center pb-3">
              <CardTitle className="text-lg">{view.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{view.description}</p>
            </CardHeader>

            <CardContent>
              {!view.file ? (
                <div
                  className={cn(
                    "border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400",
                    uploading && "opacity-50 pointer-events-none",
                  )}
                  onClick={() => fileRefs.current[view.id]?.click()}
                >
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm">Click to choose image</p>
                  <input
                    ref={el => (fileRefs.current[view.id] = el)}
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) onSelect(view.id, f);
                    }}
                    className="hidden"
                  />
                </div>
              ) : (
                <>
                  <div className="aspect-video rounded overflow-hidden mb-3">
                    <img
                      src={URL.createObjectURL(view.file)}
                      alt=""
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <Progress value={view.progress} className="h-2" />
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
