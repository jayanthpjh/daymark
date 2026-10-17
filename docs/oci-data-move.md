# Moving your data from the Mac to Oracle Cloud

Do this only after the VM runs and Bridge is logged in (`docs/oci-deploy.md`, steps 1 to 4). Containers are named `daymark-*` on both machines.

## What moves and what does not
| Moves | Does not move |
|---|---|
| PostgreSQL database `daymark` (state, mail, calendar, approvals, checkpoints) | `data/browser-profile*`, `data/docker-browser-profile*` (employer sessions are recreated) |
| `data/files/` (resumes, generated documents, proof screenshots) | `data/backups/` (keep a copy on the Mac), `data/worker-control/` |
| `data/adapters/`, `data/job-sources/`, `data/logos/` | ATS and Bridge passwords (see `oci-secrets-checklist.md`) |

## 1. On the Mac: back up and stop writers
```bash
npm run worker:down        # stops the local worker; leaves nothing writing
docker exec daymark-postgres pg_dump -U daymark -d daymark --no-owner --format=custom > daymark-db.dump
tar -czf daymark-data.tgz --exclude='data/backups' --exclude='data/browser-profile' --exclude='data/docker-browser-profile*' --exclude='data/browser-runtime' --exclude='data/worker-control' --exclude='*.sock' --exclude='*.lock' data
```
Also stop `npm start` so nothing is writing.

## 2. Copy to the VM over Tailscale
```bash
scp daymark-db.dump daymark-data.tgz <vm-tailscale-name>:~/
```

## 3. On the VM: restore
```bash
sudo tar -xzf ~/daymark-data.tgz -C /srv/daymark   # the archive already starts with data/, so files land in /srv/daymark/data
docker exec -i daymark-postgres pg_restore -U daymark -d daymark --no-owner --clean --if-exists < ~/daymark-db.dump
```

## 4. Check before you trust it
- Row counts match the Mac (jobs, applications, tasks, `daymark_state` revision).
- Open Daymark over Tailscale and compare Applications, Mail and Discover with the Mac.
- Keep the Mac stack stopped until the VM has run a full day, then delete the Mac copy only when you choose to.

## Never run both at once
Two Daymark workers on one queue, or two Bridges logged into one Proton account, cause duplicate work and lockouts. One machine runs at a time.
