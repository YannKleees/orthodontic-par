"""Train the OMNI detector on a Kaggle GPU (same settings as ml/train.py, larger model).

Pushed with:  kaggle kernels push -p ml/kaggle
Outputs (in /kaggle/working): omni_yolo11.pt, test_metrics.json, training curves.
"""
import glob, json, shutil, subprocess, sys
from pathlib import Path

import os
import torch

# A free Kaggle account only gets a GPU (and internet) after phone verification
print("CUDA available:", torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else "")
if not torch.cuda.is_available():
    sys.exit("No GPU attached to this notebook; stopping instead of training for hours on CPU.")

# Offline install: wheels and COCO-pretrained weights come from the private "ultralytics-offline-kit" dataset
kit = Path(glob.glob("/kaggle/input/**/ultralytics-8.3.163-py3-none-any.whl", recursive=True)[0]).parent
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--no-deps", "--no-index",
                *map(str, kit.glob("*.whl"))], check=True)
WORK = Path("/kaggle/working")
for w in ("yolo11n.pt", "yolo11s.pt"):          # yolo11n is used by Ultralytics' AMP self-check
    shutil.copy2(kit / w, WORK / w)
os.chdir(WORK)
os.environ["YOLO_OFFLINE"] = "1"
from ultralytics import YOLO  # noqa: E402
src = Path(glob.glob("/kaggle/input/**/images/train", recursive=True)[0]).parent.parent
data_dir = WORK / "omni"                       # copy: the input folder is read-only
shutil.copytree(src, data_dir, ignore=shutil.ignore_patterns("*.yaml", "*.json"))
names = ["healthy_tooth", "tooth_torsion", "deep_overjet", "invisible_attachment", "tooth_emergence",
         "cast_fixed_appliance", "tooth_misalignment", "mandibular_retrusion", "orthodontic_brace", "fixed_device"]
yaml = data_dir / "data.yaml"
yaml.write_text(f"path: {data_dir}\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n"
                + "".join(f"  {i}: {n}\n" for i, n in enumerate(names)))

MODEL, EPOCHS, IMGSZ = str(WORK / "yolo11s.pt"), 60, 512
YOLO(MODEL).train(data=str(yaml), epochs=EPOCHS, imgsz=IMGSZ, batch=32, device=0, patience=15, seed=0,
                  project=str(WORK / "runs"), name="omni_yolo11", exist_ok=True, fliplr=0.0, workers=4,
                  plots=False)                 # plotting downloads a font, which fails offline

best = WORK / "runs" / "omni_yolo11" / "weights" / "best.pt"
shutil.copy2(best, WORK / "omni_yolo11.pt")

# Held-out test split: never used for training or for picking the best epoch
m = YOLO(best).val(data=str(yaml), split="test", imgsz=IMGSZ, device=0,
                   project=str(WORK / "runs"), name="omni_yolo11_test", exist_ok=True, plots=False)
result = {
    "model": "yolo11s.pt", "epochs_requested": EPOCHS, "imgsz": IMGSZ, "hardware": "Kaggle GPU",
    "test_images": 828,
    "test_mAP50": round(float(m.box.map50), 4),
    "test_mAP50_95": round(float(m.box.map), 4),
    "test_precision": round(float(m.box.mp), 4),
    "test_recall": round(float(m.box.mr), 4),
    "per_class_mAP50": {m.names[int(c)]: round(float(v), 4) for c, v in zip(m.box.ap_class_index, m.box.all_ap[:, 0])},
    "per_class_mAP50_95": {m.names[int(c)]: round(float(v), 4) for c, v in zip(m.box.ap_class_index, m.box.maps[m.box.ap_class_index])},
}
(WORK / "test_metrics.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
shutil.rmtree(data_dir)                         # keep the output small
