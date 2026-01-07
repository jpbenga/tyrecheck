# TyreCheck all-in-one: Node (serves Angular + API) + Python (predict.py)
FROM node:20.18.1-bullseye-slim

# System deps for Python + basic image libs
RUN apt-get update && apt-get install -y \
    python3 python3-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (better cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy Angular project and build it
COPY tyrecheck-pwa ./tyrecheck-pwa
WORKDIR /app/tyrecheck-pwa
RUN npm ci --omit=dev && npm run build -- --configuration production

# Back to app root
WORKDIR /app

# Copy Python artifacts + server
COPY predict.py labels.json tyre_quality_model.keras server.js ./

# Python venv + deps
RUN python3 -m venv .venv \
 && ./.venv/bin/pip install --upgrade pip \
 && ./.venv/bin/pip install --no-cache-dir tensorflow==2.16.1 numpy pillow

ENV NODE_ENV=production
ENV PYTHON_BIN=/app/.venv/bin/python3
ENV ANGULAR_DIST=/app/tyrecheck-pwa/dist/tyrecheck-pwa/browser

# Render provides $PORT
EXPOSE 3000
CMD ["node", "server.js"]
