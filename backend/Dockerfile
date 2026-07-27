# ThoughtStack API + BullMQ worker — production image (Linux/amd64)
# Build:  docker build -t thoughtstack-backend ./backend
# Run API:    docker run --env-file .env -p 4000:4000 thoughtstack-backend
# Run worker: docker run --env-file .env thoughtstack-backend node dist/worker.js

FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src

RUN ./node_modules/.bin/prisma generate \
  && npm run build \
  && npm prune --omit=dev


FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    RUN_MIGRATIONS=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R node:node /app

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/package-lock.json ./
COPY --from=build --chown=node:node /app/.npmrc ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
