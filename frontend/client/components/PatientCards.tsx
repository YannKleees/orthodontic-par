/**
 * @file PatientCards.tsx
 * @brief Dashboard card set: mosaic preview, PAR-weighted summary, notes,
 *        PDF export, and longitudinal progress (first vs latest).
 *
 * @data-flow
 * - Fetch visits → pick latest completed (or provided visitId).
 * - Fetch PAR components for current/first/latest → compute weighted totals.
 * - Render: mosaic preview, per-component table (score × weight), totals,
 *   notes drawer (simple visit.notes field), progress drawer (delta table).
 *
 * @scoring
 * - Uses a Richmond-style weight map (subset of 11 PAR components), producing
 *   a single scalar ∑(score_i × weight_i). This is display-only; authoritative
 *   PAR persists elsewhere in the system.
 */

import { useState, useEffect } from "react";
import type { Visit }          from "@/hooks/types";
import { useVisits, usePARComponentList } from "@/hooks/useApi";
import { PatientMosaic }       from "./PatientMosaic";
import { Button }              from "./ui/button";
import { User, Maximize2 }     from "lucide-react";
import { cn }                  from "@/lib/utils";
import { apiClient }           from "@/lib/api";
import "./CommentButton.css";
import "./FancyDownloadButton.css";

/** Richmond-style weights and maxima for the displayed subset. */
const META: Record<string,{label:string;weight:number;max:number}> = {
  uppercrowding:{label:"Upper Crowding",weight:1,max:5},
  lowercrowding:{label:"Lower Crowding",weight:1,max:5},
  upperspacing :{label:"Upper Spacing", weight:1,max:5},
  lowerspacing :{label:"Lower Spacing", weight:1,max:5},
  overjet      :{label:"Overjet",       weight:6,max:4},
  overbite     :{label:"Overbite",      weight:2,max:4},
  crossbite    :{label:"Crossbite",     weight:1,max:4},
  centerline   :{label:"Centerline",    weight:4,max:4},
};

/** Canonicalizes a component label to a stable key into META. */
const canon = (s="")=>s.replace(/[^a-z]/gi,"").toLowerCase();

interface WrapperProps{
  patientId:string; patientName:string; visitId?:string;
  onOpenFull:(pid:string,pname:string,vid:string)=>void;
}

/**
 * PatientCardsWrapper
 * Selects a visit (explicit or latest completed) and defers to Inner.
 * Provides skeletons for loading/empty states.
 */
export default function PatientCardsWrapper(props:WrapperProps){
  const { patientId, visitId } = props;
  const { data:visitsData, loading } = useVisits(patientId);
  const visits:Visit[] = Array.isArray(visitsData)?visitsData:[];
  const picked =
    visits.find(v=>v.id===visitId) ||
    visits.filter(v=>v.status==="completed")
          .sort((a,b)=>Date.parse(b.date)-Date.parse(a.date))[0];

  if (loading) return <Stub text="Loading…"/>;
  if (!picked) return <Stub text="Upload a visit to see analysis"/>;
  return <Inner {...props} visit={picked}/>;
}

const Stub = ({text}:{text:string}) =>
  <div className="h-40 flex items-center justify-center text-gray-500">{text}</div>;

interface InnerProps extends WrapperProps{ visit:Visit }

/**
 * Inner
 * Fetches component sets needed for: current snapshot, first vs latest delta,
 * and renders the full card layout.
 */
function Inner({patientId,patientName,visit,onOpenFull}:InnerProps){
  const { data:currentBoxesRaw, loading:boxesLoading } =
    usePARComponentList(patientId, visit.id);
  const currentBoxes = Array.isArray(currentBoxesRaw)?currentBoxesRaw:[];

  const { data:visitsData } = useVisits(patientId);
  const visits:Visit[] = Array.isArray(visitsData)?visitsData:[];
  const sorted = [...visits].filter(v=>v.status==="completed")
                            .sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  const firstVisit  = sorted[0];
  const latestVisit = sorted[sorted.length-1];

  /** Safe calls when IDs may be absent; hooks run every render. */
  const { data:firstBoxesRaw  } = usePARComponentList(patientId, firstVisit?.id  || "");
  const { data:latestBoxesRaw } = usePARComponentList(patientId, latestVisit?.id || "");
  const firstBoxes  = Array.isArray(firstBoxesRaw)?firstBoxesRaw:[];
  const latestBoxes = Array.isArray(latestBoxesRaw)?latestBoxesRaw:[];

  const [noteOpen,     setNoteOpen]     = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [notes,        setNotes]        = useState(visit.notes??"");
  useEffect(()=>setNotes(visit.notes??""),[visit.id]);

  /**
   * Aggregates a component set into table rows and a weighted total:
   * score_total = ∑(score_i × weight_i). Components missing from META are ignored.
   */
  function buildRows(boxes:any[]){
    const dict:Record<string,{label:string;score:number;weight:number;total:number}> =
      Object.entries(META).reduce((a,[k,m])=>{
        a[k]={label:m.label,score:0,weight:m.weight,total:0}; return a;},{} as any);
    boxes.forEach(b=>{
      const k=canon(b.component); if(!META[k]) return;
      dict[k].score=b.score??0; dict[k].total=dict[k].score*dict[k].weight;
    });
    return { rows:Object.keys(META).map(k=>dict[k]),
             par:Object.values(dict).reduce((s,r)=>s+r.total,0) };
  }
  const cur   = buildRows(currentBoxes);
  const first = buildRows(firstBoxes);
  const last  = buildRows(latestBoxes);
  const deltas = cur.rows.map((r,i)=>({
      component:r.label,
      before:first.rows[i].score,
      after :last.rows[i].score,
      diff  :last.rows[i].score-first.rows[i].score,
  }));

  /** Persists visit.notes for the selected visit. */
  async function saveNotes(){
    await apiClient.updateVisit(patientId, visit.id, { notes });
    setNoteOpen(false);
  }

  /**
   * Requests a server-side PDF generation for the current visit and opens it
   * when available. HEAD check verifies the returned URL before opening.
   */
  async function downloadPdf(){
    const res = await fetch(`/api/reports/${patientId}/generate`,{
      method:"POST", headers:{ "Content-Type":"application/json"},
      body:JSON.stringify({visitId:visit.id,parScore:cur.par}),
    });
    const j=await res.json();
    if(j.success && j.data?.fileUrl &&
       (await fetch(j.data.fileUrl,{method:"HEAD"})).ok){
      window.open(j.data.fileUrl,"_blank");
    }else alert("PDF not ready, try again.");
  }

  if (boxesLoading) return <Stub text="Loading…"/>;

  return (
    <div className="w-full max-w-[1060px] mx-auto p-3">
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-[32px] p-4 shadow-xl border-2 border-white">

        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative bg-white rounded-[24px] shadow-lg border-2 border-gray-200 p-4 aspect-[3/2]">
              <PatientMosaic visitId={visit.id} className="h-full"/>
              <Button size="sm" variant="outline"
                className="absolute top-4 right-4 bg-white/90 shadow-sm"
                onClick={()=>onOpenFull(patientId,patientName,visit.id)}>
                <Maximize2 className="w-4 h-4"/>
              </Button>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-[24px] shadow-lg border-2 border-gray-200 p-4 h-[320px] overflow-y-auto">
            <header className="text-center pb-2 border-b border-gray-100">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <User className="w-6 h-6 text-blue-600"/>
              </div>
              <h3 className="text-lg font-semibold">{patientName}</h3>
              <p className="text-xs text-gray-500">
                {new Date(visit.date).toLocaleDateString()}
              </p>
            </header>

            <div className="mt-4 bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-blue-800">Total PAR Score</span>
                <span className="text-lg font-bold text-blue-600">{cur.par}</span>
              </div>
              <div className="h-1.5 w-full bg-blue-200 rounded-full mt-1">
                <div className="bg-blue-600 h-1.5 rounded-full"
                     style={{width:`${Math.min(100,(cur.par/50)*100)}%`}}/>
              </div>
            </div>

            <div className="mt-3 text-xs border border-blue-100 rounded-lg overflow-hidden">
              <div className="bg-blue-50 px-2 py-1 text-blue-800 font-medium border-b border-blue-100">
                PAR Components
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 text-xs">
                  <tr><th className="px-2 py-1 text-left">Component</th>
                      <th className="px-2 py-1 text-right">Score</th>
                      <th className="px-2 py-1 text-right">W</th>
                      <th className="px-2 py-1 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cur.rows.map((r,i)=>(
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5">{r.label}</td>
                      <td className="px-2 py-1.5 text-right">{r.score}</td>
                      <td className="px-2 py-1.5 text-right">{META[canon(r.label)].weight}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{r.total}</td>
                    </tr>
                  ))}
                  <tr className="bg-blue-50 font-medium">
                    <td colSpan={3} className="px-2 py-1.5">Total</td>
                    <td className="px-2 py-1.5 text-right">{cur.par}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button className="bookmarkBtn" onClick={()=>setNoteOpen(o=>!o)} type="button">
            <span className="IconContainer">{<svg fill="white" viewBox="0 0 512 512" height="1em">
                <path d="M123.6 391.3c12.9-9.4 29.6-11.8 44.6-6.4c26.5 9.6 56.2 15.1
                  87.8 15.1c124.7 0 208-80.5 208-160s-83.3-160-208-160S48
                  160.5 48 240c0 32 12.4 62.8 35.7 89.2c8.6 9.7 12.8 22.5
                  11.8 35.5c-1.4 18.1-5.7 34.7-11.3 49.4c17-7.9 31.1-16.7
                  39.4-22.7zM21.2 431.9c1.8-2.7 3.5-5.4 5.1-8.1c10-16.6
                  19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1
                  114.6 32 256 32s256 93.1 256 208s-114.6 208-256 208
                  c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3
                  30.6c-15.1 6.6-32.3 12.6-50.1 16.1c-.8 .2-1.6 .3-2.4 .5
                  c-4.4 .8-8.7 1.5-13.2 1.9c-.2 0-.5 .1-.7 .1c-5.1 .5-10.2
                  .8-15.3 .8c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8
                  3.4-17.4c4.1-4.2 7.8-8.7 11.3-13.5c1.7-2.3
                  3.3-4.6 4.8-6.9c.1-.2 .2-.3 .3-.5z" />
              </svg>}</span>
            <p className="text">Comment</p>
          </button>

          <button className="downloadBtn" data-tooltip="Treatment progress"
                  onClick={()=>setProgressOpen(o=>!o)} type="button">
            <div className="downloadWrapper">
              <div className="downloadText">Progress</div>
              <span className="downloadIcon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="13 2 13 9 20 9"/><path d="M13 2H6a2 2 0 0 0-2 2v7"/>
                  <polyline points="11 22 11 15 4 15"/><path d="M11 22h7a2 2 0 0 0 2-2v-7"/>
                </svg>
              </span>
            </div>
          </button>

          <button className="downloadBtn" data-tooltip="Download PDF"
                  onClick={downloadPdf} type="button">
            <div className="downloadWrapper">
              <div className="downloadText">Download</div>
              <span className="downloadIcon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2"><path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 0 0
                     4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg>
              </span>
            </div>
          </button>
        </div>

        {noteOpen && (
          <div className="mt-4 space-y-2 animate-slide-down">
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4}
              placeholder="Write visit notes here…"
              className={cn("w-full rounded-md border px-3 py-2 text-sm",
                            "bg-background focus:ring-2 focus:ring-primary")}/>
            <div className="flex gap-2">
              <button className="px-4 py-1 rounded bg-primary text-primary-foreground text-sm"
                      onClick={saveNotes}>Save</button>
              <button className="px-4 py-1 rounded bg-muted text-sm"
                      onClick={()=>setNoteOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        {progressOpen && firstVisit && latestVisit && (
          <div className="mt-4 animate-slide-down">
            <div className="grid grid-cols-2 gap-4">
              {[
                {v:firstVisit,  label:"BEFORE",  color:"bg-red-600"},
                {v:latestVisit, label:"CURRENT", color:"bg-green-600"},
              ].map(({v,label,color})=>(
                <figure key={v.id} className="border rounded relative overflow-hidden aspect-[3/2]">
                  <PatientMosaic visitId={v.id} className="h-full"/>
                  <span className={`absolute top-0 left-0 ${color} text-white text-[10px] px-2 py-0.5`}>
                    {label}
                  </span>
                  <figcaption className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] py-0.5 text-center">
                    {new Date(v.date).toLocaleDateString()}
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="mt-4">
              <h4 className="font-medium mb-2">PAR evolution</h4>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm">Total:</span>
                <span className="text-lg font-semibold">{first.par}</span>
                <span className="text-2xl">→</span>
                <span className="text-lg font-semibold">{last.par}</span>
                <span className={cn(
                        "ml-1 px-2 py-0.5 rounded text-xs font-medium",
                        last.par-first.par<0?"bg-green-100 text-green-700":"bg-red-100 text-red-700")}>
                  {(last.par-first.par>0?"+":"")+(last.par-first.par).toFixed(1)}
                </span>
              </div>

              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr><th className="text-left py-1 px-1">Component</th>
                      <th className="text-center py-1 px-1">Before</th>
                      <th className="text-center py-1 px-1">After</th>
                      <th className="text-center py-1 px-1">Δ</th></tr>
                </thead>
                <tbody>
                  {deltas.map(d=>(
                    <tr key={d.component} className="border-b last:border-0">
                      <td className="py-1 pr-1">{d.component}</td>
                      <td className="text-center">{d.before}</td>
                      <td className="text-center">{d.after}</td>
                      <td className={cn("text-center font-medium",
                           d.diff<0?"text-green-600":d.diff>0?"text-red-600":"")}>
                        {(d.diff>0?"+":"")+d.diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { PatientCardsWrapper as PatientCards };
