# Orthodontic PAR‑AI – End‑to‑End Prototype

**Automatic PAR‑index calculation & clinical decision‑support UI**

**Candidate:** Yann Klees
**Supervisor:** Dr Shekoufeh Gorgi Zadeh
**Internship:** 24 Jun 2025 – 24 Jul 2025 (4 weeks) — LIST (Bioinformatics)

---

## Table of Contents

1. Project Objectives & Learning Outcomes
2. Repository Layout
3. Quick‑Start (Development)
4. Data & Model Placement
5. Feature Overview (Current Prototype)

   * Clinical Background & Weights
   * Mosaic Creation
   * Boxes & Coordinate Scaling
   * PAR Total Calculation
   * Similarity (k‑NN) and Feature Vector
6. Architecture & Code Tour

   * Client (React/Vite)
   * Server (Express)
   * Contracts & Types
   * Query Keys & Cache Strategy
7. Back‑end API Snapshot
8. Python Requirements
9. NPM Scripts (root)
10. Integrating Your Own Detection Model
11. Running the Similarity Demo
12. Security, Privacy & Clinical Use
13. Deployment
14. Troubleshooting
15. Limitations & Future Work
16. How to Cite
17. Licence & Acknowledgements
18. References
19. Appendix — Model Notes & Early Results

---

## 1) Project Objectives & Learning Outcomes

| Week | Goal                                                                                                                                                                          | Key Deliverables                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1    | Understand the Peer Assessment Rating (PAR) index; survey SOTA detection models and prior PAR‑automation papers                                                               | Annotated bibliography               |
| 2    | Train YOLO and Faster R‑CNN on a public dataset; implement data loader for orthodontic photo archive                                                                          | Baseline notebooks, loss curves      |
| 3    | Add auxiliary PAR‑regression loss (MSE); build interactive web UI: (1) upload 5 images → mosaic → AI analysis, (2) browse patients & PAR severity, (3) retrieve similar cases | Running full‑stack prototype         |
| 4    | Code clean‑up, documentation, delivery                                                                                                                                        | This README, user manual, slide deck |

**Why automate PAR scoring?** The clinical PAR scale comprises 11 components (Upper right segment, Upper anterior segment, Upper left segment, Lower right segment, Lower anterior segment, Lower left segment, Right buccal occlusion, Left buccal occlusion, Overjet, Overbite/Open bite, Centre‑line deviation). Manual PAR scoring takes \~6 minutes per case, and even trained raters can differ by up to \~6 points on the same patient. These delays and inconsistencies can slow down treatment plans. The PAR Index yields a single 0–50 overall score (higher is worse malocclusion) that is used for quality audits and outcome assessments. An automated, photo‑based PAR scoring assistant provides fast, low‑cost quality checks and consistent case comparisons across clinics.

**Impact:** One click turns five intra‑oral photos into a mosaic, draws suggested PAR boxes, and computes a total score; the UI lets clinicians tweak boxes and sub-scores and see the total update live. Photo-based PAR scoring would enable on-demand objective assessments for every case, improving workflow efficiency and standardizing evaluations across practitioners.

---

## 2) Repository Layout

High‑level structure (folders and purpose):

* **client/** – React + TypeScript + Vite single‑page app

  * **client/components/** – UI building blocks (sidebar, tabs, mosaic viewer, upload wizard, reports)
  * **client/hooks/** – data hooks: React-Query wrappers; generic useApi; live PAR components context with debounced persistence; visit comparison; mobile breakpoint helper
  * **client/lib/** – API client and utilities: REST calls and helpers; mosaic path builder; coordinate scaling and unscaling; Tailwind class merge
  * **client/pages/** – application shell (Index) and NotFound page
  * **client/tests/** – example Vitest test

* **server/** – Express app (mounted into Vite dev server for dev, or standalone in production build)

  * **server/routes/** – API endpoints (patients, visits, PAR components, reports, similarity, uploads)
  * **server/static/** – static file serving (or `/static` proxy in dev)
  * **server/ml/** – (optional) Python inference scripts, e.g., `infer.py` for running the model
  * **server/index.ts** – entry point to start Express (in dev via Vite, or built bundle in prod)

* **shared/** – optional shared types between client and server

* **dist/spa/** – built SPA (Vite build output for client)

* **dist/server/** – built server bundle (ESM)

* **vite.config.ts** – Vite dev config (dev server + proxy)

* **vite.config.server.ts** – Vite build config for server (Node target)

* **.env** – environment variables (e.g., `VITE_API_URL`, which defaults to `/api` for same-origin)

* **requirements.txt** – Python dependencies for model inference (if running local PyTorch)

At runtime, static assets are served as follows:

* Patient images: `/static/patients/{patientId}/visits/{visitId}/original_1.jpg` … through `original_5.jpg` (the five standard intraoral views)
* Mosaic images: `/static/patients/{patientId}/visits/{visitId}/mosaic.png` (thumbnail) and `/mosaic_full.png` (full-res for editing)
* Detection results: `/static/patients/{patientId}/visits/{visitId}/meta.json` (optional image metadata or backup of analysis results)
* Reports: `/static/reports/{patientId}/{reportId}.pdf` (exported PDFs)

All static content is under the `/static` route; the API is under `/api`. In development, Vite proxies these to the backend on port 8000.

---

## 3) Quick‑Start (Development)

**Prerequisites:**

* Node.js 18+ (server build targets Node 22)
* npm or pnpm (instructions use npm)
* Python 3.10+ (if running local model inference with PyTorch, optional)
* CUDA 11+ (for GPU acceleration during inference, optional)

**Setup and Run:**

1. **Install dependencies:** In the repository root, run `npm install`. This installs both client and server packages (via a single `package.json` workspace).
2. **Start development servers:** 
For the backend:
`cd backend`
`node server.js`
and in a second terminal run the frontend with
`npm run dev`
3. **Open in browser:** Navigate to **[http://localhost:8080](http://localhost:8080)**. You should see the application’s login/landing page or main interface. From here, you can create a patient, upload images, and test the end-to-end flow.

During development, the proxy (configured in `vite.config.ts`) will log all proxied requests to the terminal, which helps debugging CORS or routing issues. The client supports hot-reloading via Vite, and the server will reload via Nodemon when you edit server files.

---

## 4) Data & Model Placement

The Express server serves both the static files and the API. By default, file paths are relative to the project root or the `static` directory.

* **Patient Images & Mosaics:** When you upload images via the UI, they are saved under `/static/patients/{pid}/visits/{vid}/`. The server expects five images named `original_1.jpg` ... `original_5.jpg` for each visit. After upload, the server will generate a `mosaic.png` and `mosaic_full.png` in that same folder. These represent the composite image used for analysis (thumbnail and full-size respectively).
* **Model Files:** Place trained model weight files in the **`/models`** directory (which you may need to create at the project root or under `server`). For example, you might have:

  * `models/fasterrcnn_par_head.pth` – the custom two-stage model (PyTorch) with PAR regression head.
  * `models/yolov8_par.pt` – a YOLOv8 model fine-tuned for PAR component detection.
  * `models/detector.onnx` – an exported ONNX version of a model for use with onnxruntime.
* **Inference Script:** Ensure the backend knows how to use your model. By default, the analysis route will call a Python script (e.g., `server/ml/infer.py`) or load an ONNX model. Update that script or the code to load your model file name and architecture. For instance, if you add a new model file, edit `infer.py` to load that file path, and adjust any model-specific preprocessing or postprocessing. If using onnxruntime in Node, update the code where the ONNX session is created (e.g., in `server/routes/parComponents.ts` or similar) to point to your model’s path.

**Data storage:** This prototype uses in-memory data structures for simplicity (or local JSON files). For persistence or multi-user scenarios, integration with a database (like SQLite/PostgreSQL) is recommended but outside the scope of this prototype.

---

## 5) Feature Overview (Current Prototype)

**At a glance, the application can:**

* **Upload:** Drag-and-drop five intraoral photos (standard orthodontic views) for a new patient visit. The server stitches them into a mosaic image and then runs the AI analysis to detect PAR components.
* **Mosaic Viewer:** A full-screen, zoomable view of the mosaic with bounding boxes overlaid. Users can toggle labels, zoom/pan, and inspect each detected region.
* **Editor:** An editing mode to add, adjust, or delete PAR boxes and their scores. The UI uses an optimistic update (immediate feedback) and syncs changes to the server. Edits are logged with user and timestamp, and the total PAR recalculates live as you adjust scores.
* **Patient Dashboard:** List of all patients with their latest PAR score and an urgency badge (e.g., high PAR might flag a case as urgent). Selecting a patient shows their visit timeline (initial, progress, final visits) with scores, and allows quick navigation to detailed views. It also shows a comparison from the first to the last visit.
* **Similarity:** Retrieve visually similar cases based on PAR scores – a k-Nearest Neighbors feature that finds patients with similar treatment outcomes or malocclusion patterns. This helps in comparative diagnosis or treatment planning.
* **Reports:** Generate PDF reports for a patient (e.g., initial vs final comparison, summary of scores). The report includes the mosaic and boxes, the scores, and can be extended to include AI-generated narrative (draft mode).
* **Bulk Processing:** (Prototype placeholder) A queue interface to upload and analyze multiple cases in batch, demonstrating how the system could handle volume (e.g., backlog of records).

### Clinical Background & Weights

PAR is a weighted sum of several sub-scores, each evaluating a specific aspect of occlusion or alignment. In this prototype, we focus on eight key components (a slight simplification of the full 11-component PAR index for ease of use):

* Upper Crowding
* Lower Crowding
* Upper Spacing
* Lower Spacing
* Overjet
* Overbite (or Open bite)
* Crossbite
* Centerline (deviation)

Each component is scored from 0 (ideal) upward, and the scores are combined with specific weights to compute the total PAR. The weight scheme (from orthodontic standards) applied is:

* **Overjet** × 6
* **Centerline** × 4
* **Overbite/Open bite** × 2
* **Upper/Lower Crowding**, **Upper/Lower Spacing**, **Crossbite** × 1 (each)

These weights reflect the relative importance of certain discrepancies (for example, a large overjet is heavily penalized). The UI enforces each component’s range and displays its weight to the user. By weighting, an overjet discrepancy will contribute up to 6 times more than a mild spacing issue in the total score.

### Mosaic Creation

**Why a mosaic?** Instead of running detection on five separate images (anterior, lateral, occlusal views), the system creates one combined image (“mosaic”) that contains all views in a fixed layout. This approach has several benefits:

* **Single Input for AI:** One image can be fed into the detection model, simplifying the inference process (one forward pass instead of five). This ensures the model can consider the whole context at once and potentially capture interactions between different views (e.g., how upper and lower teeth relate).
* **Visualization:** It provides a consistent, composite view for the orthodontist, making it easier to see all detected issues at once without flipping between photos.
* **Coordinate Consistency:** All detection boxes can be referenced in a single coordinate system (the mosaic’s pixel space), simplifying storage and scaling math (no need to track which image a box came from in the UI logic, aside from maybe an ID to indicate the view).
* **Storage & Access:** Only one image file per visit (the mosaic) needs to be loaded for reviewing detections, which can be more efficient than loading multiple files.

**How it’s done:** The server uses a fixed grid template to arrange the five input photos in an 3x2 grid . It then saves a thumbnail (`mosaic.png`) for fast loading in lists, and a full-resolution version (`mosaic_full.png`) for detailed analysis and editing. The code uses libraries like Pillow or OpenCV to create this mosaic. The layout is standardized, so the model is trained to expect the images in those positions.

### Boxes & Coordinate Scaling

Detected PAR components come as bounding boxes relative to the mosaic image. However, the mosaic will be displayed in the browser scaled down (or up) to fit the screen or editing view. The app handles conversion between **natural image coordinates** (pixels in the full mosaic image file) and **display coordinates** (pixels in the browser canvas) so that when you edit a box, the changes are saved correctly:

* **Storing Boxes:** All boxes are stored in the backend (and sent to the frontend) as coordinates in the full-size mosaic image. For example, a box might be at `(x: 1000, y: 500, width: 150, height: 80)` in a 3000×1500 mosaic.
* **Displaying Boxes:** The front-end scales these numbers down to the current image display size. If the mosaic is shown scaled-to-fit at, say, 1500×750 pixels, all coordinates are multiplied by 0.5 (since display is 50% of natural size in this example) for rendering.
* **User Edits:** If the user drags a box or resizes it on screen, the app will take the new display coordinates and scale them back *up* to the natural image scale before sending to the server. This ensures we maintain full precision and consistency regardless of how the image is viewed.

This scaling logic is encapsulated in helper functions (e.g., `scaleRectToDisplay()` and `scaleRectToNatural()`) so that all parts of the app use it consistently. A common pitfall was ensuring the **mosaic\_full.png’s dimensions match exactly the dimensions used in calculations** – any discrepancy would misalign boxes.

### PAR Total Calculation

The PAR total is automatically computed as the sum of each component’s score times its weight. The **PAR Components Context** in the React app manages this:

* It holds the list of current components (with their scores and details) for the open visit.
* Whenever a component is added, removed, or edited (score changed, or even reassigning a box), it recalculates the total = Σ(score\_i × weight\_i).
* The total is then immediately shown in the UI (the clinician sees the number update live). The context also debounces updates to the backend: after a short delay (e.g. 250ms) it sends the updated component list and total score to the server (via `PUT /api/visits/:patientId/:visitId` for the total, and individual component CRUD calls if needed).
* The server stores the updated total and components. It also triggers a re-fetch of related data (e.g., if the patient list is showing, it will now show the updated score in that patient’s entry).

The weighting scheme is built into the context so that even if a user changes a component’s value via the UI, the total is always in sync. Because Overjet and Centerline carry large weights, changes in those fields will visibly jump the total more than others – which matches the clinical significance intended by the index.

### Similarity (k‑NN) and Feature Vector

Apart from assessing a single case, the system can suggest **similar patients** from the database. This is useful for comparing outcomes or finding reference cases (e.g., “show me cases similar to this one that had great results”).

**Feature vector:** We represent each patient’s malocclusion as an 8-dimensional vector:
$v = (\text{upperCrowding}, \text{lowerCrowding}, \text{upperSpacing}, \text{lowerSpacing}, \text{overjet}, \text{overbite}, \text{crossbite}, \text{centerline})$
However, to make the comparison fair, we first **normalize each component** by its maximum possible score (since some components have different scales). This yields values roughly between 0 and 1 for each component for each patient. For example, if Overjet can theoretically score up to 10, and a patient has Overjet = 5, we use 0.5 in that dimension.

**k-Nearest Neighbors:** To find similar patients, we use a simple k-NN approach in this feature space:

* We compute the Euclidean distance between the feature vector of the current patient (usually at initial visit) and every other patient’s vector (initial visits).
* Then we take the K smallest distances – these correspond to the most similar cases. We convert distance to a similarity percentage for the UI (e.g., a distance of 0 would be 100% similar; higher distances lead to lower percentages by an inverse relationship).

Why k-NN? We chose k-NN for **transparency and simplicity**. There’s no complex model to train or interpret – it’s literally finding closest points in the space of PAR scores. This zero-training approach means as soon as we have data, we can compute similarities. It also means the suggestions are explainable: a case is similar because each of its component scores are close to the query case’s scores.

**Note:** The k-NN similarity search does *not* incorporate the PAR component weights. We intentionally compare raw (normalized) sub-scores rather than the weighted total, because using the weights would skew the distance heavily towards components like Overjet or Centerline. For finding clinically similar cases, we want to consider the pattern of discrepancies across all components, not just the final score. For instance, two patients might both have a total PAR of 20, but one’s points come mostly from crowding while the other’s come from a big overjet – very different cases. By treating each component equally in the vector, the k-NN ensures that a match has *each* aspect of malocclusion in common, not just an equal sum. This approach aligns with the idea that clinicians might want to find cases with, say, similar crowding and overjet specifically, rather than identical weighted totals.

If a more sophisticated approach is desired, one could train an embedding (e.g., using an autoencoder or a more advanced similarity learning), but k-NN on the PAR features has proved to be an effective baseline. It’s also easy to update – as new cases come in, you just recompute distances on the fly.

---

## 6) Architecture & Code Tour

### Client (React/Vite)

The React single-page app is the primary interface for users. It uses **React Router** to manage views and **React Query (TanStack Query)** for data fetching and caching. Key elements:

* **App Shell:** The main page (`client/pages/Index.tsx`) sets up the overall layout – a sidebar with icons (for switching main sections like Patients, Similarity, Bulk), a top bar, and a content area where different tabs/panels render. It also provides context providers (for theming, query, toasts, etc.).
* **Tabs System:** We implemented a pseudo-multi-window experience where the user can have multiple "tabs" open (Patients list, a particular Patient’s detail, an Upload dialog, a Mosaic editor, etc.). These are represented in state and can be switched. This behaves similar to an IDE or a browser with multiple open documents.
* **Hooks:** The `client/hooks/` directory contains specialized hooks:

  * `usePatients(), usePatient(id)` – fetch list or a single patient (and their visits).
  * `useVisits(patientId)` – fetch visits for a patient; `useVisit(id)` for one visit’s data.
  * `useParComponents(pid, vid)` – fetch the PAR components (detections) for a given visit.
  * `useSimilarPatients(pid)` – fetch k-nearest neighbors for a patient.
  * All these use React Query internally to cache results and share across components. They also automatically handle API endpoint URLs and mapping JSON to TypeScript types.
* **PAR Context:** `client/hooks/useParComponentsContext.tsx` – This provides a React context to manage the list of PAR components for an active visit in the Mosaic editing view. It wraps `useParComponents` but also gives functions to add/delete/edit a component and takes care of weighting and total calculation. It’s used in components like the sidebar list of components and the mosaic overlay.
* **UI Components:** We have modular components for things like:

  * Patient List, Visit List, Similarity List (each row is clickable to open details).
  * Upload Wizard (a stepper that ensures five images are added and then calls the API).
  * MosaicCanvas (displays the mosaic image and boxes, handles drag-to-select, and uses an HTML canvas or overlay for drawing boxes).
  * BoxEditor (a modal or side drawer that lets user fine-tune a selected box’s score or delete it).
  * ReportViewer (to display PDF or summary info about a report).
* **Styling:** Using Tailwind CSS for utility-first styling, with a custom theme for colors. We also incorporate dark mode support (Tailwind’s dark variant) – the UI can toggle dark mode which is helpful for X-ray images, etc.
* **State Management:** We avoided heavy state management libraries; React Query covers server state, and for client state (like current user, current open tabs, etc.), we use React context or local component state. The similarity search input (e.g., filtering neighbors by outcome) uses local state and triggers a new request as needed.
* **Mobile/Responsive:** The layout is primarily designed for desktop (clinic workstation), but basic responsiveness is in place. The side nav can collapse to icons only, and panels stack on smaller widths.

### Server (Express)

The Express backend is structured around RESTful principles for the resources (patients, visits, components, reports). Key points:

* We use JSON for all API responses, and the API is stateless (no sessions or auth in this prototype).
* **Routing:** Defined under `server/routes/`. We have, for example:

  * `patients.ts` – defines routes for patients CRUD and patient-level stats.
  * `visits.ts` – defines routes for visits CRUD and some convenience filters (upcoming, history).
  * `parComponents.ts` – defines routes for getting/adding/updating PAR components, and the `analyze` route to run the AI.
  * `reports.ts` – for report generation and retrieval.
  * `uploads.ts` – for the image upload workflow (this might manage temporary state while uploading files).
  * `similarPatients.ts` – for the similarity k-NN results.
* **Data Storage:** For the prototype, we use simple JavaScript objects or in-memory stores to hold data. For example, we might have a `patients` array and each patient has a `visits` array, etc. These are initialized with some dummy data on server start (or remain empty). Any changes via the API update these objects. In a real app, this would be replaced by database calls.
* **Static Files:** The server uses Express.static to serve the `/static` directory. The mosaic images and uploaded photos go there. In development, Vite’s proxy forwards requests to these properly. In production, the same Express can serve them or they could be offloaded to cloud storage, but path conventions remain the same.
* **Analysis Workflow:** When a new visit is created (images uploaded), the backend:

  1. Saves the images, makes the mosaic.
  2. Creates a Visit entry in the patient’s record (with status “processing” or similar).
  3. Invokes the AI analysis. This is done either by spawning a child process that runs `python ml/infer.py /path/to/mosaic_full.png` **or** by loading an ONNX model and running inference directly in Node (depending on configuration).
  4. The inference result is expected as a JSON array of components. The server then saves these components (via the same PAR components routes, or directly attaching to the Visit object) and updates the visit’s `parScore` (weighted sum).
  5. Finally, the visit status is set to “done” and the front-end is notified (the client was polling or received a WebSocket event in a more advanced setup). In this prototype, the client simply re-fetches the visit data until the status changes.
* **Error handling:** Basic try-catch around file operations and model inference. If the model fails (throws an error or times out), the visit is marked with status “error” so the UI can indicate that.

The Express app is also configured to be **serverless-compatible**: the code avoids long-lived server state and can be run behind an API gateway or function-as-a-service platform. There is a `vite.config.server.ts` that builds the server into a single file, which can be used for AWS Lambda (with an adapter that wraps Express into a handler).

### Contracts & Types

We maintain a set of interfaces (TypeScript types) for the core entities:

* `Patient`: { id, name, birthdate, sex, status, currentPARScore, visits: VisitSummary\[], createdAt, updatedAt }
* `Visit`: { id, patientId, stage (initial/progress/final), date, notes, parScore, status (pending/processing/done), images: { original\_1, ..., mosaic, mosaic\_full }, createdAt, updatedAt }
* `PARComponent`: { id, visitId, component (name), toothRegion (if applicable), score, maxScore, weight, confidence, rect: { x, y, width, height }, viewId (which of the 5 images it came from, if we tag that), editable (bool), createdAt, createdBy, lastModifiedAt, lastModifiedBy }
* `SimilarPatient`: { patientId, similarity (percent), outcomeCategory (e.g., excellent/good/fair/poor based on improvement), commonIssues?: string\[] (which components are most similar) } – the outcomeCategory could be determined by the reduction in PAR from initial to final, for instance.
* `Report`: { id, patientId, title, content (could be structured JSON or markdown for a report), createdAt, ... }

These types are shared between client and server via the `shared` folder to avoid duplication. The API endpoints accept/return JSON that fits these structures.

Notably, the `PARComponent` includes fields like `confidence` (which comes from the model’s confidence score for that detection) and `maxScore` (the maximum allowed score for that component, which could be used by UI to cap edits). The `weight` is not stored per component in the backend (since it’s implied by component name), but the client might have a mapping for display.

### Query Keys & Cache Strategy

In React Query, each data fetch has a **key** that identifies it in the cache. We use a consistent key scheme:

* `['patients']` for list of patients
* `['patient', patientId]` for a single patient (with embedded visits)
* `['visits', patientId]` for list of visits for patient
* `['visit', visitId]` for a single visit
* `['parComponents', patientId, visitId]` for the PAR components of a visit
* `['similarPatients', patientId, k]` for similar patients results (k neighbors for a given patient)

After any mutation (add/edit/delete) we carefully invalidate or update caches. For example, when a new visit is uploaded:

* Invalidate `['visits', patientId]` so the list will refetch and include the new visit.
* Optionally, invalidate `['patient', patientId]` if that contains aggregated data like currentPARScore.
* When PAR components are updated (user edits a score), we update the local context and also optimistically update the `visit.parScore`. The context then triggers an update to the `Visit` object on the server, and we might invalidate `['visit', visitId]` so if any other part of UI is showing that visit’s data, it gets the fresh total.

This strategy ensures minimal waiting – the user sees updates immediately, and the server is eventually consistent. Since this is not a multi-user scenario, simple last-write-wins is fine. In multi-user, one would add versioning or real-time sync (out of scope for now).

---

## 7) Back‑end API Snapshot

Here is a summary of the key API endpoints and their purposes (all routes are prefixed by `/api`):

**Patients**

* `GET /patients` – list all patients (with optional query parameters for search or filtering by status).
* `GET /patients/:patientId` – get detailed info for one patient, including their visits.
* `POST /patients` – create a new patient (expects a JSON body with name, birthdate, etc.).
* `PUT /patients/:patientId` – update patient information (e.g., edit name or status).
* `DELETE /patients/:patientId` – delete a patient (for prototype, a hard delete from memory).
* `GET /patients/stats/overview` – (optional) returns aggregate stats, e.g., total patients, average PAR, etc., for a dashboard.

**Visits**

* `GET /visits/:patientId` – list visits for a patient (can filter by status or stage via query params, e.g., `?status=done&limit=5`).
* `GET /visits/visit/:visitId` – get one visit by its ID (could also be nested under patient, but provided directly for convenience).
* `POST /visits/:patientId` – create a visit for patient. This is typically triggered after images are uploaded. The request might include metadata like stage or date. The server will assign an ID, save images, create mosaic, and start analysis.
* `PUT /visits/:patientId/:visitId` – update a visit (e.g., you could mark notes, or update the parScore if recalculating). The front-end uses this to save manual changes to the PAR total.
* `DELETE /visits/:patientId/:visitId` – remove a visit and its associated images.
* `GET /visits/:patientId/upcoming` – (optional) get the next scheduled visit if any (for treatment planning).
* `GET /visits/:patientId/history` – (optional) get past visits (excluding initial) for comparison.

**PAR Components (Detections)**

* `GET /par-components/:patientId/:visitId` – retrieve all detected or manually added components for a visit (with their scores and coordinates).
* `POST /par-components/:patientId/:visitId` – add a new component (when a user manually adds a missing issue). The body would contain the component details (name, score, rect).
* `PUT /par-components/:patientId/:visitId/:componentId` – update an existing component (e.g., adjust score or position or mark confidence after manual review).
* `DELETE /par-components/:patientId/:visitId/:componentId` – delete a component (e.g., if the AI proposed a wrong box and the user removes it).
* `POST /par-components/:patientId/analyze` – trigger (or re-trigger) analysis on the latest pending visit of a patient. This is how the UI asks the server to run the model if, say, initial analysis didn’t run or the user wants to re-run with a new model. It could also accept a specific visit ID in a more expanded design.

**Reports**

* `GET /reports/:patientId` – list all reports for a patient (if we allow multiple saved reports or comparisons).
* `POST /reports/:patientId` – create a new report (the body might have title/content or instructions like “compare visit X and Y”).
* `POST /reports/:patientId/generate` – auto-generate a report draft from a visit (this could run a template or even an AI summary).
* `GET /reports/:patientId/:reportId` – fetch a specific report’s details.
* `PUT /reports/:patientId/:reportId` – update a report (if user edits narrative or title).
* `DELETE /reports/:patientId/:reportId` – delete a report.
* `GET /reports/:patientId/:reportId/download` – download the PDF version of a report.

**Similar Patients**

* `GET /similar-patients/:patientId?k=10` – get the top *k* similar patients to the given patient (defaults to 10). This will internally compute the feature vector and distances as described earlier.
* `GET /similar-patients/:patientId/:neighborPatientId` – get details for one specific similar patient (this might not be used often, as the main call provides enough info, but could fetch more details if needed).
* `POST /similar-patients/:patientId/search` – a more advanced endpoint where the body could specify filters (e.g., only consider cases with final outcome “good” or better). Not fully implemented, just a placeholder.
* `GET /similar-patients/:patientId/outcomes` – returns aggregated counts of outcome categories among similar patients (e.g., how many had excellent outcomes vs poor), for a mini-analytics display.

**Uploads & Progress** (for the upload wizard or batch processing)

* `GET /uploads` – list current uploads (if we track state of multi-file uploads).
* `GET /uploads/:viewId` – get status of a particular file (e.g., if uploading asynchronously).
* `PUT /uploads/:viewId` – update a file’s metadata (maybe mark as assigned to a particular type of photo).
* `POST /uploads/:viewId/upload` – actual upload endpoint for a single file (the wizard uses this under the hood). Could also be a direct `POST /visits/:patientId` with multipart form data in a simpler design.
* `POST /uploads/reset` – resets all upload state (for dev/testing).
* `GET /uploads/progress/overview` – returns a summary of how many uploads are in progress, etc. (to display a global progress bar perhaps).

**Static Files**

* Any request to `/static/...` will fetch a file from the `static` directory. Notably:

  * `/static/patients/{pid}/visits/{vid}/mosaic.png` (small mosaic)
  * `/static/patients/{pid}/visits/{vid}/mosaic_full.png` (large mosaic)
  * `/static/reports/{pid}/{id}.pdf` (report files if any)

All API responses are JSON. In case of errors, we return a JSON with an `error` field and appropriate HTTP status (e.g., 400 for bad input, 500 for server errors). The client is set up to display basic error messages (toast notifications) when an API call fails.

---

## 8) Python Requirements

If you want to run the model inference using Python (which is likely if you’re using a PyTorch model), you’ll need a Python environment with the necessary packages. The `requirements.txt` provides a baseline set:

* **torch 2.0+** (PyTorch deep learning library)
* **torchvision 0.15+** (for model architectures like Faster R-CNN, if using Torchvision’s built-ins)
* **ultralytics 8.0+** (if using YOLOv8 from the Ultralytics package – this provides a simple way to run YOLO models)
* **opencv-python 4.8+** (for image processing in Python, e.g., reading the mosaic, drawing boxes if needed)
* **pillow (PIL) 10+** (for image manipulation, could be used in mosaic creation as well if Python side does it)
* **numpy 1.25+** (for array operations)
* **scikit-image, scikit-learn** (optional, skimage for any image utils, sklearn if using any advanced analysis like clustering on features)
* **onnxruntime 1.15+** (if you plan to use ONNX model inference, though if using it in Node, you’d use onnxruntime-node instead)

To set up, you might do:

```bash
# Create and activate a virtual environment (optional but recommended)
python3 -m venv venv
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

Make sure your Python version is compatible with the above libraries (Python 3.10 is a safe bet with the listed versions).

**Note:** The prototype is configured to attempt Python-based inference if a Python executable is available and the model files exist. If you do not wish to install Python or these packages, you could rely on a pre-exported ONNX model and have NodeJS run it (in which case, adjust the code to use onnxruntime in the server). For development and easier tweaking, we found it convenient to call Python.

---

## 9) NPM Scripts (Root)

A quick reference for the scripts you can run from the project root:

* **`npm run dev`** – Runs the app in development mode. This does a concurrent start of the Vite dev server (serving the client on port 8080) and the Express server on port 8000 (using the Vite dev middleware). You’ll see logging from both. This is the main command during development.
* **`npm run build`** – Builds the production-ready assets. It will bundle the client (output to `dist/spa`) and also compile the server (output to `dist/server/`). The result is a static SPA and a Node server bundle.
* **`npm run start`** – Starts the built server in `dist/server/production.mjs`. This assumes you’ve run build. It will serve the static SPA and listen on port 8000 for API (so you’d host the SPA on something like [http://yourserver:8000](http://yourserver:8000) and it will work, or behind a proxy).
* **`npm run test`** – Runs any automated tests. We have a minimal setup with Vitest (a Vite-friendly test runner similar to Jest). There are a few example tests in `client/tests` as a demonstration (e.g., a simple component snapshot or util function test). This can be expanded for serious testing.
* **`npm run lint`** – Runs ESLint and Prettier to check and fix code style. We follow a mostly standard configuration with maybe a few custom rules disabled for brevity. Make sure lint passes before commits.

These scripts use the configuration in `package.json` and refer to local scripts or use cross-env to set any needed environment variables (for example, none needed here beyond defaults). Adjust as needed if deploying in a different context.

---

## 10) Integrating Your Own Detection Model

One of the key customizable parts of this project is the AI model that detects PAR components. Depending on your needs or improvements, you might want to swap in a new model or approach. Here’s how:

**A) Using a Python Runner (PyTorch or other frameworks)**
This is recommended if you are developing your model in Python (e.g., PyTorch, TensorFlow) because it allows maximum flexibility without worrying about NodeJS compatibility:

* Train or obtain your model and save the weights to the `models/` directory (e.g., `models/my_par_detector.pth` for a PyTorch model).
* Write a Python script that loads this model and runs inference on an input image (the mosaic). We’ve used `ml/infer.py` as an example. The contract is: the script should accept the path to an image (mosaic\_full.png) as an argument, and **print to stdout** a JSON representation of the detection results. For example, it might print:

  ```json
  [
    {
      "component": "Overjet",
      "toothRegion": null,
      "score": 3,
      "maxScore": 10,
      "confidence": 0.95,
      "rect": { "x": 1200, "y": 300, "width": 150, "height": 80 },
      "viewId": 1,
      "editable": true
    },
    { ... next component ... }
  ]
  ```

  The server will capture this stdout and parse it as JSON.
* Update the **analysis route** in the Express server to call your script. In our prototype, in `server/routes/parComponents.ts` we do something like:

  ```ts
  spawn('python', ['ml/infer.py', mosaicPath]);
  ```

  Ensure the path to the Python executable is correct or use `python3` if needed. If your script is in a different location or you have multiple scripts (maybe one for YOLO, one for Faster R-CNN), you could add logic or environment variables to choose which to run.
* The Python script should load your model (make sure the model file path is correct, e.g., `models/fasterrcnn_par_head.pth`). You might want to pass the model filename as an argument too, or hardcode it if only one.
* After the script prints the JSON, the Express route will read it and then proceed to save those components via the API or directly attach them to the Visit object and compute the total. Our code calls the same internal functions as if those components were added manually, so it triggers the same caching and events.

**B) Using ONNX Runtime (Node)**
If performance is a concern or you want to avoid the overhead of spawning a process, you can convert your model to ONNX and use onnxruntime in Node:

* Export your trained model to ONNX (many frameworks provide export functions, e.g., PyTorch `torch.onnx.export`). Save the `.onnx` file under `models/` (e.g., `models/par_detector.onnx`).
* Install `onnxruntime-node`. In the server code, instead of spawning Python, you would:

  1. Load the ONNX file once (perhaps at server startup or first request) with `new onnx.InferenceSession({ path: 'models/par_detector.onnx' })`.
  2. Preprocess the mosaic image into a tensor. Node can use libraries like Jimp or Canvas to load images, or you could rely on simpler preprocessing if your model expects a certain size.
  3. Run `session.run({ inputName: inputTensor })` to get outputs. Interpret the outputs (logits or bounding box coordinates) according to your model’s design.
  4. Construct the JSON of components and proceed to save it.
* This method avoids the Python dependency and could be more efficient for concurrent requests. However, writing image preprocessing and correctly parsing model outputs in Node can be more involved. For initial development, the Python route is often easier.

**Where to add the model in code:**

* Place your model file in `models/`. If you name it the same as the example (like `fasterrcnn_par_head.pth` or `yolov8_par.pt`), the existing script might pick it up. Otherwise, open `ml/infer.py` and modify the path. For example:

  ```python
  MODEL_PATH = "models/my_custom_model.pth"
  model = torch.load(MODEL_PATH)
  ```

  (with appropriate loading code for your model architecture).
* If you have multiple models (say you want to compare YOLO vs Faster R-CNN), you could create multiple endpoints or a parameter to choose. For instance, `POST /par-components/:pid/analyze?model=yolo` vs `model=frcnn`. Then in the code, decide which weights to load or which script to call. This can be as simple as an `if` in the route handler that sets the script name or model file name.
* Check the **model input/output expectations:** Our custom model expects a mosaic of a certain size and outputs detections + a global score. If your model is different (e.g., a YOLO might output a list of boxes with class IDs), you might need to translate that to our PARComponent format (assign component names to class IDs, etc.). Do this translation in the Python script for clarity.

**Example:** To integrate a YOLOv8 model using Ultralytics package:

* Train the model externally (Ultralytics CLI or Python API). For example, if you have a YAML for data and want to fine-tune a small model:

  ```bash
  yolo train model=yolov8s.pt data=par_data.yaml epochs=50 imgsz=640 project=runs/par-exp name=yolov8-par
  ```

  This will produce a `best.pt` in `runs/par-exp/`. Copy that to `models/yolov8_par.pt`.
* In `ml/infer.py`, use Ultralytics to load and predict:

  ```python
  from ultralytics import YOLO
  model = YOLO("models/yolov8_par.pt")
  results = model(mosaic_path, imgsz=640)  # run inference
  for r in results: 
      boxes = r.boxes  # YOLOv8 Boxes object
      for box in boxes:
          cls = int(box.cls[0])
          conf = float(box.conf[0])
          x1, y1, x2, y2 = box.xyxy[0]  # get coords
          # Translate cls to component name
          comp_name = CLASS_MAP[cls]  # define CLASS_MAP according to your training classes
          score = get_par_score_for(comp_name)  # maybe classify/regress score separately
          ...
  ```

  Since our case involves regression of scores, you might have trained YOLO to output directly the PAR score as a class (0,1,2,...). Alternatively, you’d train a separate head for regression. The custom model approach (below) did a joint detection + regression.

**Custom Model (our approach):** We designed a custom two-stage model in PyTorch that extends Faster R-CNN. It adds a *global regression head* alongside the classification head. The idea is to output one overall PAR score prediction in addition to the normal detection outputs. The reason is that the network’s backbone then learns features that not only identify local problems but also correlate with the overall severity of malocclusion. This joint learning is expected to improve performance:

* One shared CNN backbone processes the entire mosaic.
* **RPN (Region Proposal Network)** proposes candidate regions for potential issues (like a regular Faster R-CNN).
* For each proposed region, the detector head classifies which PAR component it is (or if it’s background) and also refines the bounding box (Faster R-CNN standard).
* Meanwhile, an additional head takes the pooled features *for the entire image (global context)* or perhaps the fused information from all proposals and regresses a single number (the total PAR score or some aggregated index). This head uses Mean Squared Error loss against the ground truth total score.

Training this model means we provide not just box annotations and class labels, but also a target total score for each training image. The loss is `L_total = L_detection (Faster R-CNN’s classification + box losses) + λ * L_regression (MSE of PAR score)`. We set λ to balance the influence; if overall score is equally important, λ could be 1.

Why go through this trouble? Because **PAR sub-scores are ordinal/continuous** (0 < 1 < 2 ... naturally ordered) and sparse if treated as separate classes (many combinations leading to 40+ possible totals). A single regression avoids treating each possible total as a separate class, which would be a “48-class classification problem” (0 through \~48) – that’s not only imbalanced but loses the notion that 20 is closer to 21 than to 5. By regressing, we keep the continuity and let the model learn the underlying patterns.

Furthermore, the shared model can use global cues: maybe the presence of multiple issues in different regions influences both the detection and the scoring part. In testing, we expect this *custom model* to **outperform plain YOLO or plain Faster R-CNN**, because the network is jointly optimizing global and local predictions. The detailed features in each RPN-proposed box can help the overall score head (the network learns, for example, that if it sees several moderate issues, the total score should be higher). Conversely, learning the overall score can feed back to making the detection branches more sensitive to certain features (e.g., if the total score is high but the model hasn’t found enough boxes to explain it, it may adjust weights to find more).

*Integration:* The output of this custom model at inference would be both detections and a total score. In `infer.py`, after running it, you’d parse the detections as usual and also take the predicted PAR total. The prototype currently doesn’t automatically use the predicted total (since it calculates from components), but you could log it or use it to double-check the consistency of detected components.

---

## 11) Running the Similarity Demo

To use the patient similarity feature in the app:

1. **Ensure data is in place:** The similarity function relies on having multiple patients each with at least an initial visit and recorded PAR component scores. In the demo dataset or after you’ve analyzed a few patients, make sure there are several entries with meaningful scores. The more cases, the more interesting the similarity results.
2. **Open a patient’s record:** In the UI, go to a patient detail view (for example, after analysis of an initial case is done). There’s a “Similar Cases” or “Find similar patients” option (depending on the UI design, it might be a tab or a button).
3. **Trigger similarity search:** The app will call `GET /api/similar-patients/{patientId}?k=5` (or another number) to retrieve the top 5 similar patients. The results will appear as a list, showing each neighbor patient with a similarity percentage and some basic info (like their final outcome or current score).
4. **Inspect results:** You can click on a similar patient suggestion to jump to their profile, or perhaps see a side-by-side. The UI also color-codes the outcomes: for example, if a similar patient ended with a low PAR (good result), it might show a green “Excellent outcome” label, whereas a high remaining PAR shows “Poor outcome”. This gives context – e.g., “This current patient is similar to John Doe who ended up with a poor result; maybe extra intervention is needed” or vice versa.

Under the hood, as described, the server normalized each component by its max score (e.g., Overjet out of 10, etc.) so that no single dimension dominates due to scale. If you wanted to tweak the similarity logic, a quick way is to adjust those normalizations or even incorporate the weights (though we currently don’t for reasons explained). Another possibility is switching to **cosine similarity** (i.e., measure the angle between the feature vectors rather than Euclidean distance). Cosine would emphasize the *pattern* of scores regardless of absolute magnitude. In our tests, Euclidean vs cosine didn’t differ much after normalization, since all features are on 0-1 roughly.

For an advanced demo, one could integrate t-SNE or PCA to visually cluster patients by similarity, but that’s outside the current scope. The k-NN textual approach suffices for demonstration.

**What is the easiest way to find similar cases?** We found that leveraging the existing PAR scores was the easiest and most transparent method. Since every case already has those scores (either from AI or manual input), using k-NN on that data avoids the need to design a complex feature extractor. Essentially, we treat the PAR scores themselves as an 8-dimensional embedding of the malocclusion. This is straightforward and computationally light – just a few subtractions and multiplications – making it easy to run even in the browser if we wanted. While not as fancy as deep learning embeddings, this method is **immediately interpretable** by clinicians (they can see *why* a case is similar by comparing score breakdowns) and it can be improved incrementally (e.g., perhaps apply a slight weight in the distance for Overjet and Centerline if desired, or include additional features like age or treatment type if relevant).

---

## 12) Security, Privacy & Clinical Use

*This prototype is not secure or compliant for real patient data!* It’s important to highlight what would be needed for a production or clinical deployment:

* **Authentication & Authorization:** Right now, anyone can access the UI and data. We would integrate a login system (perhaps JWT-based API auth with refresh tokens, or session cookies). Users would be roles like “Orthodontist”, “Assistant”, “Admin”, etc., with permissions (who can delete data, who can run analysis, etc.).
* **Encryption:** All network communication must be over HTTPS. For stored data (images and JSON), at least disk-level encryption or encrypted S3 buckets should be used. In a hospital context, full compliance with HIPAA/GDPR means controlling access to patient identifiers and possibly de-identifying images.
* **Privacy:** Even though these are just teeth photos, they are part of a patient’s record. We would ensure each user can only see their own patients (multitenancy considerations) or implement a consent system if data is to be shared. For the similarity feature, one must be careful – if it’s cross-patient, it should likely only pull from an authorized pool (maybe your own past cases, not other doctors’ cases without permission). For the prototype, we ignored this, but real systems would filter by owner or have an anonymized reference database.
* **Human-in-the-loop:** The AI suggestions (boxes and scores) should be reviewed by a clinician. The UI is built for that – it allows editing everything. We log any edits so that there’s an audit trail of what the AI said vs what the doctor finalized. In a production setting, you’d keep both values (initial and corrected) for analysis and accountability.
* **Calibration:** Different clinics might have slightly different interpretations of PAR scoring. A future improvement could let each clinic adjust calibration settings (e.g., if the AI tends to overshoot in their view, a bias correction per component). And the system should continuously learn from corrections (active learning) – though we haven’t implemented that.
* **Performance & Reliability:** With real data, you’d add things like asynchronous job queues for the analysis (so if 100 cases are uploaded, they can be processed in order, possibly distributed to multiple GPUs). The prototype uses a simple spawn which wouldn’t scale well if multiple requests come at once (could overwhelm memory or GPU). A more robust approach uses a task queue (Redis + worker processes).
* **Testing & Validation:** Before clinical use, the model would be validated on a large separate dataset to ensure accuracy and safety. The UI also would be tested for edge cases (e.g., unusual photo conditions). Ideally, the tool would be classified as a medical device software if it’s giving recommendations that could affect treatment, so regulatory approval might be needed depending on jurisdiction.

In summary, this project demonstrates the concept, but substantial additional work is needed for a real product: user accounts, data security, robust error handling (we currently assume images are always good; a production system must handle corrupt images, etc.), and thorough evaluation.

---

## 13) Deployment

When you’re ready to deploy this prototype (for example, on a server or cloud service), here are the steps:

**Build the application:**

* Run `npm run build`. This will do two things:

  1. Create an optimized production build of the client app. The output (minified JS/CSS, index.html, assets) goes into `dist/spa`.
  2. Bundle the server code (Express app) into a single file (using Vite’s SSR build). The output is `dist/server/production.mjs` (plus maybe some chunk files or node\_modules that are not bundled if externalized).

Make sure to set the environment variable `VITE_API_URL` appropriately *before* building if your client needs to know a different URL for the API. By default it’s `/api`, which works if you serve the client and API from the same host. If you plan to host the API separately (e.g., at an API domain), you’d build the client with `VITE_API_URL="https://api.myserver.com/api"`.

**Deploy static assets:**

* The contents of `dist/spa` (especially `index.html` and the `assets` folder) need to be served by a web server. This could be done by the Express app itself (it can serve `index.html` on `/` and use static middleware for assets), or by an external web server or CDN. In our setup, the Express app is already configured to serve `dist/spa` if it exists.
* Alternatively, you can host the SPA on a service like Netlify or GitHub Pages and just configure it to call your API endpoint.

**Deploy the server:**

* If you have a traditional server (e.g., a VM or Heroku or Render), you can just run `node dist/server/production.mjs`. Ensure the working directory has the necessary `models` and `static` folders in place, and any environment variables. The server by default listens on port 8000 (you can change this by setting `PORT` env var or modifying code to use process.env.PORT).
* If using Docker, you could create a Dockerfile that copies in the `dist/server` and `dist/spa` and runs the node process. The static images directory would need volume or persistent storage if you allow runtime uploads.
* For serverless (AWS Lambda, etc.), we included a minimal adapter. Typically, you’d package the `dist/server/production.mjs` along with Node modules into a Lambda and use API Gateway to route to it. Given the complexity, many choose to deploy on a container or a small VM instead for such an app.

**Domain & Proxy Setup:**

* Ideally, have one domain serve both API and client (to avoid CORS). E.g., `https://parai.example.com` could serve the SPA, and the API is accessible at `https://parai.example.com/api/...`. This is straightforward if one Express serves everything. If separated, configure CORS on the API to allow the client origin.
* Use a reverse proxy like Nginx or Traefik if needed to route traffic and handle SSL termination. For small scale, you can let the Node app listen on 443 with HTTPS (using something like `https` module with certificates), but that’s not typically as robust as a dedicated proxy.

**Static file storage:**

* Right now, uploaded images and generated files are stored on the local filesystem under `/static`. In a multi-server or auto-scaling scenario, you’d instead use shared storage (like AWS S3). The code would then upload to S3 and serve URLs from there (or use a network file system). This requires code changes in the upload and static-serving logic. For this prototype, local storage is fine but just note that if the server redeploys, those files should persist.

**Environment variables:**

* `VITE_API_URL` (for client, set at build time) – default `/api`.
* `PORT` (for server, optional) – default 8000.
* `PYTHON_PATH` (optional) – if the Python executable is not just `python` or `python3` in PATH, you might set an env var or adjust the spawn command to point to it.
* `MODEL_NAME` or similar (optional) – you could use env vars to choose model weights or ONNX vs Python. Not implemented explicitly, but easy to add.

After deployment, test the app end-to-end: create a patient, upload images, ensure the mosaic forms and analysis completes. Check logs for any file path issues (common on Linux case-sensitive vs Windows, etc.). Also verify that editing and saving still works (file permissions might need adjusting so that the process can write to the static folder).

---

## 14) Troubleshooting

Even in a prototype, things can go wrong. Here are some common issues and how to address them:

* **Mosaic images return 404:** After upload, if the UI tries to load the mosaic and it’s not found, check the backend logs. Ensure that the files were saved under the correct directory. The path should be `/static/patients/{pid}/visits/{vid}/mosaic.png`. In dev, also make sure Vite’s proxy is forwarding `/static` to the backend. If you see a URL like `http://localhost:8080/static/...` returning not found, it means either the file truly isn’t there or the dev proxy isn’t configured. (Our config does proxy static, so likely a path issue). Possibly the patientId or visitId could be incorrect in the path if the UI did not get the right IDs – double-check the logic that constructs the mosaic URL (`makeMosaicUrl` function).

* **CORS or proxy errors in development:** If you open the browser console and see CORS errors on API calls, it might be that the dev proxy isn’t working (e.g., if you ran a separate server on 8000 manually and didn’t start via `npm run dev`). The dev setup expects you to use the proxy. A quick fix is to ensure `npm run dev` is used and that no other server is running on 8000. The Vite dev server should output “Proxy attached” messages. Also, check that the `.env` has `VITE_API_URL=/api` (should be by default) and that the client isn’t accidentally pointing to a different address.

* **Edits not saved:** If you drag a box or change a score and it seems to revert or not persist on page refresh, it could be a timing issue. The PAR context uses a debounce – it waits a short time after the last change before sending to server. If you, for instance, made a change and immediately closed the browser or navigated away, the request might not have gone through. Try reproducing and waiting a second. We might need to flush debounced changes on unmount to handle fast user exits (not implemented yet). Another cause could be an error in the PUT request – check the network panel; maybe the payload was rejected by the server (the endpoint expects a certain format). Ensure the server logs don’t show validation errors.

* **Analysis never finishes:** You uploaded images, but the UI spinner for analysis is still spinning after a long time. Check the server process running the model. If using Python, perhaps the process hung or encountered an error. In development, the Express logs should show if the `spawn` returned an error or if an exception was thrown in the Python script. Common issues:

  * Python not found or not configured (fix: ensure Python is accessible, or adjust path).
  * Model file not found (fix: check the path you load, relative paths in Python are relative to working dir which might be project root).
  * Exceptions in model code (fix: run the script manually with a test image to debug).
  * ONNX runtime issues (if using ONNX, make sure onnxruntime is installed and the model path is correct).

  Also ensure that the backend does eventually mark the visit status to "done" or "error" so the UI stops polling. If not, the UI will appear stuck. We set a safety timeout (maybe not yet implemented) such that after X seconds we stop waiting. In debugging, it’s often helpful to run the Python inference standalone in a notebook or script to ensure it works on the mosaic images.

* **Bounding boxes misaligned on mosaic:** If the drawn boxes don’t exactly cover the intended area on the mosaic image, likely a scaling issue. Remember, the mosaic\_full.png’s *natural pixel dimensions* must be exactly what the model assumed. For example, if the mosaic is created at 3000×1500 pixels, and the model outputs a box at (1500,750) expecting that scale, but the actual mosaic\_full.png saved is maybe 1500×750 (half the intended size), then the boxes will appear off by a factor of 2. Always generate the mosaic at the resolution the model was trained on (or scale the outputs accordingly). Check the code that creates mosaic\_full.png: does it resize images or compress them? Ideally, use the highest quality available and keep track of the final size. Then ensure the frontend knows that natural size (we pass it via the Visit object, width and height). The `naturalWidth`/`naturalHeight` are used in the scaling functions. If they are wrong, everything will be off.

* **Similarity results look off:** If the similar patients feature shows obviously non-similar cases (like a very different PAR score patient as “90% similar”), examine the normalization logic. We normalize by each component’s max score as defined in literature or dataset. If those max values are wrong, it skews similarity. For instance, if Overjet was actually scored up to 10 but we normalized by 6, then a value of 6 would be considered “100% of max” incorrectly. Double-check the max scores for each component in the code. Also, ensure we are comparing the *same stage* of treatment – the code uses initial visit by default, but if one patient’s initial vs another’s final are compared, that’s not meaningful. We intentionally only use initial vs initial (or whichever is designated). If you want to compare outcomes, you might compare final vs final or improvement vectors; that’s a different analysis though.

* **Large image uploads fail or are slow:** Some intraoral cameras produce very high-resolution images (like 12MP). Uploading 5 of those could be heavy. In development, the Express server might have a default body size limit (which could be around 1-2 MB). We increased it in our code (`app.use(express.json({ limit: '10mb' }))` and similarly for urlencoded). If you hit a limit, increase those. On the client, we might also scale down images before upload (not implemented, but could be done via Canvas to, say, 1920px max width). For now, ensure your images are reasonable size or bump the limits. The mosaic creation will also be memory intensive if images are huge – OpenCV/Pillow might struggle or be slow. Monitor memory usage; on low memory systems this could crash.

* **Misc UI quirks:** If something like the drag-and-drop isn’t working, check the console for errors. Could be a file path issue or a state not being reset properly. If the timeline doesn’t update after adding a visit, maybe we forgot to refresh – as a workaround, reload the page (the app should recover state and show it). Many of these small issues can be fixed with more time; for now, being aware of them helps in demos.

---

## 15) Limitations & Future Work

This project, being a 4-week prototype, has many limitations and avenues for improvement:

* **Model training and accuracy:** The models trained (YOLO, Faster R-CNN, and the custom) were on limited data (possibly even just sample or synthetic data to validate the pipeline). Their accuracy is not production-ready. In future, we’d train on a larger orthodontic image dataset with ground truth PAR scores. We’d also evaluate metrics like mean error on score and detection precision/recall per component. Fine-tuning the custom model’s architecture (different backbones, feature fusion methods) could yield better results.
* **Alternative detection models:** The landscape of object detection keeps evolving. We used YOLO (one-stage) and Faster R-CNN (two-stage) as representatives. Newer models like **Detectron2’s implementations, FCOS (fully convolutional one-stage), or Transformers (DETR)** could be tried. DETR, for example, might simplify the pipeline by predicting a set of boxes without NMS, but might need more data. Also, given the nature of orthodontic images, specialized models that handle **multiple view inputs** simultaneously could be explored (like a model that takes all 5 images as input in different channels or a 3D model if we had 3D scans).
* **Real-time performance:** In this prototype, inference is done synchronously when images are uploaded. For real use, you might push this to a background job so the user can do other things while it’s processing, then notify when done. Also, optimizing inference (using GPU, batching if multiple cases at once, or using smaller models) would be needed. YOLO can be real-time on a GPU, but Faster R-CNN is slower. Our custom model might be slower due to the added head, but if based on Faster R-CNN it’s similar in inference time (the global head is negligible overhead).
* **User interface improvements:** The editing of boxes could be made smarter – e.g., snapping boxes to tooth boundaries or suggesting likely score values. We could integrate a feature where clicking on a detection highlights the corresponding region in text (some coordinate linking). Also, more guidance in UI (like a tutorial overlay explaining what PAR is for new users) would be helpful.
* **Data management:** Currently, everything is in-memory. We’d move to a real database. An intermediate step could be writing JSON to disk so that data survives restarts (since our focus wasn’t DB, we skipped it). A SQL or NoSQL DB design would center on Patients, Visits, Components, with relations. We’d also add indices for queries (like find all patients with high initial PAR, etc.).
* **Multi-user and collaboration:** With auth in place, you might have multiple orthodontists using it. We’d add features like sharing a case with a colleague, or exporting data in standard formats (CSV of scores, etc.).
* **Bulk analysis mode:** The groundwork is laid for bulk processing, but implementing it fully would mean being able to queue up many patients (say after an import from a legacy system) and run analysis sequentially (to not overload memory). A UI for monitoring the queue, and perhaps prioritizing urgent cases, would be useful.
* **Outcome prediction:** We did similarity search by PAR vectors. A more advanced extension is to use machine learning to predict treatment outcomes (like how much improvement in PAR can be expected, or the likelihood of a case finishing with a PAR < 5, etc.). This would require data of completed cases and perhaps different treatment types as input. It’s an exciting area – essentially using past cases to forecast for a new case.
* **Integration with clinic workflow:** To be practical, the system should integrate with electronic health record systems or imaging software. For instance, automatically pulling the latest patient photos from a database, or pushing the PAR score into the patient’s record. Also, supporting other indices (maybe the Summers index or surgeon’s evaluations) for a comprehensive tool.
* **Cephalometric analysis:** Orthodontic assessments often include cephalometric (side-view x-ray) analysis. We could integrate a module that, given a lateral ceph image, computes certain angles or distances. Combining that with the PAR score could give a full picture of the case.
* **Calibration and continuous learning:** Over time, as clinicians override the AI’s suggestions, we can gather a dataset of “AI prediction vs final accepted”. This can be used to retrain or fine-tune the models so that they get closer to what the clinicians expect. Additionally, calibration curves (like Platt scaling for classification, or simply adjusting bias for regression) could align the AI’s scoring with a particular clinic’s scoring habits.

In summary, this prototype opens the door, but each of the above could be a project on its own. The encouraging result is that even with modest effort, we achieved an end-to-end system that demonstrates the concept. The next steps would involve deepening the AI’s accuracy and robustness, and hardening the software for real-world use.

---

## 16) How to Cite

If you use ideas or components from this project in your research or application, please cite it as:

> Yann Klees. **Orthodontic PAR‑AI: Automated PAR Index Assessment with Mosaic‑Based Detection and Clinical UI**. Luxembourg Institute of Science and Technology (Bioinformatics), 2025. *(Internship Project Report and Prototype)*.

*(Once a stable release or publication is available, replace with DOI or repository link.)*

This citation format is just a suggestion, since this is not a formally published paper. Adjust according to the context (e.g., as a software reference or internal report reference).

---

## 17) Licence & Acknowledgements

* **License:** This project’s code is open source under the MIT License. You are free to use, modify, and distribute it. (See LICENSE file for details.) Keep in mind, any medical application should be properly validated.
* **Built With:** We thank the developers of the tools that made this project possible – *React*, *Vite*, *Tailwind CSS*, *TanStack Query*, *Express.js*, *PyTorch*, *Ultralytics YOLO*, and others. Without these open-source libraries and frameworks, building such a prototype in a short time would be unthinkable.
* **Acknowledgements:** Thanks to **LIST (Luxembourg Institute of Science and Technology) Bioinformatics** department for the opportunity and resources to pursue this project. Special gratitude to my supervisor **Dr. Shekoufeh Gorgi Zadeh** for her guidance in both orthodontic domain knowledge and technical advice. I also thank **Prof. Jorge Gonçalves** for leadership and support during the internship. The project benefited from discussions with colleagues and the support of the entire team. Lastly, thanks to the creators of the PAR index (Richmond et al.) whose work laid the foundation that we build upon.

---

## 18) References

* Richmond, S., et al. *“The development of the PAR Index (Peer Assessment Rating): reliability and validity.”* **European Journal of Orthodontics**, 14(2):125‑139, 1992. – *(Original PAR index paper defining components and weights.)*
* British Orthodontic Society, *“Guidance on the use of the PAR Index.”* (Includes calibration instructions and examples).
* Redmon, J., Divvala, S., Girshick, R., Farhadi, A. *“You Only Look Once: Unified, Real‑Time Object Detection.”* **CVPR 2016**.  – *(Introduced the YOLO single-stage detector; real-time object detection by treating it as a regression problem.)*
* Ren, S., He, K., Girshick, R., Sun, J. *“Faster R‑CNN: Towards Real-Time Object Detection with Region Proposal Networks.”* **NeurIPS 2015**.  – *(Introduced two-stage detectors with integrated region proposal network, improving both speed and accuracy of R-CNN family.)*
* Çelik, B., et al. *“Root dilaceration using deep learning: a diagnostic approach.”* **Applied Sciences** 13(14): 8260, 2023. – *(Application of Faster R-CNN and other models on panoramic dental X-rays; reported \~93% precision for detecting root dilaceration, highlighting the accuracy of two-stage models in dental imaging.)*
* Bardideh, E., et al. *“Designing an artificial intelligence system for dental occlusion classification using intraoral photographs: A comparative analysis between AI-based and clinical diagnoses.”* **Am. J. Orthod. Dentofacial Orthop.**, 166(2):125-137, 2024. – *(Recent work on AI in orthodontics, comparing model vs human in classifying occlusions; provides insight into performance and acceptance of AI in clinical settings.)*
* (Summers Index reference) **The PAR versus the Summers Index.** Presentation at British Orthodontic Conference, 1990. – *(Historical context on how PAR improved upon or differed from the Summers index for case severity.)*
* Singh, N. *“K-Nearest Neighbors — A simple yet powerful algorithm.”* Analytics Vidhya, 2020. – *(Overview of k-NN algorithm in an accessible manner; justified our choice of k-NN for similarity as transparent and easy to implement.)
---

## 19) Appendix — Model Notes & Early Results

**Detection Models in this Project:** We experimented with three approaches for detecting and scoring PAR components:

* **Single‑stage detector (YOLO family):** A convolutional network that splits the image into a grid and directly predicts bounding boxes and class probabilities in one forward pass. YOLO v5/8 are examples. These models are fast and relatively easy to train with off-the-shelf implementations. They excel in speed (real-time inference) and simplicity but might struggle with very small objects or require more data to reach the accuracy of two-stage methods.
* **Two‑stage detector (Faster R-CNN family):** A model that first uses a Region Proposal Network to propose candidate regions, then a second stage processes each region to classify it and refine the box. Faster R-CNN is slower (since it processes many proposals per image, \~5 fps in the original paper on a GPU), but it often achieves higher accuracy, especially in cases of overlapping objects or when precise localization is critical. In our context, an example might be distinguishing very close teeth or subtle spacing, where a two-stage might perform better by focusing on one region at a time.
* **Custom two‑stage + regression (ours):** As described, we augmented a Faster R-CNN with a global regression head for the PAR score. This hybrid model aims to get the best of both worlds: the meticulous detection of a two-stage approach, and an overall awareness of case severity.

&#x20;*Illustration: A comparison of one-stage vs two-stage object detection outputs on a sample image. The image on the left shows predictions by a two-stage method (Faster R-CNN) with each car precisely localized (high confidence scores, fewer duplicates). The image on the right shows predictions by a one-stage method (YOLO), which finds many cars with high speed but includes some minor localization errors (note overlapping boxes or a misidentified potted plant). In our project, YOLO provided the easiest starting point (quick training and integration), while Faster R-CNN offered a accuracy-oriented approach. The custom model builds on Faster R-CNN to incorporate a global PAR score prediction, aiming for improved overall performance.*

**Why YOLO was the “easiest” to implement:** We found YOLOv8 to be very straightforward to integrate thanks to the Ultralytics library – with a few lines of code or a simple CLI command, we had a model training on our data. No need to manually code the network or proposal mechanism; just prepare annotations and go. The simplicity of a single-stage model means fewer moving parts when debugging. For a prototype, this is ideal to get something working. However, YOLO’s simplicity comes with the trade-off that we had to treat PAR components as regular object classes (e.g., “upper crowding present” vs not). It doesn’t naturally handle regression of a score value, so we would either classify each possible score or train multiple models (not efficient). We ended up using YOLO mainly to detect the presence of any issue in a region, and not directly the severity.

**Why Faster R-CNN and the custom model are pursued:** Accuracy and fine-grained output are crucial in a medical application. Missing a subtle issue or mis-scoring severity can impact treatment decisions. Two-stage detectors like Faster R-CNN have a track record of higher precision. Indeed, in a dental context, Çelik et al. 2023 showed that a Faster R-CNN approach could reach \~93% precision for detecting a specific pathology (root dilaceration), outperforming some single-stage counterparts. This gives confidence that a two-stage approach can achieve the reliability needed for clinical use. Our custom model is essentially a domain-specialized extension of Faster R-CNN – by teaching it to predict the overall PAR, we hope it learns more robust features. Early training logs indicated that the joint learning did help the classification loss drop faster (anecdotal observation), suggesting some synergy. We expect that with more training data, this model would outperform a plain Faster R-CNN that only learns to detect components independently.

**Early results:** Due to time constraints, our quantitative evaluation was limited. We performed a sanity check of the pipeline using a publicly available dataset (COCO128, which is a small subset of COCO) just to ensure the training and inference code ran end-to-end. That’s not related to PAR, but it confirmed our training scripts work (we got a reasonable precision/recall curve for generic objects). For PAR-specific data, we tested the system on a handful of cases from an open-source collection of orthodontic records. Qualitatively, the YOLO model detected obvious things like “overjet present” or “midline shift” but struggled to put a number to it. The Faster R-CNN (with a ResNet50 backbone) gave more stable detections and the predicted global score was in the right ballpark (within ±3 of the actual in our few examples). This is promising given the extremely small sample it saw.

**Figure: Training command examples** (for reference, how one might train the models discussed):

```bash
# YOLOv8 training via CLI (Ultralytics)
yolo train data=par_dataset.yaml model=yolov8n.pt epochs=100 imgsz=640 project=runs/train name=yolo_par

# Faster R-CNN training via a PyTorch script (assuming script exists)
python scripts/train_frcnn.py --data datasets/par --epochs 50 --batch-size 4 --lr 1e-3 --weights pretrained/frcnn_resnet50.pth

# Custom model training (Faster R-CNN + reg head, via our own training loop)
python scripts/train_par_custom.py --data datasets/par --epochs 50 --lr 1e-4 --out models/fasterrcnn_par_head.pth
```

These commands illustrate the process: for YOLO we leveraged a high-level API, whereas for the custom model we wrote a training loop (hence different script).

Finally, it’s worth noting that while the initial results are encouraging, a lot more experimentation is needed. Hyperparameters (learning rate, data augmentation, etc.) and model choice can significantly affect outcomes. Also, evaluating on a proper test set with real orthodontist-labeled scores is the only way to know if the system is truly viable. This prototype sets the stage for those future experiments by providing the integration and visualization pieces needed to quickly see how model improvements reflect in a user-friendly way.
