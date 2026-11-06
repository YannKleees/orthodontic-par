import pytest, torch, pathlib, json
from yrcnn.data.datasets import YoloToRcnnDataset
from yrcnn.data.manager  import prepare_dataset
from yrcnn.training.inference import run_inference_on_files

@pytest.fixture(scope="session", params=["coco", "dentex"])
def _dataset_meta(request):
    yaml_p = prepare_dataset(request.param)
    ds      = YoloToRcnnDataset.from_yaml(yaml_p, "val")
    root    = pathlib.Path(yaml_p).parent
    return request.param, ds, root

@pytest.fixture(scope="session", params=["yolo", "rcnn", "fasterrcnn_resnet50_fpn"])
def _model_id(request):
    return request.param
