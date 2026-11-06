"""Tiny wrapper so that all detectors live under *yrcnn.models*."""
from ultralytics import YOLO


def build(weights: str = "yolo11n.pt", **kw):
    """Return an *Ultralytics* YOLO model ready for `.train()` or `.predict()`."""
    return YOLO(weights, **kw)