FROM python:3.12-slim AS dependencies

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/install/lib/python3.12/site-packages \
    PATH=/install/bin:$PATH

WORKDIR /app
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

FROM dependencies AS development
ENV AI_CHROMA_PATH=/data/chroma \
    AI_EMBEDDING_DEVICE=cpu
COPY requirements-dev.txt .
RUN pip install --prefix=/install -r requirements-dev.txt
COPY app ./app
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--no-access-log"]

FROM python:3.12-slim AS production
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/install/lib/python3.12/site-packages \
    PATH=/install/bin:$PATH \
    AI_CHROMA_PATH=/data/chroma \
    AI_EMBEDDING_DEVICE=cpu \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY --from=dependencies /install /install
COPY app ./app
RUN groupadd --system --gid 10001 fixflow \
    && useradd --system --uid 10001 --gid fixflow --no-create-home fixflow \
    && mkdir -p /data/chroma \
    && chown -R fixflow:fixflow /app /data/chroma /install
USER 10001:10001

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--timeout-keep-alive", "5"]
