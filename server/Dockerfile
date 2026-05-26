FROM node:22-bookworm-slim

WORKDIR /app/server

ARG APP_ENV=local
ENV APP_ENV=${APP_ENV}
ENV PORT=8000
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/pnpm-lock.yaml ./
COPY server/prisma ./prisma

RUN pnpm install --frozen-lockfile

COPY server ./
COPY shared ../shared

RUN pnpm prisma generate && pnpm build

ENV NODE_ENV=production

EXPOSE 8000

CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/server/src/index.js"]
