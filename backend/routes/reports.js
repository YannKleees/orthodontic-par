/**
 * @file reports.js
 * PDF reports per visit.
 *
 *   GET    /api/reports/:pid                         list
 *   POST   /api/reports/:pid/generate   { visitId? } create (default: latest completed visit)
 *   GET    /api/reports/:pid/:reportId               metadata
 *   GET    /api/reports/:pid/:reportId/download      the PDF
 *   DELETE /api/reports/:pid/:reportId
 *
 * A report contains the patient and visit details, the mosaic with every PAR box, the
 * PAR breakdown, the change since the first visit (with the Richmond et al. 1992
 * improvement categories) and the detector's findings. Metadata is stored next to
 * the PDFs in data/reports/<pid>/reports.json.
 */
import { Router }  from "express";
import PDFDocument from "pdfkit";
import fs          from "fs-extra";
import sharp       from "sharp";
import path        from "path";
import { differenceInYears, parseISO, isValid, format } from "date-fns";

import { DATA, pJson, vDir, load, save } from "../utils/fileStore.js";
import { getVisit, firstAndLatest, listVisits } from "../utils/visitStore.js";
import { WEIGHTS, calcPAR, urgencyFromPAR } from "../utils/par.js";

export const router = Router();

const REPORTS = path.join(DATA, "reports");
const indexFile = pid => path.join(REPORTS, pid, "reports.json");
const pdfFile   = (pid, rid) => path.join(REPORTS, pid, `${rid}.pdf`);

const COMPONENTS = Object.keys(WEIGHTS);
const COLORS = {
  "Upper Crowding": "#2563eb", "Lower Crowding": "#0891b2",
  "Upper Spacing" : "#7c3aed", "Lower Spacing" : "#9333ea",
  "Overjet"       : "#dc2626", "Overbite"      : "#ea580c",
  "Crossbite"     : "#ca8a04", "Centerline"    : "#16a34a",
};
const LABELS = {
  healthy_tooth: "Healthy tooth", tooth_torsion: "Tooth torsion (rotation)",
  deep_overjet: "Deep overjet", invisible_attachment: "Clear-aligner attachment",
  tooth_emergence: "Erupting tooth", cast_fixed_appliance: "Cast fixed appliance",
  tooth_misalignment: "Tooth misalignment", mandibular_retrusion: "Mandibular retrusion",
  orthodontic_brace: "Orthodontic brace", fixed_device: "Fixed orthodontic device",
};

const fmtDate = iso => { const d = parseISO(iso || ""); return isValid(d) ? format(d, "d MMM yyyy") : "-"; };

/** Weighted score per component for a visit. */
function breakdown(visit) {
  const rows = Object.fromEntries(COMPONENTS.map(c => [c, { raw: 0, weighted: 0, boxes: 0, ai: 0 }]));
  for (const b of visit?.boxes || []) {
    const r = rows[b.component];
    if (!r) continue;
    r.raw += Number(b.score) || 0;
    r.boxes += 1;
    if (b.source === "ai" && !b.reviewed) r.ai += 1;
  }
  for (const c of COMPONENTS) rows[c].weighted = rows[c].raw * WEIGHTS[c];
  return rows;
}

/** Richmond et al. (1992): improvement categories from pre- and post-treatment PAR. */
export function improvement(before, after) {
  if (!before) return { pct: null, category: "No baseline score" };
  const reduction = before - after;
  const pct = (reduction / before) * 100;
  let category = "Worse / no different";
  if (reduction >= 22 && pct >= 30) category = "Greatly improved";
  else if (pct >= 30) category = "Improved";
  return { pct, category };
}

/* ---------------------------------------------------------------- PDF */
async function writePdf(file, { patient, visit, first }) {
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `PAR report ${patient.name}` } });
  const stream = fs.createWriteStream(file);
  doc.pipe(stream);
  const W = doc.page.width - 96;
  const left = 48;
  const muted = "#6b7280";

  // Header
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(20).text("Orthodontic PAR report", left, 48);
  doc.font("Helvetica").fontSize(9).fillColor(muted)
     .text(`Generated ${format(new Date(), "d MMM yyyy, HH:mm")}  |  Research prototype, not for clinical use`);
  doc.moveDown(0.8);

  // Patient and visit
  const dob = parseISO(patient.dateOfBirth || "");
  const age = isValid(dob) ? differenceInYears(new Date(visit.date), dob) : "-";
  const info = [
    ["Patient", patient.name], ["Patient ID", patient.id],
    ["Date of birth", fmtDate(patient.dateOfBirth)], ["Age at visit", String(age)],
    ["Visit date", fmtDate(visit.date)], ["Visit ID", visit.id],
  ];
  const y0 = doc.y;
  info.forEach(([k, v], i) => {
    const x = left + (i % 2) * (W / 2), y = y0 + Math.floor(i / 2) * 15;
    doc.fontSize(9).fillColor(muted).text(k, x, y, { width: 80 });
    doc.fillColor("#111827").text(v, x + 82, y, { width: W / 2 - 90 });
  });
  doc.y = y0 + 3 * 15 + 8;

  // Mosaic with boxes
  const mosaic = path.join(vDir(patient.id, visit.id), "mosaic_full.png");
  if (await fs.pathExists(mosaic)) {
    const imgW = W, imgH = W * (2400 / 6144);           // mosaic is 6144 x 2400
    const top = doc.y;
    // 2000 px wide JPEG keeps the PDF small (the full PNG mosaic is ~15 MB)
    const jpeg = await sharp(mosaic).resize(2000).jpeg({ quality: 82 }).toBuffer();
    doc.image(jpeg, left, top, { width: imgW, height: imgH });
    const s = imgW / 6144;
    for (const b of visit.boxes || []) {
      const c = b.coordinates; if (!c) continue;
      const color = COLORS[b.component] || "#111827";
      doc.save().lineWidth(1).strokeColor(color);
      if (b.source === "ai" && !b.reviewed) doc.dash(3, { space: 2 });
      doc.rect(left + c.x * s, top + c.y * s, c.width * s, c.height * s).stroke().undash().restore();
    }
    doc.y = top + imgH + 4;
    doc.fontSize(7.5).fillColor(muted).text(
      "Views: right, frontal, left (top row); upper occlusal, lower occlusal (bottom row). Dashed boxes are AI suggestions not yet reviewed.",
      left, doc.y, { width: W });
    doc.moveDown(0.8);
  }

  // PAR breakdown
  const rows = breakdown(visit);
  const total = calcPAR(visit.boxes || []);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("PAR breakdown", left);
  doc.moveDown(0.3);
  const cols = [left, left + 170, left + 230, left + 290, left + 360];
  const head = ["Component", "Weight", "Score", "Weighted", "Boxes (unreviewed AI)"];
  doc.font("Helvetica-Bold").fontSize(9);
  let y = doc.y;
  head.forEach((h, i) => doc.text(h, cols[i], y));
  doc.font("Helvetica");
  y += 14;
  for (const c of COMPONENTS) {
    const r = rows[c];
    if (!r.boxes) continue;
    doc.fillColor(COLORS[c]).rect(cols[0], y + 2, 6, 6).fill();
    doc.fillColor("#111827");
    [c, `x${WEIGHTS[c]}`, String(r.raw), String(r.weighted), `${r.boxes} (${r.ai})`]
      .forEach((t, i) => doc.text(t, cols[i] + (i === 0 ? 10 : 0), y));
    y += 13;
  }
  if (!Object.values(rows).some(r => r.boxes)) { doc.fillColor(muted).text("No PAR components recorded for this visit.", left, y); y += 13; }
  doc.moveTo(left, y + 2).lineTo(left + W, y + 2).strokeColor("#d1d5db").stroke();
  doc.font("Helvetica-Bold").fillColor("#111827").text("Total weighted PAR", cols[0], y + 6).text(String(total), cols[3], y + 6);
  doc.font("Helvetica").fillColor(muted).text(`Urgency band: ${urgencyFromPAR(total)}`, cols[4], y + 6);
  doc.y = y + 26;

  // Change since the first visit
  if (first && first.id !== visit.id) {
    const before = calcPAR(first.boxes || []);
    const { pct, category } = improvement(before, total);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Change since first visit", left);
    doc.font("Helvetica").fontSize(9).moveDown(0.3)
       .text(`First visit ${fmtDate(first.date)}: PAR ${before}.  This visit: PAR ${total}.  ` +
             (pct === null ? "" : `Reduction ${Math.round(pct)}%. `) + `Category: ${category}.`, { width: W });
    doc.fontSize(7.5).fillColor(muted)
       .text("Categories after Richmond et al. (1992): improved = at least 30% reduction; greatly improved = also at least 22 points.", { width: W });
    doc.moveDown(0.8);
  }

  // AI findings
  const ai = visit.ai || {};
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Automatic analysis", left);
  doc.font("Helvetica").fontSize(9).moveDown(0.3);
  if (ai.status === "done") {
    doc.text(`Detector ${ai.model}, confidence threshold ${ai.confidenceThreshold}. ` +
             `${ai.suggestions} PAR suggestion(s) created.` +
             (ai.applianceDetected ? " An orthodontic appliance is visible." : ""), { width: W });
    for (const f of ai.findings || [])
      doc.text(`-  ${LABELS[f.label] || f.label}: ${f.count} (max confidence ${f.maxConfidence}%, views: ${f.views.join(", ")})`, { width: W });
    doc.fontSize(7.5).fillColor(muted).moveDown(0.2).text(
      "The detector was trained on the public OMNI dataset (Xue et al., 2025). It marks where a finding is; " +
      "AI suggestions start at the lowest PAR grade and must be graded by a clinician.", { width: W });
  } else {
    doc.fillColor(muted).text(ai.message || "No automatic analysis was run for this visit.", { width: W });
  }

  if (visit.notes) {
    doc.moveDown(0.8).font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Notes", left);
    doc.font("Helvetica").fontSize(9).text(visit.notes, { width: W });
  }

  doc.end();
  await new Promise((ok, err) => { stream.on("finish", ok); stream.on("error", err); });
}

/* ------------------------------------------------------------- routes */
router.get("/:pid", async (req, res) => {
  const list = await load(indexFile(req.params.pid), []);
  res.json({ success: true, data: list.slice().reverse(), count: list.length });
});

router.post("/:pid/generate", async (req, res) => {
  try {
    const { pid } = req.params;
    const patient = await load(pJson(pid));
    if (!patient) return res.status(404).json({ success: false, error: "Patient not found" });

    const { first, latest } = firstAndLatest(pid);
    const visitId = req.body?.visitId;
    const visit = visitId ? getVisit(pid, visitId) : latest;
    if (!visit) return res.status(400).json({ success: false, error: "This patient has no completed visit with photos yet" });

    const id = `report-${Date.now()}`;
    await fs.ensureDir(path.join(REPORTS, pid));
    await writePdf(pdfFile(pid, id), { patient, visit, first });

    const total = calcPAR(visit.boxes || []);
    const meta = {
      id, patientId: pid, visitId: visit.id,
      name: `PAR report ${fmtDate(visit.date)}`,
      date: new Date().toISOString(),
      type: "PAR analysis",
      status: "ready",
      parScore: total,
      description: `Visit ${fmtDate(visit.date)}, PAR ${total}, ${listVisits(pid).length} visit(s) on record`,
      fileUrl: `/static/reports/${pid}/${id}.pdf`,
    };
    const list = await load(indexFile(pid), []);
    list.push(meta);
    await save(indexFile(pid), list);
    res.status(201).json({ success: true, data: meta });
  } catch (err) {
    console.error("[reports] generate failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:pid/:rid", async (req, res) => {
  const meta = (await load(indexFile(req.params.pid), [])).find(r => r.id === req.params.rid);
  meta ? res.json({ success: true, data: meta }) : res.status(404).json({ success: false, error: "Report not found" });
});

router.get("/:pid/:rid/download", async (req, res) => {
  const file = pdfFile(req.params.pid, path.basename(req.params.rid));
  if (!(await fs.pathExists(file))) return res.status(404).json({ success: false, error: "Report not found" });
  res.download(file, `${req.params.rid}.pdf`);
});

router.delete("/:pid/:rid", async (req, res) => {
  const list = await load(indexFile(req.params.pid), []);
  const idx = list.findIndex(r => r.id === req.params.rid);
  if (idx === -1) return res.status(404).json({ success: false, error: "Report not found" });
  const [removed] = list.splice(idx, 1);
  await save(indexFile(req.params.pid), list);
  await fs.remove(pdfFile(req.params.pid, removed.id));
  res.json({ success: true, data: removed });
});
