"""Train a YOLO11 detector on OMNI and report test-set metrics.

Usage:
    python ml/train.py --data datasets/omni_yolo/data.yaml --model yolo11s.pt --epochs 60
The best weights are copied to models/omni_yolo11.pt, the metrics to ml/results/.
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]


def keep_awake() -> None:
    """Stop Windows from going to sleep while training runs (no effect elsewhere)."""
    if sys.platform == "win32":
        import ctypes
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--model", default="yolo11s.pt")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--imgsz", type=int, default=512)   # OMNI images are 512x341
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--name", default="omni_yolo11")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--fraction", type=float, default=1.0, help="share of training images, for quick checks")
    parser.add_argument("--resume", action="store_true", help="continue an interrupted run from last.pt")
    args = parser.parse_args()
    keep_awake()

    last = ROOT / "runs" / args.name / "weights" / "last.pt"
    if args.resume and last.exists():
        YOLO(last).train(resume=True)
    else:
        YOLO(args.model).train(
            data=str(args.data),
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            device=args.device,
            workers=args.workers,
            fraction=args.fraction,
            cache="ram",
            patience=10,
            seed=0,
            project=str(ROOT / "runs"),
            name=args.name,
            exist_ok=True,
            fliplr=0.0,   # left/right views are not mirror images of each other
        )

    best = ROOT / "runs" / args.name / "weights" / "best.pt"
    (ROOT / "models").mkdir(exist_ok=True)
    shutil.copy2(best, ROOT / "models" / "omni_yolo11.pt")

    # Held-out test split, never used for training or model selection
    metrics = YOLO(best).val(data=str(args.data), split="test", imgsz=args.imgsz, device=args.device,
                             project=str(ROOT / "runs"), name=f"{args.name}_test", exist_ok=True)
    names = metrics.names
    result = {
        "model": args.model,
        "epochs_requested": args.epochs,
        "imgsz": args.imgsz,
        "test_mAP50": round(float(metrics.box.map50), 4),
        "test_mAP50_95": round(float(metrics.box.map), 4),
        "per_class_mAP50_95": {names[int(c)]: round(float(m), 4)
                               for c, m in zip(metrics.box.ap_class_index, metrics.box.maps[metrics.box.ap_class_index])},
        "per_class_mAP50": {names[int(c)]: round(float(m), 4)
                            for c, m in zip(metrics.box.ap_class_index, metrics.box.all_ap[:, 0])},
    }
    out = ROOT / "ml" / "results"
    out.mkdir(exist_ok=True)
    (out / "test_metrics.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
