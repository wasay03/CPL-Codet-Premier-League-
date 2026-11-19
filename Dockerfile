# Stage 1: build the React app
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# Stage 2: Python API that also serves the built SPA
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    STATIC_DIR=/app/static
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install .
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./
COPY --from=web /web/dist ./static

RUN useradd --create-home --uid 1000 cpl && chown -R cpl /app
USER cpl

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --limit-concurrency 1000 --timeout-keep-alive 5 --ws-max-size 65536 --ws-ping-interval 20 --ws-ping-timeout 20"]
