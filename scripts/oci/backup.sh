#!/usr/bin/env bash
# Nightly: pg_dump + data/ (minus browser profiles), encrypted with age, kept 14 days, optionally copied to OCI Object Storage.
# Install: sudo cp scripts/oci/backup.sh /etc/cron.daily/daymark-backup. Needs /srv/daymark/backups/age-recipient.txt (a public key).
set -euo pipefail
dest=/srv/daymark/backups; stamp=$(date -u +%Y%m%dT%H%M%SZ); recipient=$(cat "$dest/age-recipient.txt")
cd /srv/daymark
set -a; . "$(dirname "$(readlink -f "$0")")/../../.env.oci" 2>/dev/null || . /home/ubuntu/daymark/.env.oci; set +a
pw=$DAYMARK_POSTGRES_PASSWORD
docker compose -f /home/ubuntu/daymark/docker-compose.oci.yml --env-file /home/ubuntu/daymark/.env.oci exec -T postgres pg_dump -U daymark daymark > "$dest/pg-$stamp.sql"
tar --exclude='data/docker-browser-profile*' --exclude='data/browser-profile' --exclude='data/browser-runtime' -cf "$dest/data-$stamp.tar" data
tar -cf - -C "$dest" "pg-$stamp.sql" "data-$stamp.tar" | age -r "$recipient" -o "$dest/daymark-$stamp.tar.age"
rm -f "$dest/pg-$stamp.sql" "$dest/data-$stamp.tar"
find "$dest" -name 'daymark-*.tar.age' -mtime +14 -delete
if command -v oci >/dev/null && [ -n "${OCI_BACKUP_BUCKET:-}" ]; then oci os object put --bucket-name "$OCI_BACKUP_BUCKET" --file "$dest/daymark-$stamp.tar.age" --force >/dev/null; fi
echo "backup ok: daymark-$stamp.tar.age"
