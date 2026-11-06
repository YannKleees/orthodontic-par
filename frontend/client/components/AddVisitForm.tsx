import { useState, useRef } from "react";
import {
  Upload, Camera, Calendar, CheckCircle
} from "lucide-react";
import { Button }        from "./ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { cn }            from "@/lib/utils";
import { apiClient }     from "@/lib/api";

/**
 * @file AddVisitForm.tsx
 * @description
 * Visit-creation and upload wizard for the five standard intra-oral photographs:
 * Upper occlusal, Lower occlusal, Left buccal, Frontal (centre), Right buccal.
 *
 * Clinical context:
 * - These five views are a conventional minimum set for capturing malocclusion
 *   features relevant to PAR components. They enable a deterministic mosaic
 *   layout, consistent coordinate frame, and single-pass detection on the mosaic.
 *
 * Flow:
 * 1) User selects exactly five images, one per canonical view.
 * 2) A new visit is created server-side and images are uploaded (sequentially).
 * 3) Backend composes the mosaic and triggers AI analysis (detection + PAR).
 * 4) Parent is notified via onSave(visitId) to transition into the workspace.
 *
 * Performance:
 * - Sequential upload keeps control flow simple for demos; this can be switched
 *   to concurrent uploads without altering external behavior.
 */

type ViewId = "up" | "down" | "left" | "right" | "centre";

/**
 * VIEW_PRESET
 * @description
 * Ordered, canonical mapping between UI tiles and clinical views used by
 * the mosaic builder on the backend. Preserving order reduces the chance
 * of view-mixing, which can degrade detector performance.
 */
const VIEW_PRESET: { id:ViewId; label:string }[] = [
  { id:"up",     label:"Upper (occlusal)"  },
  { id:"down",   label:"Lower (occlusal)"  },
  { id:"left",   label:"Left buccal"       },
  { id:"centre", label:"Frontal / centre"  },
  { id:"right",  label:"Right buccal"      },
];

interface Props {
  patientId  : string;
  patientName: string;
  onSave     : (visitId:string)=>void;
  onCancel   : ()=>void;
}

/**
 * AddVisitForm
 * @description
 * Upload wizard that enforces the five-view set and coordinates creation of a
 * server-side visit, image uploads, and analysis kick-off. The component is
 * intentionally stateful to provide immediate visual feedback (thumbnail per
 * tile, per-tile upload completion, step transitions).
 *
 * States:
 * - "select": user selects files (one per view).
 * - "uploading": files are being sent to the server.
 * - "analysing": backend is composing mosaic and running AI.
 */
export default function AddVisitForm(props:Props) {
  const { patientId, patientName, onSave, onCancel } = props;

  const [tiles, setTiles] = useState(
    VIEW_PRESET.map(v=>({ ...v, file:null as File|null, uploaded:false }))
  );
  const [step , setStep ] = useState<"select"|"uploading"|"analysing">("select");
  const [visitId, setVisitId] = useState<string|null>(null);
  const inputs = useRef<Record<ViewId,HTMLInputElement|null>>({} as any);

  const [error, setError] = useState<string | null>(null);
  const [date, setDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  /**
   * handleFilePick
   * @description
   * Registers the selected file for a single canonical view. The UI shows a
   * preview thumbnail for rapid verification (helps avoid view mix-ups).
   */
  const handleFilePick = (view:ViewId, file:File) =>
    setTiles(t =>
      t.map(v=> v.id===view ? {...v, file} : v)
    );

  /**
   * startUpload
   * Sends the five photos in one request. Each file is renamed after its view
   * (up.jpg, centre.png, ...) so the backend cannot mix the views up. The backend
   * builds the mosaic and runs the detector before it answers.
   */
  const startUpload = async () => {
    setError(null);
    setStep("uploading");
    const fd = new FormData();
    for (const t of tiles) {
      const ext = t.file!.name.split(".").pop() || "jpg";
      fd.append("images", t.file!, `${t.id}.${ext}`);
    }
    fd.append("date", new Date(`${date}T12:00:00`).toISOString());
    fd.append("notes", notes);
    try {
      setStep("analysing");
      const { data } = await apiClient.request<{ id: string }>(`/upload/${patientId}`, { method: "POST", body: fd });
      setVisitId(data.id);
      onSave(data.id);
    } catch (e: any) {
      setError(e.message);
      setStep("select");
    }
  };

  if (step==="analysing")
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 border-4 border-blue-200
                            border-t-navyblue-600 rounded-full animate-spin
                            mx-auto mb-4"/>
            <CardTitle>AI analysis in progress …</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-1 text-gray-600">
            <p>Building the mosaic</p>
            <p>Running the detector on the five views</p>
            <p>Creating PAR suggestions</p>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5"/>
                New Visit – {patientName}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Upload the five standard intra-oral views
              </p>
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Calendar className="w-4 h-4"/>
              {new Date().toLocaleDateString()}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid sm:grid-cols-3 gap-6">
            {tiles.map(v=>(
              <div key={v.id} className="flex flex-col items-center space-y-2">
                <div
                  className={cn(
                    "w-full aspect-square border-2 border-dashed rounded-lg",
                    v.file ? "border-green-300" : "border-gray-300",
                    "flex items-center justify-center relative cursor-pointer"
                  )}
                  onClick={()=>inputs.current[v.id]?.click()}
                >
                  {v.file
                    ? <img src={URL.createObjectURL(v.file)}
                           className="object-cover w-full h-full rounded-lg"/>
                    : <Upload className="w-10 h-10 text-gray-400"/>}
                  {v.uploaded &&
                    <CheckCircle className="absolute top-1 right-1
                                            text-green-600 w-5 h-5"/>}
                  <input
                    ref={el=>inputs.current[v.id]=el}
                    type="file" accept="image/*" hidden
                    onChange={e=>{
                      const f=e.target.files?.[0];
                      if (f) handleFilePick(v.id,f);
                    }}/>
                </div>
                <span className="text-sm text-gray-700">{v.label}</span>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-[180px_1fr] gap-4 items-start">
            <label className="text-sm text-gray-700 space-y-1">
              <span>Visit date</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                     className="w-full h-9 rounded-md border px-2 text-sm" />
            </label>
            <label className="text-sm text-gray-700 space-y-1">
              <span>Notes (optional)</span>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                        className="w-full rounded-md border px-2 py-1 text-sm" />
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-4">
            <Button
              className="flex-1"
              disabled={!tiles.every(t=>t.file)}
              onClick={startUpload}
            >
              <Camera className="w-4 h-4 mr-2"/>
              {step==="uploading" ? "Uploading…" : "Create Visit"}
            </Button>
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
