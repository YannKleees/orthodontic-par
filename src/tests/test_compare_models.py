# src/tests/test_compare_models.py
"""
Quantitative comparison YOLO vs Faster‑R‑CNN vs RCNN (our alias).

Run with:
    pytest -q src/tests/test_compare_models.py
Produces a JSON score table under  `runs/eval_results.json`.
"""
import json, pathlib, torch
from metrics import mAP
from yrcnn.data.datasets import YoloToRcnnDataset
from yrcnn.training.inference import run_inference_on_files

SCORES = {}

def _collect_samples(ds, n=50):
    """Return *n* image tensors + ground‑truths (CPU friendly)."""
    imgs, tgts = [], []
    for i in range(min(n, len(ds))):
        img, tgt = ds[i]
        imgs.append(img)        # tensor C×H×W
        tgts.append({           # only boxes needed for now
            "boxes": tgt["boxes"]
        })
    return imgs, tgts

def test_eval(_dataset_meta, _model_id, tmp_path_factory):
    tag, ds, root = _dataset_meta
    imgs, tgts = _collect_samples(ds, n=100)

    # Convert tensors back to images on disk so inference helper can read them
    cache = tmp_path_factory.mktemp("imgs")
    paths = []
    for i, t in enumerate(imgs):
        fp = cache / f"{i:04d}.jpg"
        import torchvision.transforms.functional as F
        F.to_pil_image(t).save(fp); paths.append(fp)

    # -------- inference ----------
    det = run_inference_on_files(paths, _model_id, device="cpu")

    det_results = []
    for p in paths:
        out = det[p.name]
        boxes = torch.tensor([b["bbox"] for b in out])
        scores= torch.tensor([b["conf"]  for b in out])
        det_results.append({"boxes": boxes, "scores": scores})

    scores = mAP(det_results, tgts, iou_t=(0.5, 0.75))
    SCORES.setdefault(tag, {})[_model_id] = scores

def test_write_summary(request):
    if request.session.testsfailed:
        pytest.skip("skip summarising because earlier tests failed")
    run_dir = pathlib.Path("runs")
    run_dir.mkdir(exist_ok=True)
    out_fp = run_dir / "eval_results.json"
    out_fp.write_text(json.dumps(SCORES, indent=2))
    print("\n\n=== mAP summary ===")
    print(out_fp.read_text())
