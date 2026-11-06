// Run with: npm test   (Node's built-in test runner, no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";

import { toSuggestions } from "../utils/aiAnalysis.js";
import { toMosaic, cellOrigin, CELL_W, CELL_H } from "../utils/mosaic.js";
import { calcPAR, urgencyFromPAR } from "../utils/par.js";
import { improvement } from "../routes/reports.js";

const view = (detections) => ({ width: 512, height: 341, detections });
const det = (label, confidence, box) => ({ label, confidence, box });

test("view cells follow the mosaic layout", () => {
  assert.deepEqual(cellOrigin("right"),  { x: 0,          y: 0 });
  assert.deepEqual(cellOrigin("left"),   { x: 2 * CELL_W, y: 0 });
  assert.deepEqual(cellOrigin("down"),   { x: CELL_W,     y: CELL_H });
});

test("boxes are scaled and letterboxed into their cell", () => {
  // 512x341 scales by min(2048/512, 1200/341) = 3.519 and is centred horizontally
  const c = toMosaic("up", [10, 10, 60, 60], 512, 341);
  assert.deepEqual(c, { x: 158, y: 1235, width: 176, height: 176 });
});

test("detections become PAR suggestions at the lowest grade", () => {
  const { boxes } = toSuggestions({ views: {
    up:   view([det("tooth_torsion", 0.9, [10, 10, 60, 60])]),
    left: view([det("deep_overjet", 0.7, [100, 150, 300, 250])]),
  } });
  assert.deepEqual(boxes.map(b => [b.component, b.score, b.source, b.reviewed]),
                   [["Upper Crowding", 1, "ai", false], ["Overjet", 1, "ai", false]]);
});

test("the same tooth found by two classes gives one box", () => {
  const { boxes } = toSuggestions({ views: { up: view([
    det("tooth_torsion", 0.9, [10, 10, 60, 60]),
    det("tooth_misalignment", 0.7, [12, 12, 62, 62]),
  ]) } });
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].confidence, 90);
});

test("occlusal views win over frontal views for the same arch", () => {
  const { boxes } = toSuggestions({ views: {
    up:     view([det("tooth_torsion", 0.6, [10, 10, 60, 60])]),
    center: view([det("tooth_torsion", 0.9, [10, 10, 50, 50])]),   // upper half -> upper arch
  } });
  assert.deepEqual(boxes.map(b => b.viewId), ["up"]);
});

test("frontal detections are used when the occlusal view has none", () => {
  const { boxes } = toSuggestions({ views: {
    center: view([det("tooth_misalignment", 0.8, [10, 250, 50, 300])]),  // lower half
  } });
  assert.deepEqual(boxes.map(b => b.component), ["Lower Crowding"]);
});

test("only the most confident overjet is kept", () => {
  const { boxes } = toSuggestions({ views: {
    center: view([det("deep_overjet", 0.5, [0, 0, 10, 10])]),
    right:  view([det("deep_overjet", 0.8, [0, 0, 10, 10])]),
  } });
  assert.deepEqual(boxes.map(b => [b.component, b.viewId]), [["Overjet", "right"]]);
});

test("appliances are reported as findings, not scored", () => {
  const r = toSuggestions({ views: { center: view([det("orthodontic_brace", 0.9, [0, 0, 10, 10])]) } });
  assert.equal(r.boxes.length, 0);
  assert.equal(r.applianceDetected, true);
});

test("PAR uses the UK weights", () => {
  assert.equal(calcPAR([{ component: "Overjet", score: 2 }, { component: "Upper Crowding", score: 3 },
                        { component: "Centerline", score: 1 }]), 2 * 6 + 3 + 4);
  assert.equal(urgencyFromPAR(9), "low");
  assert.equal(urgencyFromPAR(25), "high");
});

test("improvement categories follow Richmond et al. 1992", () => {
  assert.equal(improvement(40, 10).category, "Greatly improved");   // -30 points, -75%
  assert.equal(improvement(20, 12).category, "Improved");           // -40%
  assert.equal(improvement(20, 16).category, "Worse / no different");
  assert.equal(improvement(0, 0).category, "No baseline score");
});
