# Face scoring service (Cloud Run, CPU, scale to zero). See docs/decisions.md about the model licence.
FROM python:3.12-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libgl1 libglib2.0-0 libxcb1 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-ml.txt

# Bake the model weights into the image so cold starts do not download 300 MB.
ENV INSIGHTFACE_HOME=/models
RUN python -c "from insightface.app import FaceAnalysis; a=FaceAnalysis(name='buffalo_l', root='/models', providers=['CPUExecutionProvider']); a.prepare(ctx_id=-1, det_size=(640,640))"

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libxcb1 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=build /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY --from=build /models /models
COPY app ./app
ENV INSIGHTFACE_HOME=/models PYTHONUNBUFFERED=1
# Cloud Run sets PORT. One worker: the model is loaded once per instance.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
