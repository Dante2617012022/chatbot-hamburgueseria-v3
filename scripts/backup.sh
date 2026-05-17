#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"
DB_FILE="$PROJECT_DIR/data/database.sqlite"
DATE="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "No existe base de datos en: $DB_FILE"
  exit 0
fi

sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/database_$DATE.sqlite'"

echo "Backup creado:"
echo "$BACKUP_DIR/database_$DATE.sqlite"
