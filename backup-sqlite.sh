#!/usr/bin/env bash
set -euo pipefail

# Container name and DB path inside the container
CONTAINER_NAME="${CONTAINER_NAME:-easysheets-app-1}"
DB_PATH_IN_CONTAINER="${DB_PATH_IN_CONTAINER:-/data/sqlite.db}"

# Optional first argument: backup directory (defaults to ./backups)
BACKUP_DIR="${1:-./backups}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/sqlite-$TIMESTAMP.db"

echo "Backing up SQLite DB from ${CONTAINER_NAME}:${DB_PATH_IN_CONTAINER} to $BACKUP_FILE..."

docker cp "${CONTAINER_NAME}:${DB_PATH_IN_CONTAINER}" "$BACKUP_FILE"

echo "Backup complete: $BACKUP_FILE"

