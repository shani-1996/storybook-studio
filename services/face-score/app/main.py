from __future__ import annotations

import base64
import io

import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

from .engine import FaceEngine
from .scoring import cosine, mean_embedding, pairwise_min_similarity


def decode(b64: str) -> np.ndarray:
    try:
        img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    except Exception as exc:  # never echo input data in errors
        raise HTTPException(status_code=400, detail="invalid image") from exc
    return np.asarray(img)


class DetectReq(BaseModel):
    image: str


class CompareReq(BaseModel):
    image: str
    references: list[str]


class SimilarityReq(BaseModel):
    images: list[str]


def create_app(engine: FaceEngine | None = None) -> FastAPI:
    app = FastAPI(title="face-score")
    state: dict[str, FaceEngine | None] = {"engine": engine}

    def get_engine() -> FaceEngine:
        if state["engine"] is None:
            from .engine import InsightFaceEngine

            state["engine"] = InsightFaceEngine()
        return state["engine"]  # type: ignore[return-value]

    def largest(faces):
        return max(faces, key=lambda f: (f.box[2] - f.box[0]) * (f.box[3] - f.box[1]))

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/detect")
    def detect(req: DetectReq):
        img = decode(req.image)
        h, w = img.shape[:2]
        faces = get_engine().detect(img)
        return {
            "faces": len(faces),
            "boxes": [
                {
                    "x": f.box[0] / w,
                    "y": f.box[1] / h,
                    "w": (f.box[2] - f.box[0]) / w,
                    "h": (f.box[3] - f.box[1]) / h,
                    "confidence": f.det_score,
                }
                for f in faces
            ],
        }

    @app.post("/compare")
    def compare(req: CompareReq):
        eng = get_engine()
        img = decode(req.image)
        w = img.shape[1]
        faces = eng.detect(img)
        if not faces:
            return {"similarity": -1.0, "faces": 0, "largestFaceWidthFraction": 0.0}
        main = largest(faces)
        refs = []
        for r in req.references:
            rf = eng.detect(decode(r))
            if len(rf) == 1:
                refs.append(rf[0].embedding)
        if not refs:
            raise HTTPException(status_code=422, detail="no usable reference faces")
        return {
            "similarity": cosine(main.embedding, mean_embedding(refs)),
            "faces": len(faces),
            "largestFaceWidthFraction": (main.box[2] - main.box[0]) / w,
        }

    @app.post("/embed")
    def embed(req: DetectReq):
        """512-d ArcFace embedding of the single face in a photo. Never logged."""
        faces = get_engine().detect(decode(req.image))
        if len(faces) != 1:
            raise HTTPException(status_code=422, detail="exactly one face required")
        return {"embedding": [float(x) for x in faces[0].embedding], "detectionScore": faces[0].det_score}

    @app.post("/similarity")
    def similarity(req: SimilarityReq):
        """Photo-set check: all photos must show the same child."""
        eng = get_engine()
        embs = []
        for b in req.images:
            fs = eng.detect(decode(b))
            if len(fs) != 1:
                raise HTTPException(status_code=422, detail="each photo needs exactly one face")
            embs.append(fs[0].embedding)
        return {"minSimilarity": pairwise_min_similarity(embs)}

    return app


app = create_app()
