"""
Dentex downloader – updated 2025-07-02
"""
from __future__ import annotations
import logging, os, shutil, zipfile
from pathlib import Path
import yaml
import os

log = logging.getLogger(__name__)

DATA_DIR = Path("data")
RAW_DIR  = DATA_DIR / "dentex"
CFG_DIR  = Path("configs")
CFG_DIR.mkdir(exist_ok=True, parents=True)



# download helpers


def _unzip_all_zips(root: Path) -> None:
    """Unpack every *.zip in *root* (recursively) and delete the ZIPs."""
    for z in root.rglob("*.zip"):
        try:
            with zipfile.ZipFile(z) as zf:
                zf.extractall(z.parent)
            z.unlink()
        except zipfile.BadZipFile:
            log.warning("Bad ZIP skipped: %s", z)


def _download_kaggle(tmp: Path) -> bool:
    try:
        import kaggle
        kaggle.api.authenticate()
        kaggle.api.dataset_download_files(
            "truthisneverlinear/dentex-challenge-2023",
            path=tmp,
            unzip=True,
        )
        _unzip_all_zips(tmp)
        return True
    except Exception as e:
        log.warning("Kaggle download failed: %s", e)
        return False

def _download_hf(tmp: Path) -> bool:
    """
    Try Hugging Face Hub first.  We now pre-set a few env-vars so that
    snapshot_download() can **resume** large files and retry transparently.
    """

    defaults = {
        "HF_HUB_ENABLE_DOWNLOAD_RESUME": "1",   
        "HF_HUB_DOWNLOAD_RETRY"        : "10",  
    }
    if os.getenv("HF_HUB_DISABLE_PROGRESS_BARS") is None:
        defaults["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"

    for k, v in defaults.items():
        os.environ.setdefault(k, v)
   

    try:
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id="ibrahimhamamci/DENTEX",
            repo_type="dataset",
            local_dir=tmp,
            local_dir_use_symlinks=False,
        )
        _unzip_all_zips(tmp)
        _flatten_yolo_folders(tmp)
        return True
    except Exception as e:
        log.warning("HF download failed: %s", e)
        return False


# demo fallback


def _write_demo(tmp: Path) -> None:
    from PIL import Image, ImageDraw
    (tmp / "images").mkdir(parents=True, exist_ok=True)
    (tmp / "labels").mkdir(exist_ok=True)
    for i in range(5):
        img = Image.new("RGB", (640, 480), (40, 40, 40))
        drw = ImageDraw.Draw(img)
        drw.rectangle([190, 180, 450, 300], outline="white", width=3)
        img.save(tmp / "images" / f"demo_{i:03d}.jpg")
        (tmp / "labels" / f"demo_{i:03d}.txt").write_text("0 0.50 0.50 0.40 0.25\n")
    (tmp / "labels" / "classes.txt").write_text("tooth\n")


# Helper

def _flatten_yolo_folders(root: Path) -> None:
    """
    After extraction DENTEX looks like::

        train/images/*.jpg   train/labels/*.txt
        val/images/*.jpg     val/labels/*.txt
        test/images/*.jpg    test/labels/*.txt

    YRCNN expects a single ``images/`` + ``labels/`` at the root.
    """
    img_flat = root / "images";  img_flat.mkdir(exist_ok=True)
    lbl_flat = root / "labels";  lbl_flat.mkdir(exist_ok=True)

    
    for img in root.rglob("*.[jp][pn]g"):
        if img_flat in img.parents:
            continue
        shutil.move(img.as_posix(), (img_flat / img.name).as_posix())

    
    for lbl in root.rglob("*.txt"):
        if lbl_flat in lbl.parents:
            continue
        target = lbl_flat / ("classes.txt" if lbl.name == "classes.txt" else lbl.name)
        shutil.move(lbl.as_posix(), target.as_posix())

    
    for p in root.glob("*"):
        if p.is_dir() and p.name not in ("images", "labels"):
            shutil.rmtree(p, ignore_errors=True)



def ensure_dentex(*, allow_demo: bool = True) -> Path:
    """
    Ensure Dentex is present and return ``configs/dentex.yaml``.

    If online mirrors fail and *allow_demo* (or env var ``DENTEX_ALLOW_DEMO``)
    is **True**, a tiny demo set with 5 images is created instead.
    """
    allow_demo = allow_demo and os.getenv("DENTEX_ALLOW_DEMO", "1") != "0"
    yaml_out = CFG_DIR / "dentex.yaml"

    if yaml_out.exists():
        meta = yaml.safe_load(yaml_out.read_text())
        train_dir = Path(meta["path"]) / "images" / "train"
        if train_dir.exists() and any(train_dir.iterdir()):
            return yaml_out
        yaml_out.unlink()

    tmp = DATA_DIR / "_dentex_tmp"
    tmp.mkdir(parents=True, exist_ok=True)

    got_real = _download_kaggle(tmp) or _download_hf(tmp)
    if not got_real:
        if not allow_demo:
            raise RuntimeError(
                "Dentex download failed and demo generation disabled "
                "(set DENTEX_ALLOW_DEMO=1 to enable)."
            )
        log.warning("Falling back to tiny in-mem demo set (5 images).")
        _write_demo(tmp)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for kind in ("images", "labels"):
        dest = RAW_DIR / kind
        if dest.exists():
            shutil.rmtree(dest)
        shutil.move((tmp / kind).as_posix(), dest.as_posix())
    shutil.rmtree(tmp)

    # 80/10/10 split
    from .manager import _split_into_interim
    interim = _split_into_interim(RAW_DIR, "dentex")

    cls_file = RAW_DIR / "labels/classes.txt"
    names = cls_file.read_text().splitlines() if cls_file.exists() else ["tooth"]
    yaml_out.write_text(
        yaml.dump(
            dict(
                path=str(interim),
                train="images/train",
                val="images/val",
                test="images/test",
                nc=len(names),
                names=names,
            ),
            sort_keys=False,
        )
    )
    return yaml_out
