from yrcnn.utils.datasets_generic import HFImageDataset

dentex = HFImageDataset("ibrahimhamamci/DENTEX")
print(dentex)                                      

DatasetInspector(dentex).run_all()
