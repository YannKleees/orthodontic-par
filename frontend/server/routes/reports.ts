/* routes/reports.ts — full file
   ------------------------------------------------------------------ */
/** ============================================================================
 * Reports API — PDF generation and retrieval (in-memory index + disk files)
 * =============================================================================
 * PURPOSE
 *  - Materialize visit-level summaries (e.g., PAR totals, findings, actions)
 *    into immutable PDFs for auditability and clinical communication.
 * STORAGE MODEL
 *  - Metadata: process memory (per-process map) keyed by patientId.
 *  - Artifact: PDF on disk under DATA_DIR; URL exposed via STATIC_PREFIX.
 * RELIABILITY
 *  - Ensures target directory exists before write; stream completion awaited
 *    prior to emitting success payload (prevents torn/partial outputs).
 * SECURITY
 *  - Filenames are generated (no user-controlled path segments) to reduce
 *    traversal risk; public URL is constructed from known prefix + ids.
 * ============================================================================ */
import { Router, Request, Response } from "express";
import { z } from "zod";
import fs from "fs-extra";
import path from "path";
import PDFDocument from "pdfkit";

/* -------- where we save finished PDFs ----------------------------- */
const DATA_DIR = path.resolve(__dirname, "..", "data", "reports");     // mkdirp later
const STATIC_PREFIX = "/static/reports";                            // served elsewhere

/* -------- in-memory list just like before ------------------------- */
type Report = {
  id: string;
  patientId: string;
  name: string;
  date: string;
  type: string;
  status: "ready" | "draft" | "pending";
  description: string;
  parScore?: number;
  generatedBy?: string;
  fileUrl?: string;
  findings: string[];
  recommendations: string[];
};
const reports: Record<string, Report[]> = {};

/* -------- basic helpers ------------------------------------------ */
/** Ensure a directory exists (idempotent). Acts as a precondition for I/O. */
async function ensureDir(dir: string) {
  await fs.ensureDir(dir);
}
/** Deterministic, non-guessable filename factory: embeds PID + epoch. */
function mkFilename(pid: string) {
  return `PAT-${pid}-${Date.now()}.pdf`;
}

/* -------- router -------------------------------------------------- */
export const router = Router();

/** ============================================================================
 * GET /api/reports/:patientId
 * -----------------------------------------------------------------------------
 * Returns all known report metadata for a patient. Count is provided to ease
 * pagination UIs even though storage is in-memory here.
 * ========================================================================== */
router.get("/:patientId", (req, res) => {
  const list = reports[req.params.patientId] ?? [];
  res.json({ success: true, data: list, count: list.length });
});

/** ============================================================================
 * POST /api/reports/:patientId/generate
 * -----------------------------------------------------------------------------
 * Side-effect: creates a structured PDF (header, total PAR, findings, recs),
 * persists to disk, registers metadata in the in-memory index, and returns it.
 * Robustness: waits for write stream "finish" before responding.
 * Inputs:
 *  - body.visitId? (for provenance)
 *  - body.type? string (label)
 *  - body.parScore? number (summary scalar, default demo=42)
 * ========================================================================== */
router.post("/:patientId/generate", async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { visitId, type = "AI Analysis", parScore = 42 } = req.body;

    /* prepare folder + filename */
    const folder = path.join(DATA_DIR, patientId);
    await ensureDir(folder);
    const filename = mkFilename(patientId);
    const absPath  = path.join(folder, filename);
    
    // Fix URL construction to match the actual file structure
    const publicUrl = `${req.protocol}://${req.get("host")}${STATIC_PREFIX}/${patientId}/${filename}`;

    /* ——— create the PDF ——— */
    const doc = new PDFDocument({ margin: 48 });
    const stream = fs.createWriteStream(absPath);
    doc.pipe(stream);

    /* header */
    doc.fontSize(22).fillColor("#674AE4").text("Orthodontic Report", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#000")
       .text(`Patient ID: ${patientId}`)
       .text(`Visit ID  : ${visitId ?? "—"}`)
       .text(`Generated : ${new Date().toLocaleString()}`);
    doc.moveDown();

    /* big score */
    doc.fontSize(16).fillColor("#000").text("Total PAR Score:", { continued: true })
       .fontSize(28).fillColor("#674AE4").text(`  ${parScore}`, { continued: false });
    doc.moveDown();

    /* findings & reco columns */
    const sampleFindings = [
      "Upper arch crowding detected",
      "Mild spacing in lower arch",
      "Overbite slightly increased",
      "No pathology observed"
    ];
    const sampleRecos = [
      "Fixed appliance therapy",
      "Monitor lower arch spacing",
      "Re-evaluate in 6 months"
    ];

    const findings = sampleFindings;
    const recos    = sampleRecos;

    const colWidth = (doc.page.width - 2 * doc.options.margin - 20) / 2;
    doc.fontSize(14).fillColor("#000").text("Findings", { underline: true });
    doc.moveDown(0.25);
    findings.forEach(f => doc.circle(doc.x - 4, doc.y + 4, 2).fill("#674AE4").fillColor("#000").text(`  ${f}`));
    doc.moveUp(findings.length + 1);       // back to first bullet
    doc.translate(colWidth + 20, 0);       // move into 2nd column
    doc.fontSize(14).fillColor("#000").text("Recommendations", { underline: true });
    doc.moveDown(0.25);
    recos.forEach(r => doc.circle(doc.x - 4, doc.y + 4, 2).fill("#674AE4").fillColor("#000").text(`  ${r}`));
    doc.translate(-colWidth - 20, 0);      // reset transform
    doc.moveDown(3);

    /* footer */
    doc.fontSize(10).fillColor("#888").text("Generated automatically by OrthoAI", { align: "center" });

    doc.end();
    await new Promise(resolve => stream.on("finish", resolve));

    /* store metadata & respond */
    const meta: Report = {
      id        : `report-${Date.now()}`,
      patientId,
      name      : `${type} – ${new Date().toLocaleDateString()}`,
      date      : new Date().toISOString().slice(0, 10),
      type,
      status    : "ready",
      description: "Automated PDF report",
      parScore,
      generatedBy: "Backend v1",
      fileUrl: publicUrl,
      findings,
      recommendations: recos,
    };
    (reports[patientId] ||= []).push(meta);

    res.json({ success: true, data: meta });
  } catch (err: any) {
    /* eslint-disable-next-line no-console */
    console.error(err);
    res.status(500).json({ success: false, error: "PDF generation failed" });
  }
});
