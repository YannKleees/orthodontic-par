"""
Terminal UI for yrcnn: choose datasets, models, hyperparameters with a menu.
"""

import subprocess
import sys
import questionary
from questionary import Choice
import wandb

PY = sys.executable

def run_cmd(cmd):
    """Prints and runs a shell command."""
    print("\n>", " ".join(cmd), "\n")
    subprocess.run(cmd, check=True)

def main():
    cmd = questionary.select(
        "What do you want to do?",
        choices=[
            Choice("Train a model", "train"),
            Choice("Visualize samples", "viz"),
            Choice("Run inference", "infer"),
            Choice("Quit", "quit"),
        ],
    ).ask()

    if cmd == "quit" or cmd is None:
        sys.exit(0)

    dataset = questionary.select(
        "Dataset",
        choices=[Choice(d, d) for d in ["coco", "dentex", "local"]],
    ).ask()

    if cmd == "train":
        model = questionary.select(
            "Model architecture",
            choices=[Choice("yolo", "yolo"), Choice("rcnn", "rcnn")],
        ).ask()
        epochs = questionary.text("Epochs", default="5").ask()
        batch  = questionary.text("Batch size", default="8").ask()
        device = questionary.text("Device", default="cpu").ask()
        dry    = questionary.confirm("Dry run?", default=False).ask()

        wandb.init(project="yrcnn", config={
            "dataset": dataset,
            "model":   model,
            "epochs":  int(epochs),
            "batch":   int(batch),
            "device":  device,
            "dry_run": dry,
        })

        cmd_list = [
            PY, "-m",
            "yrcnn.training.train_yolo" if model.startswith("yolo") else "yrcnn.training.train_rcnn",
            "--data",   dataset,
            "--model",  model,
            "--epochs", epochs,
            "--batch",  batch,
            "--device", device,
        ]
        if dry:
            cmd_list.append("--dry-run")

        run_cmd(cmd_list)
        print("Training launched!")

    elif cmd == "viz":
        n      = questionary.text("How many samples to show?", default="5").ask()
        device = questionary.text("Device", default="cpu").ask()

        run_cmd([
            PY, "-m", "yrcnn.utils.viz",
            "--data",  dataset,
            "--n",     n,
            "--device",device,
        ])
        print("Visualization done!")

    elif cmd == "infer":
        weights = questionary.text("Path to weights file", default="best.pt").ask()
        source  = questionary.text("Source (image/video/folder)", default="images/").ask()
        device  = questionary.text("Device", default="cpu").ask()

        run_cmd([
            PY, "-m", "yrcnn.training.inference",
            "--weights", weights,
            "--source",  source,
            "--device",  device,
        ])
        print("Inference complete!")

if __name__ == "__main__":
    main()
