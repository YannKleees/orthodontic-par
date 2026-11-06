"""
COCO‑JSON ➜ YOLO‑txt (image‑by‑image).

Example
-------
>>> from yrcnn.data.converter import convert_one
>>> convert_one(42, Path("coco.json"), Path("labels"))
"""
from __future__ import annotations
import json
from pathlib import Path

# Convert COCO bounding box to YOLO format.
# COCO bbox: [x, y, width, height]
def _to_yolo(bbox, w, h):
    x, y, bw, bh = bbox
    xc, yc = x + bw / 2, y + bh / 2
    return xc / w, yc / h, bw / w, bh / h

# Convert a single COCO image annotation to YOLO format and save it as a text file.
# `img_id` is the ID of the image in the COCO JSON file.
def convert_one(img_id: int, coco_json: Path, out_dir: Path) -> None:
    data = json.loads(coco_json.read_text())
    img_meta = next(i for i in data["images"] if i["id"] == img_id)
    w, h = img_meta["width"], img_meta["height"]

    lbls = []
    for ann in [a for a in data["annotations"] if a["image_id"] == img_id]:
        xc, yc, bw, bh = _to_yolo(ann["bbox"], w, h)
        lbls.append(f"{ann['category_id']} {xc:.6f} {yc:.6f} "
                    f"{bw:.6f} {bh:.6f}")

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{img_meta['file_name'].rsplit('.', 1)[0]}.txt") \
        .write_text("\n".join(lbls))
