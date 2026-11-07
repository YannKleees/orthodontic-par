"""Faster R-CNN vs Faster R-CNN with the extra global head (internship design) vs YOLO11s.

The internship model (src/yrcnn/models/rcnn_par.py, in this repo's history) adds a
global-average-pool + linear head to a Faster R-CNN and trains it jointly with an
MSE loss on the PAR score. OMNI has no PAR labels, so the head is trained on a
stand-in target instead: the number of malocclusion findings in the photo
(tooth torsion, deep overjet, tooth misalignment, mandibular retrusion).

Fixes against the original code:
  * pretrained COCO weights + a new 11-class box predictor (the original call
    fasterrcnn_resnet50_fpn(weights="DEFAULT", num_classes=11) raises an error);
  * the head reads the detector's own backbone output via a forward hook instead of
    running the backbone a second time on un-normalised, un-resized images.

All three models are scored with the same pycocotools code on OMNI's 828 test photos.
Outputs in /kaggle/working: comparison.json, rcnn.pt, rcnn_par.pt.
"""
import glob, json, math, subprocess, sys, time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torchvision
import torchvision.transforms.functional as TF
from PIL import Image
from torchvision.models.detection import fasterrcnn_resnet50_fpn, FasterRCNN_ResNet50_FPN_Weights
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor

import os
SMOKE = os.environ.get("SMOKE") == "1"          # local check: few photos, CPU, no YOLO
print("CUDA:", torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else "", flush=True)
if not torch.cuda.is_available() and not SMOKE:
    sys.exit("No GPU attached; stopping.")
DEV = "cuda" if torch.cuda.is_available() else "cpu"
torch.manual_seed(0); np.random.seed(0)

try:
    from pycocotools.coco import COCO
    from pycocotools.cocoeval import COCOeval
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pycocotools"], check=True)
    from pycocotools.coco import COCO
    from pycocotools.cocoeval import COCOeval

WORK = Path(os.environ.get("WORK", "/kaggle/working"))
SRC = Path(os.environ["OMNI_DIR"]) if "OMNI_DIR" in os.environ else       Path(glob.glob("/kaggle/input/**/images/train", recursive=True)[0]).parent.parent
NAMES = ["healthy_tooth", "tooth_torsion", "deep_overjet", "invisible_attachment", "tooth_emergence",
         "cast_fixed_appliance", "tooth_misalignment", "mandibular_retrusion", "orthodontic_brace", "fixed_device"]
FINDINGS = {1, 2, 6, 7}           # YOLO class ids that count towards the stand-in severity target
EPOCHS, BATCH, LR = (1, 2, 0.005) if SMOKE else (20, 8, 0.01)


# ------------------------------------------------------------------ data
def read_labels(split, stem, w, h):
    f = SRC / "labels" / split / f"{stem}.txt"
    boxes, labels = [], []
    if f.exists():
        for line in f.read_text().splitlines():
            if not line.strip():
                continue
            c, cx, cy, bw, bh = map(float, line.split())
            boxes.append([(cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h])
            labels.append(int(c) + 1)                     # 0 is background in torchvision
    return boxes, labels


class Omni(torch.utils.data.Dataset):
    def __init__(self, split):
        self.split, self.files = split, sorted((SRC / "images" / split).glob("*.jpg"))
        if SMOKE:
            self.files = self.files[:6]

    def __len__(self):
        return len(self.files)

    def __getitem__(self, i):
        p = self.files[i]
        img = Image.open(p).convert("RGB")
        w, h = img.size
        boxes, labels = read_labels(self.split, p.stem, w, h)
        target = {
            "boxes": torch.tensor(boxes, dtype=torch.float32).reshape(-1, 4),
            "labels": torch.tensor(labels, dtype=torch.int64),
            "severity": torch.tensor(float(sum(1 for l in labels if l - 1 in FINDINGS))),
        }
        return TF.to_tensor(img), target, i            # no flips: left and right views differ


def collate(batch):
    return tuple(zip(*batch))


def coco_gt(ds):
    images, anns = [], []
    for i, p in enumerate(ds.files):
        w, h = Image.open(p).size
        images.append({"id": i, "width": w, "height": h, "file_name": p.name})
        boxes, labels = read_labels(ds.split, p.stem, w, h)
        for (x1, y1, x2, y2), c in zip(boxes, labels):
            anns.append({"id": len(anns) + 1, "image_id": i, "category_id": c, "iscrowd": 0,
                         "bbox": [x1, y1, x2 - x1, y2 - y1], "area": (x2 - x1) * (y2 - y1)})
    gt = COCO()
    gt.dataset = {"images": images, "annotations": anns,
                  "categories": [{"id": k + 1, "name": n} for k, n in enumerate(NAMES)]}
    gt.createIndex()
    return gt


def coco_score(gt, dets):
    """dets: list of {image_id, category_id, bbox[xywh], score}. Returns mAP50, mAP50-95, per-class AP50."""
    if not dets:
        return {"mAP50": 0.0, "mAP50_95": 0.0, "per_class_AP50": {}}
    ev = COCOeval(gt, gt.loadRes(dets), "bbox")
    ev.params.maxDets = [1, 10, 300]                  # OMNI photos carry up to ~50 boxes
    ev.evaluate(); ev.accumulate(); ev.summarize()
    prec = ev.eval["precision"][0, :, :, 0, -1]        # IoU=0.5, all recall, class, area=all, maxDets=300
    per = {}
    for k, name in enumerate(NAMES):
        p = prec[:, k]
        per[name] = round(float(p[p > -1].mean()), 4) if (p > -1).any() else None
    ap50_all = prec[prec > -1].mean()
    ap_all = ev.eval["precision"][:, :, :, 0, -1]
    return {"mAP50": round(float(ap50_all), 4), "mAP50_95": round(float(ap_all[ap_all > -1].mean()), 4),
            "per_class_AP50": per}


# ------------------------------------------------------------------ models
def detector():
    m = fasterrcnn_resnet50_fpn(weights=FasterRCNN_ResNet50_FPN_Weights.DEFAULT, min_size=512, max_size=768)
    m.roi_heads.box_predictor = FastRCNNPredictor(m.roi_heads.box_predictor.cls_score.in_features, len(NAMES) + 1)
    m.roi_heads.detections_per_img = 300
    return m


class RCNNWithHead(nn.Module):
    """Faster R-CNN + global-average-pool + linear head on the first FPN level (as in rcnn_par.py)."""

    def __init__(self, mean, std):
        super().__init__()
        self.detector = detector()
        self.gap = nn.AdaptiveAvgPool2d(1)
        self.head = nn.Linear(self.detector.backbone.out_channels, 1)
        self.mean, self.std = mean, std
        self._feats = None
        self.detector.backbone.register_forward_hook(lambda _m, _i, out: setattr(self, "_feats", out))

    def _severity(self):
        return self.head(self.gap(self._feats["0"]).flatten(1)).squeeze(1)

    def forward(self, images, targets=None):
        if self.training:
            losses = self.detector(images, targets)
            gt = (torch.stack([t["severity"] for t in targets]) - self.mean) / self.std
            losses["loss_severity"] = nn.functional.mse_loss(self._severity(), gt)
            return losses
        dets = self.detector(images)
        return dets, self._severity() * self.std + self.mean


# ------------------------------------------------------------------ train / eval
def train(model, loader, name):
    model.to(DEV).train()
    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.SGD(params, lr=LR, momentum=0.9, weight_decay=1e-4)
    steps = EPOCHS * len(loader)
    warm = 500
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: min(1.0, (s + 1) / warm) * (0.1 if s > 0.7 * steps else 1.0) * (0.1 if s > 0.9 * steps else 1.0))
    scaler = torch.amp.GradScaler("cuda", enabled=DEV == "cuda")
    t0 = time.time()
    for ep in range(1, EPOCHS + 1):
        tot, parts = 0.0, {}
        for imgs, tgts, _ in loader:
            imgs = [i.to(DEV) for i in imgs]
            tgts = [{k: v.to(DEV) for k, v in t.items()} for t in tgts]
            with torch.autocast(DEV, dtype=torch.float16, enabled=DEV == "cuda"):
                losses = model(imgs, tgts)
                loss = sum(losses.values())
            opt.zero_grad()
            scaler.scale(loss).backward()
            scaler.step(opt); scaler.update(); sched.step()
            tot += loss.item()
            for k, v in losses.items():
                parts[k] = parts.get(k, 0) + v.item()
        n = len(loader)
        print(f"[{name}] epoch {ep}/{EPOCHS} loss {tot / n:.3f} "
              + " ".join(f"{k}={v / n:.3f}" for k, v in parts.items()) + f"  ({(time.time() - t0) / 60:.1f} min)", flush=True)
    return model


@torch.no_grad()
def predict_rcnn(model, ds, with_head):
    model.to(DEV).eval()
    det_model = model.detector if with_head else model
    det_model.roi_heads.score_thresh = 0.001
    loader = torch.utils.data.DataLoader(ds, batch_size=8, collate_fn=collate, num_workers=0 if SMOKE else 4)
    dets, sev_pred, sev_true = [], [], []
    for imgs, tgts, ids in loader:
        imgs = [i.to(DEV) for i in imgs]
        out = model(imgs)
        if with_head:
            out, sev = out
            sev_pred += sev.float().cpu().tolist()
            sev_true += [float(t["severity"]) for t in tgts]
        for o, i in zip(out, ids):
            for b, s, c in zip(o["boxes"].cpu().tolist(), o["scores"].cpu().tolist(), o["labels"].cpu().tolist()):
                dets.append({"image_id": i, "category_id": c, "bbox": [b[0], b[1], b[2] - b[0], b[3] - b[1]], "score": s})
    return dets, sev_pred, sev_true


def predict_yolo(ds):
    try:
        from ultralytics import YOLO
    except ImportError:
        kit = glob.glob("/kaggle/input/**/ultralytics-8.3.163-py3-none-any.whl", recursive=True)
        if kit:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--no-deps", "--no-index",
                            *glob.glob(str(Path(kit[0]).parent / "*.whl"))], check=True)
        else:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "ultralytics==8.3.163"], check=True)
        from ultralytics import YOLO
    weights = glob.glob("/kaggle/input/**/omni_yolo11.pt", recursive=True)
    if not weights:
        print("YOLO weights not mounted; skipping YOLO", flush=True)
        return None
    model = YOLO(weights[0])
    dets = []
    for i, p in enumerate(ds.files):
        r = model.predict(str(p), conf=0.001, iou=0.7, max_det=300, imgsz=512, device=0, verbose=False)[0]  # noqa
        for b, s, c in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist()):
            dets.append({"image_id": i, "category_id": int(c) + 1, "bbox": [b[0], b[1], b[2] - b[0], b[3] - b[1]], "score": s})
    return dets


def main():
    train_ds, test_ds = Omni("train"), Omni("test")
    loader = torch.utils.data.DataLoader(train_ds, batch_size=BATCH, shuffle=True, collate_fn=collate,
                                         num_workers=0 if SMOKE else 4, drop_last=True)
    sev = np.array([float(sum(1 for l in read_labels("train", p.stem, *Image.open(p).size)[1] if l - 1 in FINDINGS))
                    for p in train_ds.files])
    mean, std = float(sev.mean()), float(sev.std() or 1.0)
    print(f"stand-in severity on train: mean {mean:.2f}, std {std:.2f}", flush=True)

    gt = coco_gt(test_ds)
    results = {"test_images": len(test_ds), "epochs": EPOCHS, "evaluation": "pycocotools, IoU 0.50 and 0.50:0.95, maxDets 300"}

    yolo_dets = None if SMOKE else predict_yolo(test_ds)
    if yolo_dets is not None:
        results["yolo11s"] = coco_score(gt, yolo_dets)
        print("YOLO11s:", results["yolo11s"]["mAP50"], results["yolo11s"]["mAP50_95"], flush=True)

    rcnn = train(detector(), loader, "rcnn")
    torch.save(rcnn.state_dict(), WORK / "rcnn.pt")
    dets, _, _ = predict_rcnn(rcnn, test_ds, with_head=False)
    results["faster_rcnn"] = coco_score(gt, dets)
    print("Faster R-CNN:", results["faster_rcnn"]["mAP50"], results["faster_rcnn"]["mAP50_95"], flush=True)
    del rcnn; torch.cuda.empty_cache()

    torch.manual_seed(0)
    mt = train(RCNNWithHead(mean, std), loader, "rcnn+head")
    torch.save(mt.state_dict(), WORK / "rcnn_par.pt")
    dets, sp, st = predict_rcnn(mt, test_ds, with_head=True)
    res = coco_score(gt, dets)
    sp, st = np.array(sp), np.array(st)
    from scipy.stats import spearmanr
    res["severity_head"] = {
        "target": "number of malocclusion findings per photo (stand-in, OMNI has no PAR labels)",
        "MAE": round(float(np.abs(sp - st).mean()), 3),
        "MAE_predict_train_mean": round(float(np.abs(mean - st).mean()), 3),
        "spearman": round(float(spearmanr(sp, st).correlation), 3),
    }
    results["faster_rcnn_with_head"] = res
    print("Faster R-CNN + head:", res["mAP50"], res["mAP50_95"], res["severity_head"], flush=True)

    (WORK / "comparison.json").write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2), flush=True)


if __name__ == "__main__":
    main()
