# Detecting malocclusion findings on public data: a follow-up to the LIST internship

*Yann Klees, November 2026*

> This report covers work done **after** the internship at LIST had ended. The clinical photos used during the internship could not be taken along under GDPR, so everything below was trained and tested on a public dataset (OMNI) that the internship never used. None of these numbers come from the internship data.

## Abstract

During a 4-week internship at LIST I built a prototype that suggests PAR index scores from five intraoral photos, using a Faster R-CNN with an extra global regression head. Because the internship data could not leave LIST, I rebuilt the system afterwards on the public OMNI dataset (4,166 photos, 10 classes of malocclusion findings and appliances). A YOLO11s detector, trained for 57 epochs on a free Kaggle T4 GPU, reaches mAP50 0.697 and mAP50-95 0.425 on OMNI's 828 test photos, measured with Ultralytics' validator. The best model reported in the OMNI paper reaches 0.664 and 0.383. In a controlled comparison scored with the same pycocotools code, YOLO11s (mAP50 0.653) beats a Faster R-CNN trained for 20 epochs (0.627). Adding the internship's global head to the Faster R-CNN lowers detection to 0.571, mostly on the rarest class. The head itself, trained on a stand-in target because OMNI has no PAR labels, does learn: mean absolute error 0.92 against a 1.62 baseline, Spearman correlation 0.68. The app therefore uses the YOLO detector and turns its findings into PAR suggestions that a clinician grades.

## 1. Introduction

The PAR (Peer Assessment Rating) index measures how far a patient's teeth are from normal occlusion. Orthodontists use it to judge treatment need and outcome. Scoring it by hand from photos is slow, so the internship goal was a tool that proposes PAR components automatically and lets a clinician correct them.

The internship prototype had two problems for a public portfolio:

1. It was trained on clinical photos of real patients, which cannot be published or reused outside LIST (GDPR).
2. Its PDF report and parts of the web app were unfinished.

This follow-up asks three questions:

- **Q1.** How well does a modern one-stage detector find malocclusion findings on a public dataset, compared with the published baselines?
- **Q2.** Is the internship's architecture, a Faster R-CNN with a jointly trained global head, a better choice than a plain detector?
- **Q3.** Can the detector's output drive useful PAR suggestions in the app without PAR labels?

## 2. Data

OMNI (Xue et al., 2025) contains intraoral photos with bounding boxes for 10 classes. I used the official split:

| Split | Photos | Boxes |
|---|---|---|
| Train | 2,481 | 33,970 |
| Validation | 857 | 11,624 |
| Test | 828 | 11,380 |

The classes are very unbalanced. Healthy teeth account for 65% of training boxes. Tooth misalignment, one of the three classes that feed the PAR suggestions, has only 44 training boxes and 35 test boxes:

| Class | Train boxes | Test boxes |
|---|---|---|
| healthy tooth | 22,052 | 7,270 |
| fixed device | 5,311 | 1,683 |
| invisible attachment | 1,654 | 781 |
| tooth torsion | 1,486 | 492 |
| orthodontic brace | 1,267 | 392 |
| mandibular retrusion | 846 | 309 |
| tooth emergence | 508 | 161 |
| deep overjet | 480 | 176 |
| cast fixed appliance | 322 | 81 |
| tooth misalignment | 44 | 35 |

OMNI has no PAR scores, so no model here is trained to predict PAR directly. The OMNI images are not redistributed in this repository. `ml/prepare_omni.py` converts the downloaded COCO files to YOLO format.

## 3. Methodology

### 3.1 YOLO11s detector

- **Model:** YOLO11s (Ultralytics 8.3.163), starting from COCO-pretrained weights.
- **Training:** up to 60 epochs at 512 px, batch 32. Ultralytics picked AdamW (learning rate 0.000714). Training stopped early after 15 epochs without improvement on the validation set.
- **Augmentation:** Ultralytics defaults (mosaic, colour and scale changes), with horizontal flips turned off: a flipped left-side photo would look like a right-side one.
- **Model selection:** the best epoch was picked on the validation split. The test split was used once, at the end.
- **Hardware:** a free Kaggle T4 GPU. Kaggle had no internet access, so Ultralytics was installed from an uploaded wheels dataset.
- **Script:** `ml/kaggle/train_kaggle.py`. `ml/train.py` runs the same training locally.

### 3.2 Faster R-CNN, with and without the internship head

`ml/kaggle_rcnn/train_rcnn_par.py` re-implements the internship design:

- **Plain detector:** a Faster R-CNN (ResNet-50 FPN, COCO-pretrained, new 11-way box predictor).
- **With head:** the same detector plus global average pooling over the first FPN level and a linear layer. The head is trained jointly with the detector using a mean-squared-error loss.

The head needs a per-photo target. The internship used the PAR score, which OMNI lacks. As a stand-in, the head predicts the number of malocclusion findings in a photo: tooth torsion, deep overjet, tooth misalignment and mandibular retrusion. On the training set this count has mean 1.44 and standard deviation 2.12, and it is standardised for training.

Two bugs in the original internship code were fixed:

- The original constructor call failed when combining pretrained weights with a custom class count.
- The head ran the backbone a second time, on un-normalised images.

Both R-CNN models were trained for 20 epochs: SGD, learning rate 0.01 with warm-up and two decays, batch 8, mixed precision, no flips. In the first run the head model diverged (NaN losses) because the pooled features overflowed in fp16. The reported head model comes from a rerun that computes the head in fp32 and clips gradients at norm 10; the plain Faster R-CNN comes from the first run, without clipping.

### 3.3 Evaluation

All detectors were scored with pycocotools on the 828 test photos: AP at IoU 0.50 and 0.50:0.95, up to 300 detections per photo (OMNI photos carry up to about 50 boxes). YOLO predictions for this comparison used confidence 0.001. Ultralytics' own validator gives slightly higher numbers for the same YOLO weights (Section 4.1), so only the pycocotools numbers are compared across models.

The head was scored by mean absolute error (MAE) and Spearman rank correlation on the test photos. Its baseline always predicts the training mean.

### 3.4 From findings to PAR suggestions

The app runs the detector on each of the five views at confidence 0.3 and maps findings to PAR components (`backend/utils/aiAnalysis.js`):

- Deep overjet becomes **Overjet**. Only the most confident detection is kept, since overjet is one measurement per patient.
- Tooth torsion and tooth misalignment become **Upper** or **Lower Crowding**, with the arch taken from the view.
  - The occlusal view of an arch is preferred when it has detections, so one tooth is not counted twice.
  - Overlapping boxes (IoU > 0.5) are merged.
- Each suggestion starts at score 1 and is marked unreviewed. The clinician moves, re-grades or deletes it.

## 4. Results

### 4.1 YOLO11s against the OMNI paper

Training ran for 57 epochs (33 minutes on the T4). The best validation epoch was 42 (validation mAP50 0.685). Test results from Ultralytics' validator:

| Model | mAP50 | mAP50-95 |
|---|---|---|
| YOLO11s (this work) | **0.697** | **0.425** |
| Deformable DETR, best in the OMNI paper | 0.664 | 0.383 |

Test precision was 0.700 and recall 0.693. The paper used its own evaluation code, so the gap is indicative rather than exact.

### 4.2 Same-code comparison

| Model | mAP50 | mAP50-95 |
|---|---|---|
| YOLO11s | **0.653** | **0.390** |
| Faster R-CNN | 0.627 | 0.348 |
| Faster R-CNN + global head | 0.571 | 0.318 |

Per-class AP50, same evaluation:

| Class | YOLO11s | Faster R-CNN | R-CNN + head |
|---|---|---|---|
| healthy tooth | 0.872 | 0.854 | 0.871 |
| tooth torsion | 0.441 | 0.374 | 0.310 |
| deep overjet | 0.421 | 0.431 | 0.403 |
| invisible attachment | 0.616 | 0.535 | 0.488 |
| tooth emergence | 0.312 | 0.259 | 0.265 |
| cast fixed appliance | 0.846 | 0.826 | 0.747 |
| tooth misalignment | 0.366 | 0.487 | 0.057 |
| mandibular retrusion | 0.906 | 0.911 | 0.891 |
| orthodontic brace | 0.841 | 0.715 | 0.760 |
| fixed device | 0.909 | 0.882 | 0.920 |

### 4.3 The global head

| | MAE | Spearman |
|---|---|---|
| Head (stand-in target: findings per photo) | 0.92 | 0.68 |
| Always predict the training mean | 1.62 | – |

## 5. Discussion

**Q1.** YOLO11s matches or beats the strongest published OMNI baseline while being small enough to run on a CPU inside the app. Its weak spots are the classes that matter most for PAR: tooth torsion, deep overjet and tooth misalignment all score between 0.46 and 0.52 mAP50 (Ultralytics), against 0.89 for healthy teeth. These classes are rare and their boxes are small, so the PAR suggestions will miss findings and the clinician review step is required, not optional.

**Q2.** The plain Faster R-CNN is close to YOLO overall (0.627 against 0.653) and better on tooth misalignment (0.49 against 0.37). With 35 test boxes, though, that class is too small to rank the models on. Adding the global head costs 0.056 mAP50 overall. Almost all of the drop is tooth misalignment, which falls to 0.06: with 44 training boxes, the extra loss term seems to pull the shared backbone away from the rarest class. At the end of training the head model's classification loss was also higher than the plain model's (0.21 against 0.06), so it had not fitted the detection task as well in the same 20 epochs. One seed per model means the differences of a few points between models are not certain.

The head itself learns its target well (Spearman 0.68). This supports the internship idea that a global head can read a per-photo severity signal from the backbone. On OMNI, however, that signal is a count of findings, which the detector already provides directly, and the head makes detection worse. Whether a real PAR target would justify the head can only be tested with PAR-labelled data.

**Q3.** The mapping from findings to PAR components is a hand-written rule, not a learned model. It covers Overjet and Crowding only. Other PAR components, such as buccal occlusion, overbite and centreline, have no matching OMNI class and stay fully manual. Every suggestion starts at the lowest non-zero grade because the detector says that a finding is present, not how severe it is.

**Limitations.**

- No PAR labels: the system was never evaluated against clinician PAR scores.
- OMNI photos come from a different population and camera setup than the LIST photos, so these numbers may not carry over to that clinic.
- Each model was trained once with one seed, and the R-CNN models for only 20 epochs.
- The OMNI dataset has no stated licence. The released weights are for research use only.
- This is a research prototype, not a medical device.

## 6. Conclusion

Rebuilt on public data, the system works end to end. A YOLO11s detector beats the published OMNI baselines and a Faster R-CNN of the internship's type. Its findings feed editable PAR suggestions in the app, and the clinician grades the final score. The internship's global head learns a per-photo severity signal but lowers detection quality, so it is not used in the app. The most useful next step would be a dataset with PAR scores, which would allow training and evaluating PAR grading directly instead of through a hand-written mapping.

## References

- Richmond, S., Shaw, W. C., et al. (1992). The development of the PAR Index (Peer Assessment Rating): reliability and validity. *European Journal of Orthodontics*, 14(2), 125–139.
- Xue et al. (2025). Oral Imaging for Malocclusion Issues Assessments: OMNI Dataset, Deep Learning Baselines and Benchmarking. arXiv:2505.15637.
- Jocher, G., Qiu, J. (2024). Ultralytics YOLO11. https://github.com/ultralytics/ultralytics
- Ren, S., He, K., Girshick, R., Sun, J. (2015). Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks. *NeurIPS*.

## Files behind the numbers

| File | Contents |
|---|---|
| `ml/results/test_metrics.json` | YOLO11s test metrics (Ultralytics validator) |
| `ml/results/yolo11s_training_log.csv` | YOLO11s per-epoch losses and validation metrics |
| `ml/results/rcnn_comparison_run1.json` | Same-code comparison: YOLO11s and Faster R-CNN (the head model diverged in this run) |
| `ml/results/rcnn_with_head_run2.json` | Faster R-CNN + head, fp32 rerun |
| `ml/kaggle/`, `ml/kaggle_rcnn/` | The Kaggle training scripts |
