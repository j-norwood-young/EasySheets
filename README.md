# EasySheets

A lightweight spreadsheet app: create sheets, edit cells, set column types (string, number, date, currency, boolean), and share via links with read, append, or edit permissions. Data is stored in SQLite.

## Features

- **Sheets** — Create blank sheets or import from CSV.
- **Columns** — Configure types (string, number, date, datetime, currency, boolean) and optional display format (e.g. currency symbol, decimal places).
- **Share links** — Generate share links with `read`, `append`, or `edit` permission; share-only URLs work without logging in.

## Prerequisites

- Node.js 18+
- pnpm (or npm / yarn)

## Setup

1. **Clone and install**

    ```sh
    pnpm install
    ```

2. **Environment (optional)**

    Copy `.env.example` to `.env` and set the database path if you don’t want the default:

    ```sh
    cp .env.example .env
    ```

    Default database path: `./data/sqlite.db`. Override with `DB_PATH` (file path or `file:...` URL).

## Database

The app uses **Drizzle** with SQLite (via libsql). Migrations live in `./drizzle/`.

- **Apply migrations** (e.g. after pull or schema changes):

    ```sh
    pnpm db:migrate
    ```

- **Generate new migrations** after editing `src/lib/server/db/schema.ts`:

    ```sh
    pnpm db:generate
    pnpm db:migrate
    ```

- **Push schema without migration files** (dev/prototyping only):

    ```sh
    pnpm db:push
    ```

Ensure the directory for your database file exists (e.g. `./data/`) or the first run may create it depending on your setup.

## Development

```sh
pnpm dev
```

Runs the SvelteKit dev server (default: http://localhost:5173).

## Build

```sh
pnpm build
```

Output is in `build/` (or your adapter’s output directory). Preview the production build:

```sh
pnpm preview
```

## Docker

Images are published to `harbor.10layer.com/sovereignoffice/easysheets`.

### Run from the registry

Use the base Compose file to pull and run the image (no build):

```sh
cp .env.example .env   # optional: configure DB_PATH, etc.
docker compose up -d
```

App is available at http://localhost:3000 (override port with `PORT`, e.g. `PORT=8080 docker compose up -d` or change in .env). Use `IMAGE_TAG` to run a specific tag:

```sh
IMAGE_TAG=0.0.1 docker compose up -d
```

### Build with Docker Compose

To build the image locally and run it (e.g. for development or before pushing):

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d
```

### Build and push to Harbor (deploy script)

From the project root, build, tag, and push to Harbor:

```sh
./deploy           # tag "latest"
./deploy 0.0.1     # specific tag
./deploy $(git rev-parse --short HEAD)
```

Log in first: `docker login harbor.10layer.com`.

### Environment

- `DB_PATH` — Database path (default: `file:/data/sqlite.db`). The Compose stack mounts a volume at `/data`.
- `PORT` — Host port to publish (default: `3000`).
- `IMAGE_TAG` — Image tag when using `docker compose` (default: `latest`).

## Scripts

| Script             | Description                      |
| ------------------ | -------------------------------- |
| `pnpm dev`         | Start dev server                 |
| `pnpm build`       | Production build                 |
| `pnpm preview`     | Preview production build         |
| `pnpm db:generate` | Generate Drizzle migrations      |
| `pnpm db:migrate`  | Run Drizzle migrations           |
| `pnpm db:push`     | Push schema (no migration files) |
| `pnpm check`       | Type-check (Svelte + TS)         |
| `pnpm lint`        | Lint (Prettier + ESLint)         |
| `pnpm test`        | E2E tests (Playwright)           |
