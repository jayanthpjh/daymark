# Daymark: Implementation Plan (Move to Oracle Cloud)

| | |
|---|---|
| Status | Ready to execute |
| Date | 2026-10-17 |
| Companion | `docs/PROJECT-REVIEW.md` (requirements and architecture), `docs/oci-deploy.md`, `docs/oci-secrets-checklist.md`, `docs/oci-data-move.md`, `docs/LIVE-CHECKS.md` |

## 0. How to read this plan

- **Owner:** `You` means an account or approval only you can do. `Claude` means code or docs I do in this repo. `Both` means I give you the command and you run it on the VM.
- **Gate:** a check that must pass before the next work package starts. If a gate fails, stop and fix; do not skip ahead.
- **Time figures are estimates**, not measurements. Only the benchmark in WP-3 produces measured numbers.
- **Safety rules stay on throughout:** review-before-submit on, auto-apply off, no application submitted during any test, consent answered only by you.

## 1. Scope

**In scope:** correct the language model layer; put the code on a private GitHub repo; stand up the OCI VM; deploy the 7-container stack; move data; set up backups; run the live checks.

**Out of scope for this plan:** new job-source readers (optional WP-9), multi-user support, public access.

## 2. Dependency map

```
WP-1 GitHub ─┐
WP-2 OCI VM ─┼─> WP-4 Deploy ─> WP-5 Bridge ─> WP-6 Data move ─> WP-7 Backups ─> WP-8 Live checks
WP-3 LLM fix ┘        ^                                                     
                      └── WP-3 benchmark runs here, on the VM
WP-9 optional, after WP-8
```

WP-1, WP-2 and WP-3 (code part) can run in parallel. The WP-3 benchmark needs the VM from WP-4.

## 3. Work packages

### WP-1: Repository (Owner: You, 15 min)

| Step | Action | Done when |
|---|---|---|
| 1.1 | On GitHub create an **empty private** repo named `daymark` (no README, no licence). | Repo exists |
| 1.2 | `git remote add origin git@github.com:<you>/daymark.git` then `git push -u origin main` from the project folder. | Push succeeds |
| 1.3 | On GitHub open Settings > Security and turn on secret scanning and push protection. | Enabled |
| 1.4 | Create a deploy key (read-only) for the VM, or plan to use a personal access token on the VM. | Key added |

**Gate G1:** `git ls-files | grep -E '^(data/|\.env)'` prints nothing, and a fresh clone passes `npm ci && node --test tests/*.test.mjs && npm run web:build`. (Already verified once locally.)

### WP-2: Oracle account, VM and storage (Owner: You, 1 to 3 hours plus capacity waits)

| Step | Action | Done when |
|---|---|---|
| 2.1 | Create the Oracle Cloud account; upgrade to **Pay-As-You-Go**; create a **$1 budget alert**. | Alert listed under Budgets |
| 2.2 | Install Tailscale on the Mac and phone; create a one-time auth key. | Key in hand |
| 2.3 | Create the VM: `VM.Standard.A1.Flex`, 4 OCPU, 24 GB, Ubuntu 24.04, 50 GB boot, **no public inbound ports**. Paste `scripts/oci/cloud-init.yaml` into cloud-init with `TS_AUTHKEY` replaced. | VM running |
| 2.4 | If "out of host capacity": retry another availability domain, or retry later. Do not use a smaller shape for the final stack (the model needs the memory). | VM running |
| 2.5 | Create and attach a **150 GB** block volume; format; mount at `/srv/daymark`; add to `/etc/fstab` with `nofail`. | `df -h /srv/daymark` shows about 150 GB |
| 2.6 | `ssh ubuntu@daymark` from the Mac over Tailscale. | Login works with no public IP |

**Gate G2:** SSH works over Tailscale only; `docker --version` and `docker compose version` work on the VM; the budget alert exists. Confirm total allocation is 4 OCPU / 24 GB / 200 GB (50 + 150) so it stays inside Always Free.

### WP-3: Language model layer (Owner: Claude for code, Both for the benchmark)

Findings are in section 4.6 of `docs/PROJECT-REVIEW.md` (L1 to L8). **Direction set on 2026-10-17: the dedicated self-hosted model is primary for every task and NVIDIA is the fallback.**

**3A. Code and config (Claude, local, before deployment)**

| # | Change | Files | Status |
|---|---|---|---|
| 3A.0 | Local model first for every task; NVIDIA second; `LLM_HOSTED_FIRST` moves named tasks back. Tests updated (583 run, 580 pass, 3 skipped). | `llm-client.mjs`, `tests/llm-client.test.mjs` | **Done** |
| 3A.1 | `scripts/llm-benchmark.mjs`: runs fixed prompts for `answers`, `mail`, `tailor` and `resume` against each candidate model; records tokens per second, latency (median and p95), JSON validity rate, and a fact check (every employer, title and date in the output appears in the source resume). Prints one table. | new | Todo |
| 3A.2 | **Quality gate on local output:** `requestLlmJson` accepts an `accept(value)` check. If the local answer fails it (for tailoring: the existing claims-ledger and consistency checks), the call falls back to NVIDIA instead of using a weak local draft. | `llm-client.mjs`, `server.mjs`, tests | Todo |
| 3A.3 | **Circuit breaker:** after 3 local failures in 5 minutes, skip local for 5 minutes, so a stuck model does not cost 120 s per call. Show "local model paused" in Settings. | `llm-client.mjs`, tests | Todo |
| 3A.4 | **Request queue:** one local request at a time (`OLLAMA_NUM_PARALLEL=1`), so waiting time is not counted against the timeout. | `llm-client.mjs`, tests | Todo |
| 3A.5 | Hosted model configurable: `NVIDIA_MODEL`, default `nvidia/nemotron-3-super-120b-a12b`. | `nvidia-client.mjs`, `settings-env.mjs`, `oci-env.mjs`, tests | Todo |
| 3A.6 | Privacy switch: `LLM_FALLBACK=nvidia` (default) or `off`. With `off`, nothing ever leaves the VM and a failed local call shows an error. | `llm-client.mjs`, Settings, tests | Todo |
| 3A.7 | Clamp local `max_tokens` to what fits the context; skip local when a request cannot fit. Per-task timeouts `LLM_TIMEOUT_<TASK>_MS`. | `llm-client.mjs`, tests | Todo |
| 3A.8 | Compose: pass `LLM_BASE_URL`, `LLM_MODEL` to the worker too; add `OLLAMA_MAX_LOADED_MODELS: "1"`; set `LLM_MODELS` to the winning model only (no `qwen3:4b`, no `nomic-embed-text`). | `docker-compose.oci.yml` | Todo |
| 3A.9 | Remove dead tasks `cover`, `classify`, `embed` from `LLM_TASKS`. | `llm-client.mjs`, tests | Todo |
| 3A.10 | Settings shows which provider answered last, local reachability, fallback count, and the disclosure line: "NVIDIA is used only when the local model fails; legal, consent and demographic questions are never sent to any model." | `server.mjs`, `System.tsx` | Todo |
| 3A.11 | Log provider, model, latency and token counts for every call in the activity log. | `server.mjs` | Todo |

**Acceptance for 3A:** all unit tests and `npm run web:test` pass; new tests cover the quality gate, circuit breaker, queue, `NVIDIA_MODEL`, `LLM_FALLBACK=off`, and "sensitive never calls any model"; the compose file validates with `docker compose config`.

**3B. Pick the dedicated model (Both, on the VM, after WP-4 step 4.4)**

1. **Bump the Ollama pin** in `docker-compose.oci.yml` from `0.12.6` toward the current release (`v0.40.5` on 2026-10-14), start the container on arm64, and confirm it runs. Newer models probably need this.
2. Pull and test **one candidate at a time** (disk is plentiful; memory is not): `granite4.2:8b`, `qwen3.5:9b`, `gemma4:e4b`, `lfm2.5:8b-a1b`, and the current `qwen3:8b` as the baseline. Optional light entries: `qwen3.5:4b`, `nemotron-3-nano:4b`.
3. Run `scripts/llm-benchmark.mjs` for each and record the table in the docs.
4. Choose with these rules (thresholds are proposals):

| Measured result | Decision |
|---|---|
| p95 under 60 s on `answers` and `mail`, JSON valid at least 95%, fact check clean | Host it as primary for those tasks |
| Same, and `tailor` also passes the fact check | Host it as primary for everything |
| `tailor` fails the fact check or is slow | Set `LLM_HOSTED_FIRST=tailor,resume`; local stays primary for `answers` and `mail` |
| Every dense model is over 120 s | Use `lfm2.5:8b-a1b` or a 3B to 4B model; re-run |
| Memory near the 9 GB limit | Lower context, or use a smaller quantization or size |

5. Pin the winner by its digest, set `LLM_MODELS` and `LLM_MODEL` to it, and record the result in `docs/PROJECT-REVIEW.md` section 4.6.

**3C. Thinking-token check (Claude, with the benchmark).** Models in the Qwen3.5 and Gemma 4 families support "thinking". Confirm whether the current request field (`chat_template_kwargs.enable_thinking`) is honoured by the newer Ollama; if not, use the parameter it does honour. Compare completion token counts with thinking on and off.

**Gate G3:** benchmark table recorded; winner pinned; routing decision applied; tests pass.

### WP-4: Deploy the stack (Owner: Both, 1 to 2 hours plus first-build time)

| Step | Action | Done when |
|---|---|---|
| 4.1 | On the VM: `git clone <repo> ~/daymark && cd ~/daymark`. | Code present |
| 4.2 | Prepare a minimal source env on the Mac containing only `NVIDIA_API_KEY`, `APIFY_API_TOKEN`, `APPLICATION_EMAIL` (see `docs/oci-secrets-checklist.md`); copy it to the VM as `~/mac.env`; run `node scripts/setup-oci.mjs ~/mac.env`. | `.env.oci` exists with mode 0600 and `TAILSCALE_IP` set |
| 4.3 | `docker compose --env-file .env.oci -f docker-compose.oci.yml up -d --build`. The Bridge builds from source (several minutes); the llm container downloads its models on first start. | Build completes |
| 4.4 | `docker ps` shows `daymark-postgres`, `daymark-redis`, `daymark-proton-bridge`, `daymark-llm`, `daymark-search`, `daymark-api`, `daymark-worker`; wait for `daymark-llm` to be healthy. | All running, health checks green |
| 4.5 | From the Mac: open `http://<tailscale-ip>:4173`; `curl http://<tailscale-ip>:4173/api/health`. | Health 200 |
| 4.6 | Run the WP-3B benchmark now. | Table recorded |
| 4.7 | Watch memory for a few minutes: `docker stats --no-stream`. | Total under about 20 GB |

**Gate G4:** all containers healthy; UI loads over Tailscale; **nothing listens on a public address** (`ss -tlnp` on the VM shows the published ports bound to the Tailscale IP only, and the OCI security list has no inbound rules).

**Rollback:** `docker compose ... down`; nothing else on the Mac is changed yet.

### WP-5: Proton Bridge (Owner: You, with commands from Claude, 30 to 60 min)

| Step | Action | Done when |
|---|---|---|
| 5.1 | Confirm the application Proton account is a paid plan (Bridge requires it). | Confirmed |
| 5.2 | Check `BRIDGE_VERSION` in `docker/Dockerfile.bridge` against Proton's releases before the build in 4.3 (do this **before** 4.3 if possible). | Version current |
| 5.3 | One-time login: `docker compose --env-file .env.oci -f docker-compose.oci.yml run --rm proton-bridge init`, then `login`, then `info`. Do it while you can answer a Proton security challenge. | Bridge shows the account |
| 5.4 | Save the Bridge username and generated password in Daymark Settings (stored as a file secret). | System shows Bridge connected |
| 5.5 | Send a test mail to the application address; confirm it appears in Daymark Mail within 60 seconds. | Mail visible |
| 5.6 | Trigger a test verification-code mail and confirm Daymark matches it without forwarding it. | Code matched |

**Gate G5:** receive, sync and code-match work from the VM. **Do not start the data move until this passes** (R3: Bridge on a headless server is untested).

**Rollback:** keep the Mac's Bridge as the mail source; do not stop it yet.

### WP-6: Data move and cutover (Owner: Both, 1 to 2 hours; plan a quiet window)

Follow `docs/oci-data-move.md`. Summary with checks:

| Step | Action | Check |
|---|---|---|
| 6.1 | On the Mac, take a **fresh backup**: database dump plus `data/` archive (excluding browser profiles, `worker-control`, sockets, locks). | Files exist, sizes sane |
| 6.2 | Record Mac counts from `/api/state`: **jobs, tasks, applications** (last known 142, 10, 2) and the Postgres table row counts. | Numbers written down |
| 6.3 | Copy both files to the VM. | Checksums match (`shasum -a 256`) |
| 6.4 | Restore the dump into `daymark-postgres`; extract data with `sudo tar -xzf ~/daymark-data.tgz -C /srv/daymark`. | Restore exits 0 |
| 6.5 | **Stop the Mac stack** (`npm run worker:down`, `npm run infra:down`, stop `npm start`) so two workers and two Bridges never run together. | Mac containers stopped |
| 6.6 | Restart the VM API and worker; open the UI. | Counts match step 6.2 |
| 6.7 | Re-sign in to employer sites through the live viewer at `http://<tailscale-ip>:6080`. | Sessions work |

**Gate G6:** counts identical to step 6.2; Calendar, Mail and Tracker screens load; Discover shows the same jobs.

**Rollback:** stop the VM stack, start the Mac stack again (`npm run infra:up`, `npm start`). The Mac data is untouched until you choose to delete it; keep it for at least a week.

### WP-7: Backups, updates and monitoring (Owner: Both, 1 hour)

| Step | Action | Done when |
|---|---|---|
| 7.1 | Create an `age` key pair on the Mac; put the **public** key in `/srv/daymark/backups/age-recipient.txt`; keep the private key off the VM. | Public key on VM only |
| 7.2 | `sudo cp scripts/oci/backup.sh /etc/cron.daily/daymark-backup` and make it executable. | Cron entry present |
| 7.3 | Run the backup once by hand. | Encrypted file appears |
| 7.4 | **Restore drill:** decrypt on the Mac, extract, load the SQL into a scratch Postgres, compare row counts. | Counts match |
| 7.5 | Practise an update: `scripts/oci/deploy.sh`; confirm it rolls back when `/api/health` fails (test with a deliberately broken env, then fix). | Rollback demonstrated |
| 7.6 | Copy the encrypted backups off the VM weekly (Mac or object storage within free limits). | One off-VM copy exists |

**Gate G7:** a restore drill has succeeded. A backup that has never been restored does not count.

### WP-8: Live checks (Owner: You, 30 to 45 min)

Run `docs/LIVE-CHECKS.md` against the VM, in order: real-mail calendar invite, consent tick on a real form, one live fill to final review (Greenhouse first, then Workday). **Do not submit.** Report failures with the step name and task id.

**Gate G8 (Definition of Done for the move):**
- G1 to G7 passed.
- Three live checks passed.
- One full day of normal use (collection, mail sync, one prepared application) with no unexplained errors.
- Old Mac stack stays stopped; Mac data kept for one more week, then archived.

### WP-9: Optional source expansion (Owner: Claude, decision pending)

Local SearXNG is already in the OCI compose file, so the remaining work is the five ATS readers (Avature, SuccessFactors, iCIMS, Teamtailor, Rippling) and rerunning the job-source trial (`scripts/job-sources-trial.mjs`). Estimated 14 to 20 hours. Start only after G8.

## 4. Schedule (estimates)

| Day | Work |
|---|---|
| 1 | WP-1, WP-2 (you); WP-3A (me, in parallel) |
| 2 | WP-4, WP-3B benchmark and decision, WP-5 |
| 3 | WP-6 cutover, WP-7 backups |
| 4 | WP-8 live checks, full-day soak |

OCI capacity waits and Proton challenges can add days; they are outside our control.

## 5. Risk and mitigation by package

| Risk | Package | Mitigation |
|---|---|---|
| Idle reclamation of the free VM | WP-2 | Pay-As-You-Go plus $1 alert |
| No A1 capacity | WP-2 | Other availability domains, retry |
| Local model too slow | WP-3 | Measured benchmark; hosted-first fallback |
| Proton login challenged from a cloud IP | WP-5 | Do it while you can answer; keep Mac Bridge until G5 |
| Two workers or two Bridges at once | WP-6 | Stop the Mac stack before first VM start of the worker; checklist step 6.5 |
| Secret leakage | WP-1, WP-4 | Secret scanning, `0600` env, Tailscale-only access, rotate keys after move |
| Data loss | WP-6, WP-7 | Fresh backup first, checksums, row-count compare, restore drill, Mac data kept a week |
| Memory pressure (limits sum about 15.6 GB of 24 GB) | WP-4 | `docker stats` check; shrink model if needed |
| Datacenter IP gets more CAPTCHAs | WP-8 | CAPTCHAs pause for you in the live viewer; never bypassed |

## 6. Test and verification matrix

| Level | Command or action | When |
|---|---|---|
| Unit | `node --test tests/*.test.mjs` (580 pass, 3 skipped before changes) | After every code change |
| Web unit | `npm run web:test` (36) | After web changes |
| Build | `npm run web:build` | After web changes |
| Screens | `node tests/browser-screens.mjs` | Before deploy and after cutover |
| Compose | `docker compose --env-file <dummy> -f docker-compose.oci.yml config` | After compose edits |
| Fresh clone | `npm ci` + tests + build in a temp folder | G1 and before each deploy |
| Benchmark | `scripts/llm-benchmark.mjs` on the VM | WP-3B |
| Data | `/api/state` counts and Postgres row counts | G6, G7 |
| Live | `docs/LIVE-CHECKS.md` | WP-8 |

## 7. Decisions needed from you before starting

1. **Model routing on OCI:** decided: local first for every task, NVIDIA as fallback. Open point: allow `LLM_FALLBACK=off` (nothing ever leaves the VM) as a setting?
2. **Hosted fallback model:** keep `nvidia/nemotron-3-super-120b-a12b` (still listed by NVIDIA; my recommendation), or name another?
3. **Mac as fallback:** keep the Mac stack ready for one week after cutover (my recommendation)?
4. **Folder rename** to `daymark` after this session (my recommendation: yes).
5. **WP-9:** run it after G8, or defer?

## 8. Definition of done

Daymark runs on the OCI VM with all seven `daymark-*` containers healthy, reachable only over Tailscale; the model layer is documented, configurable, measured and disclosed; data counts match the Mac; backups restore; the three live checks pass; no application was submitted without your click.
