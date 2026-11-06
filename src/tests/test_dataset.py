"""
Structural sanity checks – run with  `pytest -q`
"""
from pathlib import Path
import pytest

from yrcnn.data.datasets import YoloToRcnnDataset
from yrcnn.data.manager  import prepare_dataset


@pytest.mark.parametrize("name", ["dentex", "coco"])
@pytest.mark.parametrize("split", ["train", "val"])
def test_not_empty(name: str, split: str):
    yaml_p = prepare_dataset(name)
    ds = YoloToRcnnDataset.from_yaml(yaml_p, split)
    assert len(ds) > 0, f"{name}:{split} split is empty"
    img, tgt = ds[0]
    assert img is not None and "boxes" in tgt
