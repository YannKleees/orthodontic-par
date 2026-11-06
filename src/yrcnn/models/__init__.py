"""Central factory."""
from .yolo import build as _build_yolo
from .rcnn import build as _build_rcnn


def build(name: str, n_cls: int, **kw):
    ln = name.lower()
    if ln.startswith("yolo"):
        return _build_yolo(name, **kw)
    if ln in ("rcnn", "fasterrcnn_resnet50_fpn","fasterrcnn_resnet50_fpn_par"):
        return _build_rcnn(n_cls)
    raise ValueError(name)
