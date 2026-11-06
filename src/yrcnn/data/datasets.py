"""
YoloToRcnnDataset  – a minimal torch.utils.data.Dataset
that reads YOLO txt labels.

Used by both YOLO and Faster‑RCNN trainers.
"""
from __future__ import annotations

from pathlib import Path
from typing import List

import cv2
import torch
import yaml
from torch.utils.data import Dataset

class YoloToRcnnDataset(Dataset):
    """
    YoloToRcnnDataset
    A dataset class for loading images and YOLO-style labels from a local directory.
    """
    def __init__(self,
                 root: str | Path,
                 split: str = "train",
                 transforms=None,
                 config_yaml: str | None = None):
        self.root = Path(root)
        self.transforms = transforms
        self.imgs: List[Path] = sorted(
            (self.root / f"images/{split}").glob("*.[jp][pn]g")
        )
        self.lbls: List[Path] = [
            self.root / "labels" / split / f"{p.stem}.txt" for p in self.imgs
        ]

        cls_txt = self.root / "labels" / "classes.txt"
        if cls_txt.exists():
            self.class_names = cls_txt.read_text().splitlines()
        elif config_yaml:
            with open(config_yaml, "r", encoding="utf-8") as f:
                self.class_names = list(map(str, yaml.safe_load(f)["names"]))
        else:
            self.class_names = ["tooth"]

        self.n_classes = len(self.class_names)
        
    def __len__(self) -> int:
        return len(self.imgs)

    def __getitem__(self, idx):
        img_path = self.imgs[idx]
        img_bgr = cv2.imread(str(img_path))
        img = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        h, w, _ = img.shape

        boxes, labels = [], []
        for row in self.lbls[idx].read_text().splitlines():
            cls, xc, yc, bw, bh = map(float, row.split())
            x1, y1 = (xc - bw / 2) * w, (yc - bh / 2) * h
            x2, y2 = (xc + bw / 2) * w, (yc + bh / 2) * h
            boxes.append([x1, y1, x2, y2])
            labels.append(int(cls))

        target = {
            "boxes": torch.tensor(boxes, dtype=torch.float32),
            "labels": torch.tensor(labels, dtype=torch.int64),
            "image_id": torch.tensor([idx]),
        }

        if self.transforms:
            img, target = self.transforms(img, target)

        img_t = torch.tensor(img).permute(2, 0, 1).float() / 255
        return img_t, target

    @staticmethod
    def collate_fn(batch):
        return tuple(zip(*batch))

    @classmethod
    def from_yaml(cls, yaml_fp: str | Path, split="train"):
        yaml_path = Path(yaml_fp)
        with open(yaml_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
        return cls(cfg["path"], split, config_yaml=str(yaml_path))
