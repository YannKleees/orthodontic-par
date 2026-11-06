"""
Unified training script for all detectors registered in
yrcnn.models.factory. Supports fresh runs *and* continuing training.

Examples
--------
# new YOLO run
python -m yrcnn.training.train --dataset dentex --model yolo11n.pt --epochs 30

# resume YOLO from epoch 20
python -m yrcnn.training.train --dataset dentex --model yolo \
       --resume runs/dentex/yolo/weights/epoch020.pt --epochs 10

# start an RCNN from scratch
python -m yrcnn.training.train --dataset coco --model rcnn --epochs 50 --device cuda:0
"""
from __future__ import annotations
import argparse, pathlib, torch, shutil
from torch.utils.data import DataLoader
from ultralytics import YOLO

from yrcnn.data.manager   import prepare_dataset
from yrcnn.data.datasets  import YoloToRcnnDataset
from yrcnn.models.factory import build as build_model, available as models_available

# ---------------------------------------------------------------------------

def _cli() -> argparse.Namespace:
    p = argparse.ArgumentParser("yrcnn – train or continue training")
    # data ------------------------------------------------------------------
    p.add_argument("--dataset", required=True, choices=["coco", "dentex", "local"])
    # model -----------------------------------------------------------------
    p.add_argument("--model",   required=True,
                   help="Either a model id "
                        f"({', '.join(models_available())}) "
                        "or a path/URL to Ultralytics weights (*.pt).")
    p.add_argument("--resume",  help="Checkpoint to resume from (.pt or .pth)")
    # hyperparams -----------------------------------------------------------
    p.add_argument("--epochs",  type=int, default=50)
    p.add_argument("--batch",   type=int, default=8)
    p.add_argument("--imgsz",   type=int, default=640,
                   help="Image size (YOLO‑only, ignored by RCNN)")
    # misc ------------------------------------------------------------------
    p.add_argument("--device",  default="cpu")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()

# ---------------------------------------------------------------------------

def _train_rcnn(cfg, ckpt_out: pathlib.Path):
    ds_tr = YoloToRcnnDataset.from_yaml(cfg["yaml"], "train")
    ds_va = YoloToRcnnDataset.from_yaml(cfg["yaml"], "val")

    tr_loader = DataLoader(
        ds_tr, batch_size=cfg["batch"], shuffle=True,
        collate_fn=YoloToRcnnDataset.collate_fn,
        num_workers=4, pin_memory=True
    )

    net = build_model("rcnn", num_classes=ds_tr.n_classes).to(cfg["device"])
    if cfg["resume"]:
        net.load_state_dict(torch.load(cfg["resume"], map_location=cfg["device"]))

    opt = torch.optim.AdamW(net.parameters(), lr=1e-4)
    for ep in range(1, cfg["epochs"] + 1):
        net.train(); tot = 0
        for imgs, tgts in tr_loader:
            imgs = [i.to(cfg["device"]) for i in imgs]
            tgts = [{k: v.to(cfg["device"]) for k, v in t.items()} for t in tgts]
            loss_dict = net(imgs, tgts)
            loss = sum(loss_dict.values())
            opt.zero_grad(); loss.backward(); opt.step()
            tot += loss.item()
        print(f"[RCNN {ep:03d}/{cfg['epochs']}] loss={tot/len(tr_loader):.4f}")

    ckpt_out.parent.mkdir(parents=True, exist_ok=True)
    torch.save(net.state_dict(), ckpt_out)
    print("RCNN weights saved to", ckpt_out)

# ---------------------------------------------------------------------------

def _train_yolo(cfg, ckpt_out: pathlib.Path):
    # decide how to build the model object
    if cfg["resume"]:
        model = YOLO(cfg["resume"])        # resume path doubles as weights path
        resume_flag = cfg["resume"]
    elif pathlib.Path(cfg["model"]).suffix == ".pt":
        model = YOLO(cfg["model"])         # custom weights
        resume_flag = False
    else:
        # model is an identifier like "yolo11n.pt" or "yolo5s"
        model = YOLO(cfg["model"])
        resume_flag = False

    model.train(
        data=str(cfg["yaml"]),
        epochs=cfg["epochs"],
        batch=cfg["batch"],
        imgsz=cfg["imgsz"],
        device=cfg["device"],
        resume=resume_flag,
        project=str(ckpt_out.parent),
        name=ckpt_out.parent.name,     # keeps folder names tidy
        exist_ok=True,
    )
    print(" YOLO run directory:", ckpt_out.parent)

# ---------------------------------------------------------------------------

def main() -> None:
    a = _cli()

    yaml_path = prepare_dataset(a.dataset)
    if a.dry_run:
        print(" dry‑run – dataset prepared at", yaml_path)
        return

    run_dir = pathlib.Path("runs") / a.dataset / pathlib.Path(a.model).stem
    ckpt_out = run_dir / "weights" / "last.pt"  # YOLO convention; RCNN will use .pth
    cfg = vars(a) | {"yaml": yaml_path}

    # branch on model family -------------------------------------------------
    is_yolo = (a.model.lower().startswith("yolo") or a.model.endswith(".pt"))
    if is_yolo:
        _train_yolo(cfg, ckpt_out)
    else:
        # ensure .pth ending
        ckpt_out = ckpt_out.with_suffix(".pth")
        _train_rcnn(cfg, ckpt_out)

if __name__ == "__main__":
    main()
