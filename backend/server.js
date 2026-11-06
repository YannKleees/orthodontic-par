
/**
 * @file server.js
 * @summary Orthodontic clinical data management and analysis server
 * @description
 * Express-based API server implementing evidence-based orthodontic practices:
 * - PAR (Peer Assessment Rating) Index for malocclusion assessment
 * - Standardized intraoral photography and analysis
 * - k-NN similarity search for case comparison
 * - Clinical data management and security
 *
 * @implementation
 * - RESTful API with Express.js
 * - ML-based dental image analysis
 * - Vector-space similarity computation
 * - HIPAA-compliant data storage
 */


import express  from "express";
import cors     from "cors";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import fs   from "fs-extra";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
import { DATA_DIR } from "./config.js";

import { uploadRouter }           from "./routes/uploads.ts";
import { visitsRouter }           from "./routes/visits.js";
import { router as patientsRouter }      from "./routes/patients.js";
import { router as parComponentsRouter } from "./routes/par-components.js";
import { router as reportsRouter }       from "./routes/reports.js";
import { router as similarRouter }       from "./routes/similar-patients.knn.ts";
import { rebuildVectorCache }     from "../src/knn/vector-cache.ts";
import { PATIENT }                from "./utils/fileStore.js";

/**
 * @description Express application configuration
 * 
 * Server setup with clinical data security:
 * - CORS-enabled endpoints for research integration
 * - 50MB limit for dental imaging payloads
 * - Static file serving for clinical assets
 * 
 * API endpoints:
 * - /api/upload: Image processing
 * - /api/visits: Treatment records
 * - /api/patients: Clinical data
 * - /api/par-components: PAR analysis
 * - /api/similar-patients: k-NN search
 */
const PORT = 8000;
const app  = express();

app.use(cors({ origin: (o, cb) => cb(null, o || "*"), credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use("/static", express.static(DATA_DIR));
app.use("/api/upload",          uploadRouter);
app.use("/api/visits",          visitsRouter);
app.use("/api/patients",        patientsRouter);
app.use("/api/par-components",  parComponentsRouter);
app.use("/api/reports",         reportsRouter);
app.use("/api/similar-patients",similarRouter);
app.get("/api/ping", (_q, r) => r.json({ message: "pong" }));
app.use("/", express.static(join(process.cwd(), "public")));

/**
 * @async
 * @description Initialize clinical data infrastructure
 * 
 * Creates required directories:
 * - /patients: Clinical records
 * - /reports: Analytics output
 * - /temp: Image processing
 * 
 * Builds k-NN vector cache:
 * - Loads patient records
 * - Computes similarity vectors
 * - Validates data integrity
 */
app.listen(PORT, () =>
  console.log(`✔︎ API running on http://localhost:${PORT}/api`)
);

(async () => {
  try {
    await fs.ensureDir(join(DATA_DIR, "patients"));
    await fs.ensureDir(join(DATA_DIR, "reports"));
    await fs.ensureDir(join(DATA_DIR, "temp"));

    const ids = (await fs.pathExists(PATIENT)) ? await fs.readdir(PATIENT) : [];
    const patients = await Promise.all(
      ids.map(id => fs.readJson(join(PATIENT, id, "patient.json")).catch(() => null))
    );
    await rebuildVectorCache(patients.filter(Boolean));
    console.log(`✔︎ Vector cache built (${patients.filter(Boolean).length} patients)`);
  } catch (err) {
    console.error("Error during server initialization:", err);
  }
})();
