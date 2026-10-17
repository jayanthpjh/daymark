#!/usr/bin/env bash
# Run on the VM from the repo checkout: pulls, builds the UI, restarts the stack. Rolls back the checkout if the stack is unhealthy.
set -euo pipefail
cd "$(dirname "$0")/../.."
before=$(git rev-parse HEAD)
git pull --ff-only
if [ -f package.json ] && grep -q '"web:build"' package.json; then
  docker run --rm -v "$PWD":/app -w /app node:22-bookworm-slim sh -c 'npm ci && npm run web:build'
fi
docker compose --env-file .env.oci -f docker-compose.oci.yml up -d --build
for i in $(seq 1 30); do
  if curl -fsS "http://$(grep '^TAILSCALE_IP=' .env.oci | cut -d= -f2):4173/api/health" >/dev/null 2>&1; then echo "Healthy at $(git rev-parse --short HEAD)"; exit 0; fi
  sleep 4
done
echo "Unhealthy after deploy; rolling back to $before" >&2
git checkout "$before" && docker compose --env-file .env.oci -f docker-compose.oci.yml up -d --build
exit 1
