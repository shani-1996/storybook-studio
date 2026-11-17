# Preview worker (Cloud Run): runs the free preview job and renders pages with Chromium.
# Built from the folder that `node stage.mjs` assembles.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY dist ./dist
COPY fonts ./fonts
COPY content ./content
ENV NODE_ENV=production CHROME_PATH=/usr/bin/chromium CONTENT_DIR=/app/content/stories/when-i-grow-up
# Cloud Run sets PORT. Chromium needs its own writable home.
ENV HOME=/tmp
CMD ["node", "dist/server.mjs"]
