"""
Dry‑run integration – all four combinations finish in <10 s on CPU.
"""
import subprocess, sys, pathlib, pytest

PY  = sys.executable
ROOT = pathlib.Path(__file__).resolve().parents[2]

@pytest.mark.parametrize(
    ("dataset", "model"),
    [("dentex", "yolo"), ("dentex", "rcnn"),
     ("coco",   "yolo"), ("coco",   "rcnn")])
def test_train_dry_run(dataset, model):
    cmd = [
        PY, "-m", "yrcnn.cli", "train", dataset,
        "--model",  model,
        "--epochs", "1",
        "--batch",  "1",
        "--device", "cpu",
        "--dry-run",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr[-400:]
