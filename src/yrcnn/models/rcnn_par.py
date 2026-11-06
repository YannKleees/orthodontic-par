"""Faster‑RCNN with an extra global PAR‑regression head."""

from __future__ import annotations
from collections import OrderedDict
from typing import List, Optional, Tuple, Dict, Any

import torch
import torch.nn as nn
import torchvision
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor


class _MultiTaskRCNN(nn.Module):
    """
    Wrapper that
      • keeps the original Faster‑RCNN detector intact, **plus**
      • adds a single‑value regression head for the Peer‑Assessment‑Rating (PAR).

    During **training** the forward pass returns a dict with the usual
    detector losses **AND** an extra `'loss_par'` key (MSE).
    During **eval** it returns the detector predictions *and* a list
    `par_pred` with one scalar per image.
    """

    def __init__(self, num_classes: int, *, pretrained: bool = True):
        super().__init__()

        # plain detector
        weights = "DEFAULT" if pretrained else None
        self.detector = torchvision.models.detection.fasterrcnn_resnet50_fpn(
            weights=weights, num_classes=num_classes
        )

        # global‑feature PAR head
        in_f = self.detector.backbone.out_channels
        self.gap = nn.AdaptiveAvgPool2d((1, 1))
        self.par_regressor = nn.Linear(in_f, 1)

        self._mse = nn.MSELoss()

    def _par_forward(self, images: List[torch.Tensor]) -> List[torch.Tensor]:
        """Run backbone → GAP → fc for each image and return preds."""
        preds = []
        for img in images:
            feat_maps: OrderedDict[str, torch.Tensor] = self.detector.backbone(
                img.unsqueeze(0)
            )
            f = next(iter(feat_maps.values()))
            p = self.par_regressor(self.gap(f).flatten(1))       
            preds.append(p.squeeze(0))                           
        return preds

    def forward(
        self,
        images: List[torch.Tensor],
        targets: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[Any, List[torch.Tensor] | Dict[str, torch.Tensor]]:
        """
        Train mode  → returns   loss_dict          (incl. 'loss_par')
        Eval  mode  → returns   detections, par_pred
        """
        if self.training:
            assert targets is not None
            det_loss = self.detector(images, targets)            
            gt = torch.stack([t["par"].float() for t in targets])  
            pred = torch.stack(self._par_forward(images))          
            det_loss["loss_par"] = self._mse(pred, gt)
            return det_loss

        detections = self.detector(images)                       
        par_pred   = self._par_forward(images)                    
        return detections, par_pred

def build(num_classes: int, *, pretrained: bool = True, **kw):
    return _MultiTaskRCNN(num_classes, pretrained=pretrained, **kw)
