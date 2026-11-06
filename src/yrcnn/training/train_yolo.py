"""YOLO training wrapper + per‑epoch preview images."""
from __future__ import annotations
import argparse, os, pathlib, random, shutil
from ultralytics import YOLO
import cv2, yaml

from yrcnn.data.manager import prepare_dataset


def _cli() -> argparse.Namespace:
    p = argparse.ArgumentParser("train YOLO + preview")
    p.add_argument("--data",   required=True)
    p.add_argument("--model",  default="yolo11n.pt")
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--batch",  type=int, default=16)
    p.add_argument("--imgsz",  type=int, default=640)
    p.add_argument("--device", default="0")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()



def _save_epoch_previews(model: YOLO, yaml_path: pathlib.Path, ep: int,
                         out_dir: pathlib.Path, n: int = 4) -> None:
    """Runs inference on *n* random validation images and saves panels."""
    meta = yaml.safe_load(yaml_path.read_text())
    val_root = pathlib.Path(meta["path"]) / "images" / "val"
    samples  = random.sample(list(val_root.glob("*.[jp][pn]g")), min(n,  len(list(val_root.glob('*')))))
    save_dir = out_dir / f"preds_epoch{ep:03d}"
    save_dir.mkdir(parents=True, exist_ok=True)
    model.predict(source=[str(s) for s in samples],
                  save_txt=False, save_conf=False, save=True,
                  project=str(save_dir), name=".", exist_ok=True, imgsz=meta.get("imgsz", 640))



def main() -> None:
    a = _cli()
    yaml_path = prepare_dataset(a.data)

    if a.dry_run:
        print("dry‑run only – dataset prepared:", yaml_path)
        return

    model = YOLO(a.model)
    run_dir = pathlib.Path("runs") / a.data
    run_dir.mkdir(parents=True, exist_ok=True)

    
    model.train(
        data=str(yaml_path),
        epochs=a.epochs,
        batch=a.batch,
        imgsz=a.imgsz,
        device=a.device,
        project=str(run_dir),
        name="train",
        exist_ok=True,
    )
    weights_dir = run_dir / "train" / "weights"
    ckpts = sorted(weights_dir.glob("epoch*.pt"))
    for ep, ck in enumerate(ckpts, 1):
        model = YOLO(str(ck))
        _save_epoch_previews(model, pathlib.Path(yaml_path), ep, run_dir)

if __name__ == "__main__":
    main()
