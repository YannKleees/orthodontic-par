"""
Public entry point installed as the `yrcnn` console‑script.

$ yrcnn tui            # launches the Rich menu
$ yrcnn train ...       # same flags as yrcnn.training.train
$ yrcnn infer ...       # unchanged
$ yrcnn viz ...         # unchanged
"""
from __future__ import annotations
import argparse, subprocess, sys, pathlib

PY = sys.executable
PKG_ROOT = pathlib.Path(__file__).resolve().parents[1]

def _run(cmd):
    print(">", " ".join(cmd))
    subprocess.run(cmd, check=True)

def _parser():
    p = argparse.ArgumentParser("yrcnn")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("tui")

    tr = sub.add_parser("train")
    tr.add_argument("dataset",choices=["coco", "dentex", "local"],help="which dataset to use")

    tr.add_argument("--model",   required=True)
    tr.add_argument("--epochs",  type=int, default=50)
    tr.add_argument("--batch",   type=int, default=8)
    tr.add_argument("--imgsz",   type=int, default=640)
    tr.add_argument("--device",  default="cpu")
    tr.add_argument("--resume")
    tr.add_argument("--dry-run", action="store_true")

    inf = sub.add_parser("infer")
    inf.add_argument("--weights", required=True)
    inf.add_argument("--source",  required=True)
    inf.add_argument("--device",  default="cpu")

    viz = sub.add_parser("viz")
    viz.add_argument("--dataset", required=True)
    viz.add_argument("--n",       type=int, default=5)
    viz.add_argument("--device",  default="cpu")
    return p

def main(argv=None):
    a = _parser().parse_args(argv)
    if a.cmd == "tui":
        _run([PY, "-m", "yrcnn.ui.tui"])
    elif a.cmd == "train":
        forward = [
            "--dataset",   a.dataset,
            "--model",  a.model,
            "--epochs", str(a.epochs),
            "--batch",  str(a.batch),
            "--imgsz",  str(a.imgsz),
            "--device", a.device,
        ]
        if a.resume:
            forward += ["--resume", a.resume]
        if a.dry_run:
            forward += ["--dry-run"]
        _run([PY, "-m", "yrcnn.training.train"] + forward)


    elif a.cmd == "infer":
        _run([PY, "-m", "yrcnn.training.inference"] + sys.argv[2:])
    elif a.cmd == "viz":
        _run([PY, "-m", "yrcnn.utils.viz"] + sys.argv[2:])

if __name__ == "__main__":
    main()
