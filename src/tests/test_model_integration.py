
import pytest
from yrcnn.data.manager import prepare_dataset
from yrcnn.data.datasets import YoloToRcnnDataset
from yrcnn.models.factory import build as build_model
import torch

@pytest.mark.parametrize("dataset_name", ["coco", "dentex"])
@pytest.mark.parametrize("model_name", ["yolo", "rcnn"])
def test_model_runs_on_dataset(dataset_name, model_name):
    """
    Loads each model on each dataset, grabs 1 sample, and checks forward pass.
    """
    yaml_path = prepare_dataset(dataset_name)
    ds = YoloToRcnnDataset.from_yaml(yaml_path, "train")
    assert len(ds) > 0, f"Dataset '{dataset_name}' is empty!"
    img, target = ds[0]
    imgs = [img.unsqueeze(0)]

    if model_name == "yolo":
        from ultralytics import YOLO
        model = YOLO("yolov8n.pt")
        import numpy as np
        img_np = img.permute(1,2,0).numpy() * 255
        img_np = img_np.astype(np.uint8)
        result = model.predict(img_np, verbose=False)
        assert len(result) > 0, "YOLO inference did not return any results."

    elif model_name == "rcnn":
        n_classes = ds.n_classes
        model = build_model("rcnn", num_classes=n_classes)
        model.eval()
        with torch.no_grad():
            output = model([img])
        assert isinstance(output, list) and len(output) == 1, "RCNN output is invalid."

    else:
        raise ValueError(model_name)

    print(f"{model_name.upper()} works on {dataset_name}")

