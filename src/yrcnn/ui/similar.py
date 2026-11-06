"""
FAISS‑powered k‑NN search + hierarchical agglomerative clustering (HAC)
on the multimodal embedding defined in features.py.
"""
from __future__ import annotations

import threading
from typing import Dict, List

import faiss
import numpy as np
from sklearn.cluster import AgglomerativeClustering

from .features import patient_vector
from .patient import list_patients

_LOCK = threading.Lock()
_index: faiss.IndexFlatIP | None = None
_vecs: list[np.ndarray] = []
_ids: list[str] = []


# -------------------- (re)build index ------------------------------- #
def _reindex(force: bool = False) -> None:
    global _index, _vecs, _ids

    if _index is not None and not force:
        return

    with _LOCK:
        pats = list_patients()
        _ids  = [p.id for p in pats]
        _vecs = [patient_vector(p) for p in pats]

        xb = np.vstack(_vecs).astype("float32")
        _index = faiss.IndexFlatIP(xb.shape[1])
        _index.add(xb)


# -------------------- public helpers -------------------------------- #
def most_similar(pid: str, k: int = 4) -> List[Dict]:
    """
    Returns [{'id': other_id, 'score': cosine_sim}, …] (k neighbours, self‑excluded)
    """
    _reindex()
    if pid not in _ids:
        return []

    i = _ids.index(pid)
    D, I = _index.search(_vecs[i][None], k + 1)

    out = []
    for dist, idx in zip(D[0][1:], I[0][1:]):  # skip itself
        out.append({"id": _ids[idx], "score": float(dist)})
    return out


def cluster_labels(n_clusters: int = 6) -> Dict[str, int]:
    """
    Returns {patient_id: cluster_label}.  Cached until refresh_vectors()
    is called.
    """
    _reindex()
    hac = AgglomerativeClustering(
        n_clusters=n_clusters,
        metric="cosine",
        linkage="average",
    )
    labels = hac.fit_predict(np.vstack(_vecs))
    return {pid: int(lbl) for pid, lbl in zip(_ids, labels)}


def refresh_vectors() -> None:
    """Call whenever images/PAR have changed."""
    _reindex(force=True)
