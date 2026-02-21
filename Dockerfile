# Stage 1: Build
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Stage 2: Run
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

ENV NODE_ENV=production
# Default DB path so migrate and app use the same volume DB even if env isn't passed
ENV DB_PATH=file:/data/sqlite.db
# Ensure Unicode (e.g. emoji, accents) is handled correctly in the container
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/build ./build
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && node build/index.js"]
