"""Pure math helpers (no ML imports) so they are unit-testable anywhere."""
from __future__ import annotations

import numpy as np


def l2_normalise(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    if n == 0:
        raise ValueError("zero-length embedding")
    return v / n


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(l2_normalise(a), l2_normalise(b)))


def mean_embedding(embeddings: list[np.ndarray]) -> np.ndarray:
    if not embeddings:
        raise ValueError("need at least one embedding")
    return l2_normalise(np.mean([l2_normalise(e) for e in embeddings], axis=0))


def pairwise_min_similarity(embeddings: list[np.ndarray]) -> float:
    """Lowest cosine between any two photos (used for the same-child check)."""
    lowest = 1.0
    for i in range(len(embeddings)):
        for j in range(i + 1, len(embeddings)):
            lowest = min(lowest, cosine(embeddings[i], embeddings[j]))
    return lowest
