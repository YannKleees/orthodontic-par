# -*- coding: utf-8 -*-
"""
Created on Tue Apr  1 10:24:03 2025

@author: Shekoufeh
"""

import os
from pathlib import Path
import argparse
import cv2
import numpy as np
from matplotlib import pyplot as plt   # ← import kept in case you plot later

# Grid cell size
BASE_WIDTH  = 2048
BASE_HEIGHT = 1200


def pad_and_resize(image, size=(BASE_WIDTH, BASE_HEIGHT)):
    """Resize an image to fit inside *size* while preserving aspect ratio,
    then pad with black to exactly *size*.
    """
    h, w = image.shape[:2]
    scale = min(size[0] / w, size[1] / h)
    new_w, new_h = int(w * scale), int(h * scale)

    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)

    pad_top    = (size[1] - new_h) // 2
    pad_bottom = size[1] - new_h - pad_top
    pad_left   = (size[0] - new_w) // 2
    pad_right  = size[0] - new_w - pad_left

    return cv2.copyMakeBorder(
        resized,
        pad_top, pad_bottom, pad_left, pad_right,
        cv2.BORDER_CONSTANT,
        value=(0, 0, 0)          # black padding
    )


def process_images(input_folder: str, output_folder: str) -> None:
    """Build 3×2 grids of views (right, center, left on row 1; up, down on row 2)."""
    Path(output_folder).mkdir(parents=True, exist_ok=True)

    # Collect file paths grouped by case key and view name
    images_by_case: dict[str, dict[str, str]] = {}

    for file in os.listdir(input_folder):
        stem, _ = os.path.splitext(file)
        parts = stem.split("_")
        key   = "_".join(parts[:-1]).upper()  # e.g. 4-digit hex or patient ID
        view  = parts[-1].lower()             # right, center, left, up, down

        images_by_case.setdefault(key, {})[view] = os.path.join(input_folder, file)

    # Compose grids
    positions = {
        "right":  (0, 0),
        "center": (0, BASE_WIDTH),
        "left":   (0, BASE_WIDTH * 2),
        "up":     (BASE_HEIGHT, 0),
        "down":   (BASE_HEIGHT, BASE_WIDTH),
    }

    for key, views in images_by_case.items():
        grid = np.zeros((BASE_HEIGHT * 2, BASE_WIDTH * 3, 3), dtype=np.uint8)

        for view, (y, x) in positions.items():
            if view in views:
                img = cv2.imread(views[view], cv2.IMREAD_COLOR)
                img = pad_and_resize(img)
                grid[y:y + BASE_HEIGHT, x:x + BASE_WIDTH] = img
        if len(set(views.keys()) & {"right","center","left","up","down"}) >= 4:
            cv2.imwrite(os.path.join(output_folder, f"{key}_mosaic.png"), grid)


if __name__ == "__main__":
    import argparse, sys, os
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    if not os.path.isdir(args.input):
        sys.exit("Input folder does not exist")
    process_images(args.input, args.output)

