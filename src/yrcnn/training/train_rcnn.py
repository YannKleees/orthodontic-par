"""
Generic RCNN training loop – no fancy schedulers, just AdamW.
"""
from __future__ import annotations
import argparse, pathlib, torch
from torch.utils.data import DataLoader
from yrcnn.data.manager   import prepare_dataset
from yrcnn.data.datasets  import YoloToRcnnDataset
from yrcnn.models         import build

def _cli():
    p = argparse.ArgumentParser("train RCNN")
    p.add_argument("--data", required=True)
    p.add_argument("--model", default="rcnn")
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--batch",  type=int, default=4)
    p.add_argument("--device", default="cpu")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()

def _train_one_epoch(net, loader, opt, device):
    net.train(); tot = 0
    for imgs, tgts in loader:
        imgs = [i.to(device) for i in imgs]
        tgts = [{k:v.to(device) for k,v in t.items()} for t in tgts]
        loss_dict = net(imgs, tgts)
        loss = sum(loss_dict.values())
        opt.zero_grad(); loss.backward(); opt.step()
        tot += loss.item()
    return tot / len(loader)

def main():
    a = _cli()
    yaml_path = prepare_dataset(a.data)
    if a.dry_run:
        print(" dry‑run – dataset:", yaml_path)
        return

    ds_tr = YoloToRcnnDataset.from_yaml(yaml_path, "train")
    ds_va = YoloToRcnnDataset.from_yaml(yaml_path, "val")
    tr_loader = DataLoader(ds_tr, batch_size=a.batch, shuffle=True,
                           collate_fn=YoloToRcnnDataset.collate_fn)
    net = build(a.model, ds_tr.n_classes).to(a.device)
    opt = torch.optim.AdamW(net.parameters(), lr=1e-4)

    for ep in range(1, a.epochs+1):
        loss = _train_one_epoch(net, tr_loader, opt, a.device)
        print(f"[{ep:03d}/{a.epochs}] loss={loss:.4f}")

    out = pathlib.Path(f"runs/{a.data}"); out.mkdir(parents=True, exist_ok=True)
    torch.save(net.state_dict(), out/f"{a.model}_last.pt")

if __name__ == "__main__":     
    main()
