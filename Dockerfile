FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ARG APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm run verify:runtime

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 APP_VERSION=${APP_VERSION}
ENV SQLITE_PATH=/data/spendee.db ACTUAL_DATA_DIR=/data/actual RECEIPTS_DIR=/data/receipts
RUN apt-get update && apt-get install -y --no-install-recommends curl poppler-utils \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/actual /data/receipts && chown -R node:node /data
COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/scripts/verify-runtime-build.mjs ./scripts/verify-runtime-build.mjs
RUN node scripts/verify-runtime-build.mjs /app
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD curl --fail --silent --show-error --output /dev/null http://127.0.0.1:3000/api/ready
CMD ["node", "server.js"]
