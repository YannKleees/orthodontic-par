#!/usr/bin/env ts-node --esm
/**
 * K-Nearest Neighbors Analysis Pipeline for Orthodontic Patient Data
 * 
 * This module implements a comprehensive analysis workflow for patient similarity assessment
 * using k-NN clustering and dimensional reduction techniques. The pipeline includes:
 * 
 * 1. Data Preprocessing: Vector representation of patient clinical parameters
 * 2. Similarity Analysis: k-NN algorithm implementation (k=3 default)
 * 3. Dimensionality Reduction: Principal Component Analysis (PCA)
 * 4. Validation: Elbow curve analysis for optimal k selection
 * 5. Visualization: Interactive scatter plot of patient clusters
 * 
 * Dependencies:
 * - mathjs: Mathematical operations
 * - ml-pca: Principal Component Analysis implementation
 * - csv-writer: Data export functionality
 * - plotly.js: Interactive visualization
 */
import fs   from "fs/promises";
import path from "path";
import { rebuildVectorCache, loadVectorCache } from "./vector-cache.ts";
import { knn }                                 from "./similarity.ts";

/* --- CJS → ESM safe imports ------------------------------------ */
import _PCA from "ml-pca";
import * as PCAmod from "ml-pca";
const PCA: any =
  (typeof (PCAmod as any).default === "function" && (PCAmod as any).default) ||
  (typeof (PCAmod as any).PCA     === "function" && (PCAmod as any).PCA)     ||
  PCAmod; 
/* If you imported csv‑writer like this you’re fine:                */
import { createObjectCsvWriter as csvWriter } from "csv-writer";
/* ---------------------------------------------------------------- */


/* ------------------------------------------------------------------ */
/* config / paths                                                      */
/* ------------------------------------------------------------------ */
const ROOT   = process.cwd();
const DATA   = path.join(ROOT, "data");
const SAMPLE = path.join(ROOT, "src/data/sample-patients.json");
const ELBOW  = path.join(DATA, "elbow.csv");
const VECT   = path.join(DATA, "vectors.csv");
const HTML   = path.join(DATA, "knn-demo.html");
const TARGET = "PAT-00001";
const K      = 3;                     // neighbours to highlight
/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
async function writeElbow(cache: Awaited<ReturnType<typeof loadVectorCache>>) {
  const rows: string[] = ["k,avg_distance"];

  for (let k = 1; k <= 15; k++) {
    const ds: number[] = [];
    for (const p of cache) {
      const n = await knn(p.id, k);
      ds.push(n.reduce((s, m) => s + m.distance, 0) / k);
    }
    const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
    rows.push(`${k},${avg.toFixed(4)}`);
  }
  await fs.writeFile(ELBOW, rows.join("\n"));
}

async function writeVectorsCSV(
  cache: Awaited<ReturnType<typeof loadVectorCache>>,
  coords: number[][]
) {
  const writer = csvWriter({
    path       : VECT,
    header     : [
      { id: "id",     title: "id" },
      { id: "name",   title: "name" },
      { id: "x",      title: "x" },
      { id: "y",      title: "y" },
    ],
  });

  await writer.writeRecords(
    cache.map((r, i) => ({
      id  : r.id,
      name: r.meta.name,
      x   : coords[i][0].toFixed(4),
      y   : coords[i][1].toFixed(4),
    }))
  );
}

async function writePlotHTML(
  cache : Awaited<ReturnType<typeof loadVectorCache>>,
  coords: number[][],
  nbrIds: Set<string>
) {
  /* inline minified plotly to keep the file standalone */
  const plotlyJs = await fs.readFile(
    path.join(ROOT, "node_modules/plotly.js-dist-min/plotly.min.js"),
    "utf8"
  );

  const points = cache.map((r, i) => ({
    id   : r.id,
    name : r.meta.name,
    x    : coords[i][0],
    y    : coords[i][1],
    color: r.id === TARGET ? "red" : nbrIds.has(r.id) ? "orange" : "#1f77b4",
    size : r.id === TARGET ? 16 : nbrIds.has(r.id) ? 12 : 8,
  }));

  const html = /* html */ `
<!DOCTYPE html><html><head><meta charset="utf-8"><title>K‑NN demo</title>
<style>
 body{font-family:system-ui;margin:0;padding:0}
 #plot{width:100vw;height:100vh}
</style>
</head><body>
<div id="plot"></div>
<script>${plotlyJs}</script>
<script>
const pts = ${JSON.stringify(points)};
const data = [{
  x        : pts.map(p=>p.x),
  y        : pts.map(p=>p.y),
  text     : pts.map(p=>p.name + " ("+p.id+")"),
  mode     : "markers",
  type     : "scatter",
  marker   : {
    color : pts.map(p=>p.color),
    size  : pts.map(p=>p.size),
    opacity: 0.85,
    line  : { width: 1, color: "#444" }
  },
  hovertemplate: "%{text}<extra></extra>"
}];

Plotly.newPlot("plot", data, {
  title: "PCA of patient vectors  –  red = target, orange = " + ${K} + " neighbours",
  xaxis:{title:"PC1"}, yaxis:{title:"PC2"}
});
</script></body></html>`;
  await fs.writeFile(HTML, html);
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
async function main() {
  await fs.mkdir(DATA, { recursive: true });

  /* 1. Load sample */
  const patients = JSON.parse(await fs.readFile(SAMPLE, "utf8"));

  /* 2. Vector cache */
  console.log("👉  rebuilding vector cache …");
  await rebuildVectorCache(patients);
  console.log("✅  vector-cache.json written\n");

  /* 3. Quick sanity check */
  console.log(`👉  ${K}-NN for ${TARGET} …`);
  const nbrs = await knn(TARGET, K);
  console.table(nbrs);

  /* 4. Elbow curve */
  const cache = await loadVectorCache();
  await writeElbow(cache);
  console.log(`📄  elbow.csv written to ${path.relative(ROOT, ELBOW)}`);

  /* 5. PCA → vectors.csv */
  const mat = cache.map(r => r.vec);
  const pca = new PCA(mat, { center: true, scale: true });
  const coords = pca.predict(mat, { nComponents: 2 }).to2DArray();
  await writeVectorsCSV(cache, coords);
  console.log(`📄  vectors.csv written to ${path.relative(ROOT, VECT)}`);

  /* 6. Interactive HTML plot */
  const nbrSet = new Set<string>(nbrs.map(n => n.id));
  await writePlotHTML(cache, coords, nbrSet);
  console.log(`🌐  Open ${path.relative(ROOT, HTML)} in a browser to view the plot\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
