"""Lightweight mean‑Average‑Precision helper (no extra deps)."""
from collections import defaultdict
import torch
from torchvision.ops import box_iou

def _ap_at_iou(pred_boxes, pred_scores, gt_boxes, iou_thr=0.5):
    """Single‑image AP (binary class‑agnostic)."""
    if len(pred_boxes) == 0 or len(gt_boxes) == 0:
        return 0.0
    ious = box_iou(pred_boxes, gt_boxes)
    hits = torch.zeros(len(gt_boxes))
    tp, fp = [], []
    for i in pred_scores.argsort(descending=True):
        max_iou, j = ious[i].max(0)
        if max_iou >= iou_thr and not hits[j]:
            tp.append(1); fp.append(0); hits[j] = 1
        else:
            tp.append(0); fp.append(1)
    tp, fp = torch.tensor(tp).cumsum(0), torch.tensor(fp).cumsum(0)
    precis = tp / torch.clamp(tp + fp, min=1)
    recalls = tp / len(gt_boxes)
    return torch.trapz(precis, recalls).item()

def mAP(det_results, gt_targets, iou_t=(0.5,)):
    """
    det_results : list [{boxes:Tensor[n,4], scores:Tensor[n]}]
    gt_targets  : list [{boxes:Tensor[m,4]}]
    iou_t       : tuple of IoU thresholds (e.g. 0.5, 0.55, …)
    """
    aps = defaultdict(list)
    for res, gt in zip(det_results, gt_targets):
        for thr in iou_t:
            ap = _ap_at_iou(res["boxes"], res["scores"], gt["boxes"], thr)
            aps[thr].append(ap)
    return {thr: sum(v)/len(v) for thr, v in aps.items()}
