"""
Patient CRUD + file storage helpers.
Images are written to
    data/patients/<patient_id>/<original_file_name>
and a tiny SQLite catalogue keeps meta‑data.
"""
from __future__ import annotations

from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel
from sqlmodel import Field, Session, SQLModel, create_engine, select

# --------------------------------------------------------------------- #
# configuration
# --------------------------------------------------------------------- #

DATA_ROOT = Path("data") / "patients"
DATA_ROOT.mkdir(parents=True, exist_ok=True)

_db = create_engine("sqlite:///data/patients.sqlite", echo=False)
SQLModel.metadata.create_all(_db)  # creates the table on first run


# --------------------------------------------------------------------- #
# SQLModel table + outbound schema
# --------------------------------------------------------------------- #

class Patient(SQLModel, table=True):
    # ---- required ----
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    name: str

    # ---- optional demo fields ----
    age: int | None = None
    sex: str | None = None                  # "M" | "F"
    malocclusion: str | None = None         # "I" | "II" | "III"
    condition: str | None = None            # free text

    # ---- AI results (JSON) ----
    par: dict | None = None                 # {component: score}


class PatientOut(BaseModel):
    id: str
    name: str
    age: int | None
    sex: str | None
    malocclusion: str | None
    condition: str | None
    par: dict | None
    images: List[str] = []                  # relative paths → UI


# --------------------------------------------------------------------- #
# public helpers
# --------------------------------------------------------------------- #

def create_patient(name: str, age: int | None, condition: str | None) -> Patient:
    with Session(_db) as s:
        p = Patient(name=name, age=age, condition=condition)
        s.add(p)
        s.commit()
        s.refresh(p)
    (DATA_ROOT / p.id).mkdir(parents=True, exist_ok=True)
    return p


def list_patients() -> list[PatientOut]:
    with Session(_db) as s:
        rows = s.exec(select(Patient)).all()
    return [_to_out(r) for r in rows]


def get_patient(pid: str) -> PatientOut:
    with Session(_db) as s:
        row = s.get(Patient, pid)
    if row is None:
        raise HTTPException(404, f"patient {pid} not found")
    return _to_out(row)


def patch_patient(pid: str, **kwargs) -> PatientOut:
    """Partial update."""
    with Session(_db) as s:
        p = s.get(Patient, pid)
        if p is None:
            raise HTTPException(404)
        for k, v in kwargs.items():
            if v is not None and hasattr(p, k):
                setattr(p, k, v)
        s.add(p)
        s.commit()
        s.refresh(p)
    return _to_out(p)


def upload_image(pid: str, up: UploadFile) -> str:
    """
    Save original file under the patient folder.
    Returns *relative* path for the GUI.
    """
    p_dir = DATA_ROOT / pid
    if not p_dir.exists():
        raise HTTPException(404, f"patient {pid} not found")

    dst = p_dir / up.filename.replace(" ", "_")
    Image.open(up.file).convert("RGB").save(dst)
    return str(dst.relative_to(DATA_ROOT.parent))


# --------------------------------------------------------------------- #
# internal
# --------------------------------------------------------------------- #

def _to_out(row: Patient) -> PatientOut:
    imgs = sorted((DATA_ROOT / row.id).glob("*.[jp][pn]g"))
    return PatientOut(
        id=row.id,
        name=row.name,
        age=row.age,
        sex=row.sex,
        malocclusion=row.malocclusion,
        condition=row.condition,
        par=row.par,
        images=[str(i.relative_to(DATA_ROOT.parent)) for i in imgs],
    )
