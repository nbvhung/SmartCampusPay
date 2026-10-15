#!/usr/bin/env bash
# Read-only checks before migration/deploy; never prints resolved Compose secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
test -f .env.production || { echo 'Missing .env.production. Run deploy/init-env.py first.'; exit 1; }
docker version --format '{{.Server.Version}}' >/dev/null
docker compose version
docker compose --env-file .env.production -f compose.production.yaml config --quiet
mapfile -t images < <(docker compose --env-file .env.production -f compose.production.yaml config --images)
for image in "${images[@]}"; do
  case "$image" in
    */backend:*|*/frontend:*)
      docker image inspect "$image" >/dev/null || { echo "Missing application image: $image. Load the tested artifact first."; exit 1; }
      ;;
  esac
done
echo 'Preflight passed: Docker, Compose config, and application images available.'
echo 'This check does not validate DNS, TLS, backups, migrations or banking.'
