"""
Light‑weight helper to run object‑detection inference on an arbitrary list
of image files and return clean JSON‑serialisable results for the UI.

Returned format
---------------
{
    "file_name.jpg": [
        {"bbox": [x1, y1, x2, y2], "label": "tooth", "conf": 0.88},
        …
    ],
    …
}
The bounding boxes are *always* absolute pixel corner‑format.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

import torch
from PIL import Image
import torchvision.transforms.functional as F

from yrcnn.models.factory import build

def _yolo_infer(net, paths: List[Path], device: str):
    """Ultralytics YOLO → clean dict."""
    out: Dict[str, list] = {}

    
    results = net.predict([str(p) for p in paths],
                          stream=False,
                          device=device,
                          verbose=False)

    names = net.model.names if hasattr(net.model, "names") else {}

    for p, res in zip(paths, results):
        dets = []
        for b in res.boxes:               
            x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
            conf = float(b.conf[0])
            cls  = int(b.cls[0])
            dets.append({
                "bbox":  [x1, y1, x2, y2],
                "label": names.get(cls, str(cls)),
                "conf":  conf,
            })
        out[p.name] = dets               
    return out


def _rcnn_infer(net, paths: List[Path], device: str):
    """TorchVision Faster‑RCNN → clean dict."""
    out: Dict[str, list] = {}
    net.eval()

    for p in paths:
        img = Image.open(p).convert("RGB")
        with torch.no_grad():
            res = net([F.to_tensor(img).to(device)])[0]

        dets = []
        for bbox, lbl, conf in zip(res["boxes"], res["labels"], res["scores"]):
            conf = float(conf)
            if conf < 0.05:               #
                continue
            x1, y1, x2, y2 = [float(v) for v in bbox.tolist()]
            dets.append({
                "bbox":  [x1, y1, x2, y2],
                "label": str(int(lbl)),   
                "conf":  conf,
            })
        out[p.name] = dets
    return out



def run_inference_on_files(
    paths: List[Path],
    model_id: str,
    device: str = "cpu",
) -> Dict[str, list]:
    """
    *model_id* may be:
      • “yolo” or “rcnn”               → use factory defaults
      • *.pt  (file)                   → Ultralytics YOLO weights
      • *.pth (file)                   → Faster‑RCNN checkpoint
    """
    model_id = str(model_id)

   
    if model_id.endswith(".pt") and Path(model_id).is_file():
        net = YOLO(model_id)                 
        return _yolo_infer(net, paths, device)

    if model_id.endswith(".pth") and Path(model_id).is_file():
        net = _load_rcnn_from_weights(model_id, device)
        return _rcnn_infer(net, paths, device)

    
    net = build(model_id)
    net.to(device).eval()
    if model_id.lower().startswith("yolo"):
        return _yolo_infer(net, paths, device)
    else:
        return _rcnn_infer(net, paths, device)
def _load_rcnn_from_weights(weights: str, device: str):
    """
    Build an RCNN whose predictor head size matches *weights* automatically.
    """
    state = torch.load(weights, map_location=device)
    n_cls = None
    for k, v in state.items():
        if k.endswith("cls_score.weight"):
            n_cls = v.shape[0]       
            break
    net = build("rcnn", num_classes=n_cls)
    net.load_state_dict(state, strict=False)
    net.to(device).eval()
    return net

