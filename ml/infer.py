"""Run the OMNI detector on the five intraoral views of one visit.

Called by the backend after an upload:
    python ml/infer.py --model models/omni_yolo11.pt up=a.png down=b.png left=c.png right=d.png center=e.png
Prints one JSON object to stdout:
    {"model": "...", "views": {"up": {"width": W, "height": H,
        "detections": [{"label": "tooth_torsion", "confidence": 0.81, "box": [x1, y1, x2, y2]}, ...]}, ...}}
Boxes are in the pixel space of each input image.
"""

import argparse
import json
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--conf", type=float, default=0.3)
    parser.add_argument("--imgsz", type=int, default=512)
    parser.add_argument("views", nargs="+", help="view=path pairs")
    args = parser.parse_args()

    if not args.model.exists():
        sys.exit(f"model not found: {args.model}")

    from ultralytics import YOLO  # imported late so --help and errors stay fast

    model = YOLO(str(args.model))
    names = model.names
    out = {"model": args.model.name, "conf": args.conf, "views": {}}

    for pair in args.views:
        view, _, path = pair.partition("=")
        if not path:
            sys.exit(f"expected view=path, got {pair!r}")
        result = model.predict(path, conf=args.conf, imgsz=args.imgsz, device="cpu", verbose=False)[0]
        height, width = result.orig_shape
        detections = [
            {
                "label": names[int(cls)],
                "confidence": round(float(conf), 4),
                "box": [round(float(v), 1) for v in xyxy],
            }
            for xyxy, conf, cls in zip(result.boxes.xyxy.tolist(), result.boxes.conf.tolist(), result.boxes.cls.tolist())
        ]
        out["views"][view] = {"width": width, "height": height, "detections": detections}

    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
