"""
Quick smoke test for the PAR‑augmented Faster R‑CNN model.

Run from the project root:
    python test_par_model.py

Expected output (example):
    Loss keys: dict_keys(['loss_classifier', 'loss_box_reg', 'loss_objectness',
                          'loss_rpn_box_reg', 'loss_par'])
    Smoke test passed ✔

Adjust `DS_NC` if your dataset has more object classes.
"""

import torch
from yrcnn.models.factory import build

# -----------------------------------------------------------------------------
# CONFIG
# -----------------------------------------------------------------------------
# Number of foreground classes (exclude background)
DS_NC = 1  # ← change if your dataset has >1 class

# -----------------------------------------------------------------------------
# MAIN
# -----------------------------------------------------------------------------

def main():
    # Build the PAR‑aware detector (+1 for explicit background class)
    net = build("fasterrcnn_resnet50_fpn_par", num_classes=DS_NC + 1)
    net.train()

    # Dummy mini‑batch (1 image)
    imgs = [torch.randn(3, 640, 640)]
    targets = [{
        "boxes":  torch.tensor([[100., 100., 200., 200.]]),
        "labels": torch.tensor([1]),
        "par":    torch.tensor(12.3),  # arbitrary PAR score
    }]

    # Forward + loss dict
    losses = net(imgs, targets)
    print("Loss keys:", losses.keys())

    # Sanity check
    assert "loss_par" in losses, "loss_par missing – check model wiring!"
    print("Smoke test passed \u2714")


if __name__ == "__main__":
    main()
