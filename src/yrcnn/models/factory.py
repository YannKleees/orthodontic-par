"""
Model factory – add any detector once in this mapping and the rest
of the codebase picks it up automatically.
"""
from __future__ import annotations
from typing import Callable, Dict, Any
from .yolo       import build as _build_yolo
from .rcnn       import build as _build_rcnn
from .rcnn_par   import build as _build_rcnn_par

_BUILDERS: Dict[str, Callable[..., Any]] = {
    "yolo":                       _build_yolo,
    "rcnn":                       _build_rcnn,
    "fasterrcnn_resnet50_fpn":    _build_rcnn,
    "fasterrcnn_resnet50_fpn_par": _build_rcnn_par,
}

def available() -> list[str]:
    """Return a sorted list of known model identifiers."""
    return sorted(_BUILDERS)


def build(model_id: str, **kwargs):
    """
    Returns an *initialised* detector.

    Parameters
    ----------
    model_id : {"yolo", "rcnn", "fasterrcnn_resnet50_fpn", …}
    kwargs   : forwarded verbatim to the underlying build() function.
               Typical keys during **training**:
                   – num_classes
                   – weights
               During **inference** you normally call it without kwargs.
    """
    m_id = model_id.lower()
    if m_id not in _BUILDERS:
        raise ValueError(
            f"Unknown model '{model_id}'. "
            f"Choose from {', '.join(available())}."
        )
    return _BUILDERS[m_id](**kwargs)
