"""
prepare_dataset() – downloads / pre‑processes coco / dentex / local and
returns a Ultralytics‑style YAML manifest.
"""
from __future__ import annotations

import logging
import math
import random
import shutil
import urllib.request
import zipfile
from functools import lru_cache
from pathlib import Path

import yaml

log = logging.getLogger(__name__)

DATA_DIR = Path("data")
CFG_DIR = Path("configs")
SPLIT_R = {"train": 0.8, "val": 0.1, "test": 0.1}

def _split(imgs: list[Path]) -> dict[str, list[Path]]:
    """Deterministic 80 / 10 / 10 single‑pass split."""
    random.shuffle(imgs)
    n = len(imgs)
    tr = max(1, math.floor(n * SPLIT_R["train"]))
    va = max(1, math.floor(n * SPLIT_R["val"]))
    te = max(1, n - tr - va)
    return {
        "train": imgs[:tr],
        "val": imgs[tr : tr + va],
        "test": imgs[tr + va :],
    }

def _split_into_interim(raw: Path, tag: str) -> Path:
    """Copy YOLO images/labels into data/interim/<tag>/… and guarantee
       that images/{train,val,test} and labels/{train,val,test} exist,
       even if some images miss annotations."""
    interim_root = DATA_DIR / "interim" / tag

    for subset in ("train", "val", "test"):
        (interim_root / "images" / subset).mkdir(parents=True, exist_ok=True)
        (interim_root / "labels" / subset).mkdir(parents=True, exist_ok=True)

    for subset, imgs in _split(sorted((raw / "images").glob("*.[jp][pn]g"))).items():
        for img in imgs:
            shutil.copy(img, interim_root / "images" / subset / img.name)

            lbl_src = raw / "labels" / f"{img.stem}.txt"
            lbl_dst = interim_root / "labels" / subset / f"{img.stem}.txt"
            if lbl_src.exists():
                shutil.copy(lbl_src, lbl_dst)
            else:
                lbl_dst.touch()

    return interim_root


__all__ = ["prepare_dataset", "_split_into_interim"]

@lru_cache(maxsize=None)
def prepare_dataset(name: str) -> Path:
    """
    Returns a *YAML* file that Ultralytics understands.

        • **coco**   → COCO‑128 (only 128 images, fast download)
        • **dentex** → dental X‑ray challenge (via downloader helper)
        • **local**  → user‑supplied ``images/`` + ``labels/`` in repo root
    """
    name = name.lower()

    if name == "coco":
        yaml_out = CFG_DIR / "coco.yaml"

        if yaml_out.exists():
            meta = yaml.safe_load(yaml_out.read_text())
            img_root = Path(meta["path"]) / "images" / "train"
            if img_root.exists() and any(img_root.iterdir()):
                return yaml_out
            yaml_out.unlink()

        url = "https://ultralytics.com/assets/coco128.zip"
        zipp = DATA_DIR / "coco128.zip"
        if not zipp.exists():
            log.info("↓ COCO‑128 …")
            urllib.request.urlretrieve(url, zipp)

        root = DATA_DIR / "coco128"
        if not (root / "images").exists():
            zipfile.ZipFile(zipp).extractall(DATA_DIR)

        for sub in ("images", "labels"):
            src = root / sub / "train2017"
            dst = root / sub / "train"
            if src.exists() and (not dst.exists() or not any(dst.iterdir())):
                shutil.copytree(src, dst, dirs_exist_ok=True)

        for sub in ("images", "labels"):
            va = root / sub / "val"
            if (root / sub / "train").exists() and (
                not va.exists() or not any(va.iterdir())
            ):
                shutil.copytree(root / sub / "train", va, dirs_exist_ok=True)

        ds_meta = root / "dataset.yaml"
        if not ds_meta.exists():
            COCO_NAMES = [
                "person",
                "bicycle",
                "car",
                "motorcycle",
                "airplane",
                "bus",
                "train",
                "truck",
                "boat",
                "traffic light",
                "fire hydrant",
                "stop sign",
                "parking meter",
                "bench",
                "bird",
                "cat",
                "dog",
                "horse",
                "sheep",
                "cow",
                "elephant",
                "bear",
                "zebra",
                "giraffe",
                "backpack",
                "umbrella",
                "handbag",
                "tie",
                "suitcase",
                "frisbee",
                "skis",
                "snowboard",
                "sports ball",
                "kite",
                "baseball bat",
                "baseball glove",
                "skateboard",
                "surfboard",
                "tennis racket",
                "bottle",
                "wine glass",
                "cup",
                "fork",
                "knife",
                "spoon",
                "bowl",
                "banana",
                "apple",
                "sandwich",
                "orange",
                "broccoli",
                "carrot",
                "hot dog",
                "pizza",
                "donut",
                "cake",
                "chair",
                "couch",
                "potted plant",
                "bed",
                "dining table",
                "toilet",
                "tv",
                "laptop",
                "mouse",
                "remote",
                "keyboard",
                "cell phone",
                "microwave",
                "oven",
                "toaster",
                "sink",
                "refrigerator",
                "book",
                "clock",
                "vase",
                "scissors",
                "teddy bear",
                "hair drier",
                "toothbrush",
            ]
            ds_meta.write_text(yaml.dump({"names": COCO_NAMES}))

        names = yaml.safe_load(ds_meta.read_text())["names"]
        yaml_out.write_text(
            yaml.dump(
                {
                    "path": str(root),
                    "train": "images/train",
                    "val": "images/val",
                    "test": "",
                    "names": {i: n for i, n in enumerate(names)},
                },
                sort_keys=False,
            )
        )
        return yaml_out

    # DENTEX
    if name == "dentex":
        from .downloader import ensure_dentex

        return ensure_dentex()

    # LOCAL
    if name == "local":
        root = Path("images")
        assert root.exists(), "Place images/ and labels/ beside repository root"

        raw = DATA_DIR / "local"
        raw.mkdir(parents=True, exist_ok=True)
        if not (raw / "images").exists():
            shutil.copytree(root, raw / "images")
            shutil.copytree(Path("labels"), raw / "labels")

        interim = _split_into_interim(raw, "local")
        yaml_out = CFG_DIR / "local.yaml"
        cls = (raw / "labels/classes.txt").read_text().splitlines()
        yaml_out.write_text(
            yaml.dump(
                {
                    "path": str(interim),
                    "train": "images/train",
                    "val": "images/val",
                    "test": "images/test",
                    "names": cls,
                },
                sort_keys=False,
            )
        )
        return yaml_out

    raise ValueError(name)
