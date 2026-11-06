from __future__ import annotations

from typing import Dict, List

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from .patient import (
    _db,
    create_patient,
    get_patient,
    list_patients,
    patch_patient,
    upload_image,
)
from .similar import cluster_labels, most_similar, refresh_vectors

app = FastAPI(
    title="YRCNN Orthodontic API",
    version="0.9.0",
    docs_url="/",
)

# ------------------------------------------------------------------ #
# CORS – give React dev‑server access during local development
# ------------------------------------------------------------------ #
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------ #
# patient CRUD
# ------------------------------------------------------------------ #
@app.post("/api/patient", response_model=dict)
def api_create_patient(
    name: str = Form(...),
    age: int | None = Form(None),
    condition: str | None = Form(None),
):
    p = create_patient(name, age, condition)
    return {"id": p.id}


@app.get("/api/patient", response_model=List[dict])
def api_list_patients():
    return [p.dict() for p in list_patients()]


@app.get("/api/patient/{pid}", response_model=dict)
def api_get_patient(pid: str):
    return get_patient(pid).dict()


@app.patch("/api/patient/{pid}", response_model=dict)
def api_update_patient(
    pid: str,
    par: Dict | None = Body(None),
    sex: str | None = Body(None),
    age: int | None = Body(None),
    malocclusion: str | None = Body(None),
    condition: str | None = Body(None),
):
    out = patch_patient(
        pid,
        par=par,
        sex=sex,
        age=age,
        malocclusion=malocclusion,
        condition=condition,
    )
    refresh_vectors()
    return out.dict()


# ------------------------------------------------------------------ #
# file upload
# ------------------------------------------------------------------ #
@app.post("/api/patient/{pid}/upload", response_model=dict)
def api_upload(pid: str, file: UploadFile = File(...)):
    rel_path = upload_image(pid, file)
    refresh_vectors()
    return {"path": rel_path}


# ------------------------------------------------------------------ #
# search / cluster
# ------------------------------------------------------------------ #
@app.post("/api/similar", response_model=List[Dict])
def api_similar(pid: str = Form(...), top_k: int = Form(4)):
    return most_similar(pid, k=top_k)


@app.get("/api/cluster", response_model=Dict)
def api_cluster():
    return cluster_labels()


@app.post("/api/reindex", status_code=204)
def api_reindex():
    refresh_vectors()


# ------------------------------------------------------------------ #
# tiny health check
# ------------------------------------------------------------------ #
@app.get("/ping")
def api_ping():
    return {"status": "ok"}
