"""
Feature extraction + weighting for patient similarity / clustering.
You may tweak the CHANNEL_WEIGHTS dict at the bottom – nothing else
down‑stream needs to change.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Dict, List

import numpy as np
import torch
from PIL import Image
from sentence_transformers import SentenceTransformer   # CLIP backbone

from .patient import PatientOut

# ------------------------- channel 1 – images ------------------------ #
_clip = SentenceTransformer("openai/clip-vit-base-patch32", device="cpu")

@torch.inference_mode()
def img_embed(img_paths: List[Path]) -> np.ndarray:
    if not img_paths:
        return np.zeros(512, np.float32)

    embs = _clip.encode(
        [Image.open(p).convert("RGB") for p in img_paths],
        batch_size=8,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    vec = embs.mean(0)
    return vec / (np.linalg.norm(vec) or 1.0)


# ------------------------- channel 2 – PAR vector -------------------- #
PAR_COMPONENTS = [
    "Upper Crowding", "Lower Crowding",
    "Upper Spacing", "Lower Spacing",
    "Overjet", "Overbite", "Crossbite", "Centerline",
]

def par_embed(par: Dict[str, int] | None) -> np.ndarray:
    v = np.zeros(len(PAR_COMPONENTS), np.float32)
    if par:
        for i, k in enumerate(PAR_COMPONENTS):
            v[i] = par.get(k, 0) / 10.0      # 0‑1
    return v


# ------------------------- channel 3 – age / sex -------------------- #
def demo_embed(age: int | None, sex: str | None) -> np.ndarray:
    sx = 0 if (sex or "M").upper().startswith("M") else 1
    ag = (age or 0) / 100
    return np.asarray([ag, sx], np.float32)


# ------------------------- channel 4 – tags ------------------------- #
_TAG_DIM = 98       # first 3 dims = malocclusion class; rest = hashed cond

def tag_embed(malocl: str | None, cond: str | None) -> np.ndarray:
    vec = np.zeros(_TAG_DIM, np.float32)

    if malocl:
        cls = {"I": 0, "II": 1, "III": 2}.get(malocl.upper())
        if cls is not None:
            vec[cls] = 1.0

    if cond:
        h = int(hashlib.md5(cond.encode()).hexdigest(), 16) % 95
        vec[3 + h] = 1.0

    n = np.linalg.norm(vec)
    return vec if n == 0 else vec / n


# -------------------------------------------------------------------- #
# final “mega” vector
# -------------------------------------------------------------------- #
CHANNEL_WEIGHTS = {
    "img":  0.55,
    "par":  0.25,
    "demo": 0.10,
    "tag":  0.10,
}

def patient_vector(p: PatientOut) -> np.ndarray:
    from .patient import DATA_ROOT  # lazy import to avoid cycles
    img_paths = [Path("data") / ip for ip in p.images]

    v_img  = img_embed(img_paths) * CHANNEL_WEIGHTS["img"]
    v_par  = par_embed(p.par) * CHANNEL_WEIGHTS["par"]
    v_demo = demo_embed(p.age, p.sex) * CHANNEL_WEIGHTS["demo"]
    v_tag  = tag_embed(p.malocclusion, p.condition) * CHANNEL_WEIGHTS["tag"]

    vec = np.concatenate([v_img, v_par, v_demo, v_tag]).astype(np.float32)
    return vec / (np.linalg.norm(vec) or 1.0)   # cosine ready
