"""Convert the OMNI dataset (COCO format) into the folder layout YOLO expects.

OMNI: Xue et al., "Oral Imaging for Malocclusion Issues Assessments: OMNI Dataset,
Deep Learning Baselines and Benchmarking", arXiv:2505.15637.
Download: https://github.com/RoundFaceJ/OMNI (Google Drive link in their README).

Usage:
    python ml/prepare_omni.py --src path/to/omni_coco --out datasets/omni_yolo
"""

import argparse
import json
import shutil
from pathlib import Path

# OMNI category ids 1..10 in this order; YOLO class ids are 0..9.
CLASSES = [
    "healthy_tooth",          # HT
    "tooth_torsion",          # TT
    "deep_overjet",           # DO
    "invisible_attachment",   # IOA
    "tooth_emergence",        # TE
    "cast_fixed_appliance",   # CFOA
    "tooth_misalignment",     # TM
    "mandibular_retrusion",   # MR
    "orthodontic_brace",      # OB
    "fixed_device",           # FOD
]


def convert_split(src: Path, out: Path, split: str) -> tuple[int, int]:
    data = json.loads((src / "annotations" / f"instances_{split}.json").read_text(encoding="utf-8"))
    images = {img["id"]: img for img in data["images"]}
    labels: dict[int, list[str]] = {img_id: [] for img_id in images}

    for ann in data["annotations"]:
        img = images[ann["image_id"]]
        x, y, w, h = ann["bbox"]
        if w <= 0 or h <= 0:
            continue
        cx = (x + w / 2) / img["width"]
        cy = (y + h / 2) / img["height"]
        labels[ann["image_id"]].append(
            f"{ann['category_id'] - 1} {cx:.6f} {cy:.6f} {w / img['width']:.6f} {h / img['height']:.6f}"
        )

    img_dir = out / "images" / split
    lbl_dir = out / "labels" / split
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)

    for img_id, img in images.items():
        source = src / split / img["subfolder1"] / img["subfolder2"] / img["file_name"]
        stem = Path(img["file_name"]).stem
        shutil.copy2(source, img_dir / f"{stem}.jpg")
        (lbl_dir / f"{stem}.txt").write_text("\n".join(labels[img_id]), encoding="utf-8")

    return len(images), sum(len(v) for v in labels.values())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", type=Path, required=True, help="folder containing annotations/, train/, val/, test/")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    for split in ("train", "val", "test"):
        n_img, n_box = convert_split(args.src, args.out, split)
        print(f"{split}: {n_img} images, {n_box} boxes")

    names = "\n".join(f"  {i}: {name}" for i, name in enumerate(CLASSES))
    (args.out / "data.yaml").write_text(
        f"path: {args.out.resolve().as_posix()}\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n{names}\n",
        encoding="utf-8",
    )
    print(f"wrote {args.out / 'data.yaml'}")


if __name__ == "__main__":
    main()
