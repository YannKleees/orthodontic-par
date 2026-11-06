"""yrcnn.models.rcnn
====================
Faster‑RCNN ResNet‑50 FPN **with an explicit background class**.

This revision fixes the classic "everything becomes class 0" bug by
*always* keeping class‑ID 0 reserved for *background*.  So your dataset
must provide labels **1‥N** for real objects.

Usage (training)
----------------
>>> net = build(num_classes=DATASET_N_CLASSES + 1)  # +1 → bg class

During **inference** you can either keep the fine‑tuned head or, if you
want to run the stock COCO checkpoint, call it with ``num_classes=None``
(which skips the head replacement).
"""
from __future__ import annotations

from typing import Optional

import torchvision
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor

__all__ = ["build"]


# Helper

def _replace_head(net: torchvision.models.detection.FasterRCNN, *, num_classes: int):
    """Swap the classification head **in‑place** so that it outputs *num_classes* logits."""
    in_f = net.roi_heads.box_predictor.cls_score.in_features
    net.roi_heads.box_predictor = FastRCNNPredictor(in_f, num_classes)
    return net


# Public factory

def build(
    num_classes: Optional[int] = None,
    *,
    pretrained: bool = True,
    freeze_backbone_at: int | None = None,
    **kw,
):
    
    weights = "DEFAULT" if pretrained else None
    net: torchvision.models.detection.FasterRCNN = (
        torchvision.models.detection.fasterrcnn_resnet50_fpn(weights=weights)
    )

    if num_classes is not None:
        net = _replace_head(net, num_classes=num_classes)

    if freeze_backbone_at is not None:
        for name, param in net.backbone.body.named_parameters():

            layer_idx = (
                0 if name.startswith("conv1") else int(name.split(".")[0][-1])
            )
            if layer_idx <= freeze_backbone_at:
                param.requires_grad_(False)

    return net
