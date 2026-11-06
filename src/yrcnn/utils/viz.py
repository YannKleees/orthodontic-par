"""
Quick visual QA – randomly show N images with ground‑truth boxes.

Example:
    python -m yrcnn.cli viz coco --n 4
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

import cv2
import matplotlib.pyplot as plt
import yaml

from yrcnn.data.manager import prepare_dataset


# ---------------------------------------------------------------------------


def _cli() -> argparse.Namespace:
    p = argparse.ArgumentParser("yrcnn – visualise dataset samples")
    p.add_argument("--data", required=True, help="coco | dentex | local")
    p.add_argument("--n", type=int, default=5, help="#images to display")
    p.add_argument(
        "--device",
        default="cpu",
        help="ignored – kept only for API parity with train/infer",
    )
    return p.parse_args()


# ---------------------------------------------------------------------------


def _label_path(img_p: Path) -> Path:
    """Cross‑platform “…/images/… → …/labels/…” with same sub‑folder."""
    parts = list(img_p.parts)
    try:
        idx = parts.index("images")
        parts[idx] = "labels"
        return Path(*parts).with_suffix(".txt")
    except ValueError:
        # very unlikely edge‑case – fall back to manual construction
        return (
            img_p.parent.parent
            / "labels"
            / img_p.parent.name
            / f"{img_p.stem}.txt"
        )


def _draw(img_p: Path) -> None:
    img = cv2.imread(str(img_p))
    h, w = img.shape[:2]

    lbl = _label_path(img_p)
    if not lbl.exists():  # safety – allow class‑less images
        return

    for row in lbl.read_text().splitlines():
        cls, xc, yc, bw, bh = map(float, row.split())
        x1, y1 = int((xc - bw / 2) * w), int((yc - bh / 2) * h)
        x2, y2 = int((xc + bw / 2) * w), int((yc + bh / 2) * h)
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)

    plt.figure(figsize=(6, 6))
    plt.title(img_p.name)
    plt.imshow(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    plt.axis("off")


# ---------------------------------------------------------------------------


def main() -> None:
    a = _cli()

    yaml_fp = prepare_dataset(a.data)
    meta = yaml.safe_load(Path(yaml_fp).read_text())

    train_root = Path(meta["path"]) / "images" / "train"
    imgs = list(train_root.glob("*.[jp][pn]g"))
    if not imgs:
        print("⚠ No images found – did the dataset download fail?")
        return

    for p in random.sample(imgs, min(a.n, len(imgs))):
        _draw(p)

    plt.show()


if __name__ == "__main__":
    main()
