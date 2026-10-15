#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p deploy/backups
backup="deploy/backups/smartcampuspay-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
docker compose --env-file .env.production -f compose.production.yaml exec -T db \
  pg_dump -U postgres -d smartcampuspay -Fc > "$backup.partial"
test -s "$backup.partial"
mv "$backup.partial" "$backup"
printf 'Backup created: %s\nCopy encrypted backup off this server and verify restore.\n' "$backup"
