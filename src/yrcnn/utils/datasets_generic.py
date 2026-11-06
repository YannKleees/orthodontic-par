# yrcnn/utils/datasets_generic.py
"""
Generic helper for Hugging Face image datasets
==============================================

Highlights
----------
* Handles **different builders for different splits** out‑of‑the‑box.
  (DENTEX uses `imagefolder` for the image ZIPs but `json` for the label
  metadata in *validation* – this is now resolved automatically.)
* Silently skips a split when it really cannot be loaded instead of
  crashing the whole call.
* Keeps the “required, non‑null column” filter so that
  `DatasetInspector(...).run_all()` continues to work.

Typical use
-----------
>>> from yrcnn.utils.datasets_generic import HFImageDataset
>>> dentex = HFImageDataset("ibrahimhamamci/DENTEX")   # 1‑liner
>>> print(dentex)                                      # quick overview
>>> DatasetInspector(dentex).run_all()                 # your smoke‑test
"""

from __future__ import annotations

from typing import Dict, Iterable, Mapping, Sequence, Union, List

from datasets import DatasetDict, load_dataset
from PIL import Image




def _auto_try_builders(
    repo_id: str,
    split: str,
    builders_to_try: List[str],
    **hf_kw,
):
    """Try a list of builders until one works – returns (dataset, builder)."""
    last_exc: Exception | None = None
    for b in builders_to_try:
        try:
            ds_split = load_dataset(
                repo_id,
                name=b,
                split=split,
                trust_remote_code=True,
                **hf_kw,
            )
            return ds_split, b
        except Exception as exc:
            last_exc = exc

    raise RuntimeError(
        f"None of the builders {builders_to_try} worked for split "
        f"'{split}' of '{repo_id}'. Last error was:\n{last_exc}"
    ) from last_exc


# ---------------------------------------------------------------------------


class HFImageDataset:
    """
    Thin convenience wrapper around 🤗 `load_dataset` with built‑in resilience.

    Parameters
    ----------
    repo_id
        HuggingFace Hub dataset, e.g. ``"ibrahimhamamci/DENTEX"``.
    splits
        Candidate split names to attempt. Default:
        ``("train", "validation", "test")``.
    builders
        * **str** – use the same builder for *all* splits.
        * **dict** – mapping ``split → builder``.
          Any split not explicitly listed will fall back to the first value
          contained in the mapping, or to ``"imagefolder"``.
    keep_cols
        Columns that must be present **and non‑null**.  Can be specified
        globally (sequence) or per split (dict).
    try_extra_builders
        Extra builder names (in *order*) that are attempted **per split**
        if the preferred builder fails.  Good defaults are already provided.
    **hf_kw
        Passed straight through to `datasets.load_dataset`, e.g.
        ``streaming=True``, ``cache_dir="…"`` …
    """

    # sensible defaults that cover 99 % of real‑world cases
    _FALLBACK_BUILDERS = ["imagefolder", "json", "parquet"]

    # ------------------------------------------------------------------ #
    def __init__(
        self,
        repo_id: str,
        *,
        splits: Iterable[str] = ("train", "validation", "test"),
        builders: Union[str, Mapping[str, str]] = "imagefolder",
        keep_cols: Union[Sequence[str], Mapping[str, Sequence[str]]] = ("image",),
        try_extra_builders: Sequence[str] | None = None,
        **hf_kw,
    ) -> None:
        self.repo_id = repo_id
        self._hf_kw = hf_kw

        # ---- normalise *builders* argument --------------------------- #
        if isinstance(builders, str):
            self.builders: Dict[str, str] = {s: builders for s in splits}
        else:
            default_builder = next(iter(builders.values()), "imagefolder")
            self.builders = {s: builders.get(s, default_builder) for s in splits}

        # ---- normalise *keep_cols* argument -------------------------- #
        if isinstance(keep_cols, Mapping):
            self.keep_cols = {s: tuple(keep_cols.get(s, ())) for s in splits}
        else:
            self.keep_cols = {s: tuple(keep_cols) for s in splits}

        # ---- prepare builder fall‑back list -------------------------- #
        self._fallback = list(dict.fromkeys(  # remove duplicates, keep order
            [*self._FALLBACK_BUILDERS, *(try_extra_builders or [])]
        ))

        # ---- actually load the data ---------------------------------- #
        self.ds: DatasetDict = DatasetDict()
        for split in splits:
            preferred = self.builders[split]
            builders_to_try = [preferred] + [
                b for b in self._fallback if b != preferred
            ]

            try:
                ds_split, ok_builder = _auto_try_builders(
                    repo_id, split, builders_to_try, **hf_kw
                )
            except RuntimeError as exc:
                # Truly not available – just skip so the rest still loads
                print(f"[HFImageDataset] skip '{split}' – {exc}")
                continue

            # Enforce column sanity
            req_cols = self.keep_cols[split]
            missing = [c for c in req_cols if c not in ds_split.column_names]
            if missing:
                raise KeyError(
                    f"Split '{split}' (builder={ok_builder}) is missing "
                    f"required column(s): {', '.join(missing)}"
                )

            if req_cols:
                ds_split = ds_split.filter(
                    lambda ex: all(ex[c] is not None for c in req_cols)
                )

            self.ds[split] = ds_split
            self.builders[split] = ok_builder  # record final builder

        if not self.ds:
            raise RuntimeError(
                f"No usable splits found for '{repo_id}'. "
                "Check builder/split names, your network connection "
                "or raise an issue upstream."
            )

    # ------------------------------------------------------------------ #
    # Friendly helpers
    # ------------------------------------------------------------------ #
    def __getitem__(self, split: str):
        return self.ds[split]

    def as_pil(self, split: str, idx: int) -> Image.Image:
        """Quick visualisation helper – returns a **PIL.Image** object."""
        return self.ds[split][idx]["image"]

    # pretty print
    def __repr__(self) -> str:
        info = [f"HFImageDataset<{self.repo_id}>"]
        for s, d in self.ds.items():
            b = self.builders.get(s, "?")
            info.append(f"  • {s:10} {len(d):6} samples   (builder = {b})")
        return "\n".join(info)
