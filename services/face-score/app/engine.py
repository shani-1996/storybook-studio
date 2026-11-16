"""Face detection and embedding. InsightFace is imported lazily so tests can use a fake."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np


@dataclass
class Face:
    box: tuple[float, float, float, float]  # x1, y1, x2, y2 in pixels
    embedding: np.ndarray
    det_score: float


class FaceEngine(Protocol):
    def detect(self, image_rgb: np.ndarray) -> list[Face]: ...


class InsightFaceEngine:
    def __init__(self) -> None:
        from insightface.app import FaceAnalysis  # heavy import, deferred

        self._app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        self._app.prepare(ctx_id=-1, det_size=(640, 640))

    def detect(self, image_rgb: np.ndarray) -> list[Face]:
        bgr = image_rgb[:, :, ::-1]
        return [
            Face(tuple(map(float, f.bbox)), np.asarray(f.normed_embedding), float(f.det_score))
            for f in self._app.get(bgr)
        ]
