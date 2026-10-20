# Daymark local Docker setup

## Runtime layout

- The API and dashboard, PostgreSQL, Redis, Playwright worker, and MCP run in Docker on one Mac.
- Proton Mail Bridge stays in the native Mac app. The current Compose setup pauses inbox sync, forwarding, OTP retrieval and outbound sends. Docker Desktop does not support the mounted host Unix socket used by the old local setup, and a Bridge listener bound to Mac loopback may not accept the host-gateway connection.
- The API and browser viewer publish ports only on `127.0.0.1`. PostgreSQL, Redis, and the worker API have no host-published ports.
- PostgreSQL and Redis use named volumes. Documents, application files, credentials, and browser profiles live under the ignored `data/` directory, mounted at the same absolute path in API and worker containers.
- The worker concurrency is one. Daymark retains its approval ledger, explicit final-submit approval, CAPTCHA/consent checkpoints, and no-retry behavior for uncertain submissions.
- There is no GCP or OCI runtime and no model server. NVIDIA is an external API only and remains gated for real application data.

## Setup and daily use

1. Install Docker Desktop. For an existing Docker-backed installation, run `npm run docker:backup` while `daymark-postgres` is running, before setup changes `.env`. The backup contains a private data archive, `.env`, and a PostgreSQL dump.
2. Run `npm run worker:setup` once. It writes owner-only `.env` and `.env.worker` files, preserves existing application settings, creates the PostgreSQL password and MCP bearer token, and prepares private data directories.
3. Review `.env.worker`; it contains the worker's NVIDIA and Apify keys, but NVIDIA calls remain disabled by a separate production-approval gate generated as false.
4. Run `npm run worker:up`, then open `http://127.0.0.1:4173`. Docker restarts services unless they were explicitly stopped. `npm run docker:down` stops the stack without deleting volumes.
5. Configure a local MCP client with `npm run mcp:stdio` and the repository as its working directory. Its process runs inside the API container; the API must be running. HTTP MCP is authenticated and available only at `http://127.0.0.1:4173/mcp`.

The generated documents and browser profiles keep their original host paths, so saved application references remain valid after the API moves into Docker. On first PostgreSQL startup, Daymark imports `data/state.json` only when the database does not already contain Daymark state. Do not delete the named volumes or switch a populated setup to a new blank database.

## Proton Bridge boundary

The API uses the file secret backend in a private host-mounted `data/secrets/` directory. It never depends on macOS Keychain from inside Linux. The Bridge host allowlist includes only Docker Desktop's `host.docker.internal` gateway. The previous Unix-socket handoff fails on Docker Desktop's host mounts (`ENOTSUP`), so the Compose profile now disables mailbox synchronization, OTP lookup, forwarding and SMTP sends; the API does not create that socket while mail is disabled. Local drafts and previously stored mail remain available. Do not enter Bridge credentials or open Bridge ports to the LAN or internet. Mail can be re-enabled only after a restricted relay is implemented and verified; until then, OTP and sign-in steps require manual handling.

## Backup and restore

`npm run docker:backup` creates `data/backups/pre-docker-<timestamp>/` with `data.tar.gz`, `.env`, and `postgres.dump`; the directory and files are owner-only. Keep the backup on encrypted local storage.

For recovery, stop Daymark, restore the `.env` file, extract `data.tar.gz` into `data/`, run `npm run worker:setup` to regenerate `.env.worker`, and start the Compose PostgreSQL service with an empty volume. Then restore the database snapshot with:

```sh
docker compose --env-file .env.worker -f docker-compose.worker.yml exec -T postgres pg_restore -U daymark -d daymark --clean --if-exists < data/backups/pre-docker-TIMESTAMP/postgres.dump
```

The database dump contains application state, documents' references, transactional checkpoint history, and approval history. The data archive contains document files and browser profiles. Verify `/api/health`, application and approval counts, a generated document, and a saved browser checkpoint before resuming tasks.

## Acceptance checks

- `npm run docker:config` validates the merged local Compose settings without revealing values.
- `npm run worker:up` builds and starts the API, PostgreSQL, Redis, and worker with healthy dependencies and restart policies.
- `127.0.0.1:4173` and `127.0.0.1:6080` are the only published ports. Database, Redis, and worker API are reachable only on the Compose network.
- A synthetic ATS fixture checks one-at-a-time execution, profile persistence, sign-in/CAPTCHA/consent checkpoints, form validation, and stop-before-submit.
- MCP tests verify loopback HTTP authorization, stdio startup, bounded reads/actions, idempotency, and the inability to approve or submit.
- NVIDIA remains unreachable for real resume/application data unless both hosted writing and the separate production-approval flag are explicitly enabled after account-term and budget review.
- Mail sync, OTP lookup, forwarding and outbound sends fail closed while `DAYMARK_DISABLE_MAIL_AUTOMATION` is true; local draft operations remain available.
- Proton remains paused until a restricted relay handles Bridge access without a host-mounted Unix socket and passes connection, OTP scoping and no-send regression tests.
- Backups restore the state, documents, browser profile, checkpoints, and approval history before the old local API is retired.
