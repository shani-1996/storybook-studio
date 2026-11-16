import base64
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.engine import Face
from app.main import create_app
from app.scoring import cosine, mean_embedding, pairwise_min_similarity


def png_b64(w=100, h=100):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


class FakeEngine:
    def __init__(self, faces):
        self.faces = faces

    def detect(self, image_rgb):
        return self.faces


def face(vec, box=(10, 10, 60, 60)):
    return Face(box, np.array(vec, dtype=float), 0.99)


def test_cosine_identical_and_orthogonal():
    assert cosine(np.array([1.0, 0]), np.array([2.0, 0])) == pytest.approx(1.0)
    assert cosine(np.array([1.0, 0]), np.array([0, 1.0])) == pytest.approx(0.0)


def test_mean_embedding_is_unit_length():
    m = mean_embedding([np.array([1.0, 0]), np.array([0, 1.0])])
    assert np.linalg.norm(m) == pytest.approx(1.0)


def test_pairwise_min():
    e = [np.array([1.0, 0]), np.array([1.0, 0.1]), np.array([0, 1.0])]
    assert pairwise_min_similarity(e) == pytest.approx(0.0)


def test_detect_reports_normalised_box():
    c = TestClient(create_app(FakeEngine([face([1, 0])])))
    r = c.post("/detect", json={"image": png_b64()}).json()
    assert r["faces"] == 1
    assert r["boxes"][0]["w"] == pytest.approx(0.5)


def test_compare_same_face_scores_high():
    c = TestClient(create_app(FakeEngine([face([1, 0.01])])))
    r = c.post("/compare", json={"image": png_b64(), "references": [png_b64()]}).json()
    assert r["similarity"] > 0.99 and r["faces"] == 1


def test_compare_no_face():
    c = TestClient(create_app(FakeEngine([])))
    r = c.post("/compare", json={"image": png_b64(), "references": [png_b64()]})
    assert r.json()["faces"] == 0


def test_invalid_image_does_not_echo_input():
    c = TestClient(create_app(FakeEngine([])))
    r = c.post("/detect", json={"image": "not-an-image"})
    assert r.status_code == 400 and "not-an-image" not in r.text


def test_similarity_requires_one_face_per_photo():
    c = TestClient(create_app(FakeEngine([face([1, 0]), face([0, 1])])))
    assert c.post("/similarity", json={"images": [png_b64()]}).status_code == 422
