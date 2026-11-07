# Orthodontic PAR

A web app that turns five intraoral photos into a mosaic, detects malocclusion findings with a YOLO11 model, and proposes PAR index boxes for a clinician to grade. It tracks the PAR score across visits and exports a PDF report with the annotated mosaic, the PAR breakdown and the change since the first visit.

Built during a 4-week internship at LIST (Luxembourg Institute of Science and Technology), then rebuilt on public data: the clinical photos from the internship could not be used under GDPR, so the detector is trained on the public [OMNI dataset](https://github.com/RoundFaceJ/OMNI) instead.

## Result

YOLO11s trained on a Kaggle T4 GPU (57 epochs, early stopping, best at epoch 42) on OMNI's 2,481 training photos. On the 828 held-out test photos:

| | mAP50 | mAP50-95 |
|---|---|---|
| This model (YOLO11s) | **0.697** | **0.425** |
| Best model in the OMNI paper (Deformable DETR) | 0.664 | 0.383 |

The paper's numbers come from its own evaluation code, so the comparison is close but not exact. Per-class scores are in `ml/results/test_metrics.json`. The classes that feed the PAR suggestions are the hardest: tooth torsion 0.46, tooth misalignment 0.51 and deep overjet 0.52 mAP50, against 0.89 for healthy teeth.

**YOLO vs Faster R-CNN.** The internship prototype used a Faster R-CNN with an extra global head. Scored with the same pycocotools code on the same test photos (`ml/kaggle_rcnn/`, `ml/results/rcnn_comparison_run1.json`), YOLO11s reaches mAP50 0.653 and a Faster R-CNN (ResNet-50 FPN, 20 epochs) 0.627, so the app uses YOLO. The variant with the extra head diverged in its first run and is being retrained.

## How the automation works

1. Upload the five views (upper and lower occlusal, left, right, frontal). The backend builds a 3x2 mosaic.
2. `ml/infer.py` runs the detector on each view; boxes are mapped into mosaic coordinates.
3. Findings become PAR suggestions: deep overjet becomes Overjet, tooth torsion and misalignment become Upper/Lower Crowding (arch taken from the view). Each suggestion starts at score 1 and is marked unreviewed.
4. The clinician moves, resizes, re-grades or deletes boxes. The PAR total (UK weights, Richmond et al. 1992) updates on every change.

The model detects findings, not PAR grades: OMNI has no PAR labels, so grading stays with the clinician. This is a research prototype, not a medical device.

## Stack

Python, PyTorch, Ultralytics YOLO11 · Node.js, Express, sharp, PDFKit · React, TypeScript, Vite, Tailwind · cosine k-NN for similar patients

## Run it

Requirements: Node.js 22.18 or newer, Python 3.10+.

```
npm install
cd frontend && npm install && npm run build && cd ..
pip install -r requirements.txt
npm start                         # http://localhost:8000
```

For development, run `npm run api` and `npm run dev` (frontend on http://localhost:8080). Tests: `npm test`.

For the AI suggestions, download `omni_yolo11.pt` from the [latest release](https://github.com/YannKleees/orthodontic-par/releases/latest) into `models/`. Without it the app still works; uploads just get no AI suggestions. To train the model yourself:

```
# download OMNI_COCO.zip from https://github.com/RoundFaceJ/OMNI and unzip it
python ml/prepare_omni.py --src path/to/omni_coco --out datasets/omni_yolo
python ml/train.py --data datasets/omni_yolo/data.yaml --model yolo11s.pt --epochs 60
```

On a CPU this takes many hours. `ml/kaggle/` runs the same training on a free Kaggle GPU in about 35 minutes (upload `datasets/omni_yolo` as a private dataset first).

The weights land in `models/omni_yolo11.pt`. Patient data is stored as JSON and images under `data/` (set `DATA_DIR` to move it).

## Data

No patient data is included in this repository. The OMNI images are not redistributed here; the released weights are for research use. Cite Xue et al., "Oral Imaging for Malocclusion Issues Assessments: OMNI Dataset, Deep Learning Baselines and Benchmarking", arXiv:2505.15637 (2025).
