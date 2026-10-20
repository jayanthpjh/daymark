# Daymark: Plan, Requirements and Architecture (Review Draft)

> Historical architecture review: this review predates the hybrid LLM rollout and OCI limit verification. Its 4 OCPU / 24 GB Always Free target, Pay-As-You-Go recommendation, and cloud Proton Bridge instructions are obsolete. Use [hybrid-llm.md](hybrid-llm.md) for the current architecture and rollout gates.

| | |
|---|---|
| Status | Draft for review |
| Date | 2026-10-17 |
| Owner | Applicant (single user) |
| Scope | Product requirements, system architecture, delivery plan, open risks |

## 1. Summary

Daymark is a single-user job-application system. It finds fresh jobs, tailors a resume for each one, fills the employer's application form in a real browser, and **stops for the applicant's review**. It submits only when the applicant clicks. It also tracks application results, mail and interview calendar events.

It runs locally today (Node, PostgreSQL, Redis, Playwright). The next milestone is moving it to Oracle Cloud (OCI Always Free) so it runs without the applicant's laptop.

## 2. Goals and non-goals

**Goals**
- Keep a feed of open, recent jobs from many employers, without paid job-board APIs.
- Produce an honest, tailored resume per job (no invented facts).
- Fill employer forms across the common applicant tracking systems (ATS), and ask the applicant for anything unknown.
- Keep the applicant in control: review before every submission.
- Give one place to see applications, mail, interviews and statuses.

**Non-goals**
- Multi-user or SaaS operation. There is one applicant and one data owner.
- Bypassing CAPTCHAs or bot detection.
- Auto-submitting without a click (auto-apply exists but is **off by default**).
- Choosing consent, legal or demographic answers for the applicant.

## 3. Requirements

### 3.1 Functional

| ID | Requirement |
|---|---|
| F1 | Collect jobs from ATS boards, aggregators and discovered company pages; deduplicate; filter by location. |
| F2 | Keep the feed fresh: hourly collection, a 7-day default window, closed-job detection, and freshness filters (24h / 7d / 14d / 30d). |
| F3 | Show company logos resolved on demand from the company's own site, cached on disk. |
| F4 | Tailor the resume per job (strong-only changes); render a Jake-style LaTeX PDF with a fallback. |
| F5 | Fill forms through Playwright, including repeating work-history and education blocks, dates, shadow DOM, and per-ATS sign-in (Workday, iCIMS, Avature, SuccessFactors, Greenhouse, Lever, Ashby). |
| F6 | Pause with a **Questions** card for unknown answers; consent boxes are answered only by the applicant. |
| F7 | Final review screen: list every answer, allow edits that re-check the form and clear any earlier approval. |
| F8 | Submit only on the applicant's click; keep a receipt per submission. |
| F9 | Mailbox via Proton Bridge: sync, classify, draft replies; every send goes through review-then-send. |
| F10 | Calendar: parse invites with ical.js, show an agenda, save RSVP replies as drafts. |
| F11 | Tracker: statuses per application; remove or change records (with backup first); handle expired jobs. |
| F12 | Assistant: reads state and proposes actions; consent, accuracy approvals and settings are never available to it. |
| F13 | Language model layer: JSON-only calls routed between a hosted model (NVIDIA) and a self-hosted model (Ollama), with automatic fallback to the other provider and no calls for sensitive questions (section 4.6). |

### 3.2 Non-functional

| Area | Requirement |
|---|---|
| Safety | Review-before-submit on by default; auto-apply off; identity facts never invented. |
| Privacy | Personal data stays on the applicant's machine or private VM, with **one disclosed exception**: resume text, job descriptions and non-sensitive form questions are sent to the hosted NVIDIA model when it is the chosen provider (section 4.6). Legal, consent and demographic questions are never sent to any model. Otherwise only the employer and the public job-site requests are contacted. |
| Politeness | Per-host pacing, backoff on HTTP 429, skip a host after repeated refusals, 120 s deadline per board. |
| Durability | State in PostgreSQL with a revision counter; backup before any destructive change. |
| Security | Secrets in environment or secret store, never in git; assistant approvals bound to a fingerprint with a 10-minute TTL. |
| Operability | One worker at a time (lock); watchdog for stuck tasks; health endpoint. |
| Quality | Unit tests (580 passing) and Vitest (36) plus a browser test that opens every screen and fails on page errors. |

## 4. Architecture

### 4.1 Components

```
 Browser UI (React 19 + Vite + Tailwind + TanStack Query)   built into public/
        |  HTTP/JSON
 API server (server.mjs, Node 22 ESM, custom http)
        |-- Assistant (agent-*.mjs) -- approvals ledger (durable, fingerprinted)
        |-- Mailbox (mailbox-*.mjs) -- Proton Bridge (IMAP/SMTP)
        |-- Calendar / Tracker (calendar-*.mjs, tracker-model.mjs)
        |-- Job sources (job-sources/) -- discovery, ATS readers, aggregators
        |
 PostgreSQL (daymark_state + revision)      Redis / BullMQ (task queue)
        |
 Worker (worker-runtime.mjs) -- Playwright autofill, LaTeX resume (Tectonic)

 API server --> llm-client.mjs --> hosted NVIDIA model (nemotron-3-super-120b)   [cloud]
                              \--> Ollama, qwen3:8b (daymark-llm container)      [OCI VM, CPU]
```

### 4.2 Module map

| Area | Key files |
|---|---|
| Job sourcing | `job-sources/` (discovery, ATS readers: greenhouse, lever, ashby, smartrecruiters, workable, workday, recruitee; `collect.mjs`, `freshness.mjs`, `open-check.mjs`, `geo.mjs`, `http.mjs`) |
| Resume | `tailoring-engine.mjs`, `latex-resume.mjs`, `resume-export.mjs` |
| Form filling | `application-flow.mjs`, `application-orchestrator.mjs`, `ats-adapters.mjs`, `ats-hooks.mjs`, `ats-auth.mjs`, `form-history.mjs`, `review-edits.mjs` |
| Submission | `submit-flow.mjs`, `pilot-submission.mjs` |
| Mail and calendar | `mailbox-*.mjs`, `calendar-*.mjs`, `tracker-model.mjs` |
| Assistant | `agent-server.mjs`, `agent-actions.mjs`, `agent-approvals.mjs` |
| State and queue | `postgres-state.mjs`, `redis-task-queue.mjs`, `shared-state.mjs`, `worker-lock.mjs` |
| Web app | `web/src/screens/` (Overview, Discover, JobDetail, Applications, Questions, Mail, Calendar, Tracker, Materials, System) |

### 4.3 Key flows

**Job collection.** Schedule fires hourly. Discovery finds boards; each ATS reader polls its boards under pacing rules. Jobs get a stable id, are filtered by location and age, and snapshots are compared to mark vanished jobs as closed.

**Application.** Applicant starts an application. The worker tailors the resume, renders the PDF, opens the form, fills known fields, and raises Questions cards for the rest. It stops at final review. Edits at review re-check the form and revoke approval. Only the applicant's click submits, and a receipt is stored.

**Assistant action.** The assistant proposes an action; a ledger entry is created bound to a fingerprint of that exact action and expires after 10 minutes. The applicant approves in the UI; changing the action invalidates the approval.

### 4.4 Data

- PostgreSQL holds application state (jobs, tasks, applications, mail metadata) as `daymark_state` with a revision for conflict detection.
- Redis holds the task queue.
- Files under `data/` hold browser profiles, resumes, logos, backups and secrets references. `data/` is never committed.

### 4.5 Deployment

| | Local (today) | OCI Always Free (target) |
|---|---|---|
| Host | Mac, `npm start` | One A1 VM, 4 OCPU / 24 GB |
| Disk | Local | 50 GB boot + 150 GB data volume (200 GB cap) |
| Services | Postgres and Redis in Docker | `docker-compose.oci.yml`: postgres, redis, proton-bridge, llm, search, api, worker |
| Access | localhost | Private, through Tailscale |

Docker naming is fixed by `docs/NAMING.md`: project `daymark`, containers `daymark-*`, volumes `daymark-postgres-data` and `daymark-redis-data`, network `daymark-net`.

### 4.6 Language model layer

The first version of this document left the models out. They are specified in `llm-client.mjs`, `nvidia-client.mjs`, `docker-compose.oci.yml` and `docker/llm-entrypoint.sh`.

**Providers**

| | Hosted | Self-hosted |
|---|---|---|
| Model | `nvidia/nemotron-3-super-120b-a12b` (hard-coded in `nvidia-client.mjs`) | `qwen3:8b` by default (`LLM_MODEL`) |
| Endpoint | `https://integrate.api.nvidia.com/v1/chat/completions`, with polling on HTTP 202 | `http://llm:11434/v1/chat/completions` (Ollama 0.12.6, OpenAI-compatible) |
| Credential | `NVIDIA_API_KEY` (Settings or `.env`) | none; enabled by setting `LLM_BASE_URL` |
| Where it runs | NVIDIA cloud | OCI VM, CPU only (no GPU on Always Free), container `daymark-llm`, 9 GB limit, 8192 token context, one request at a time |
| Timeout | 180 s, plus up to 60 polls of 2 s | 120 s (`LLM_TIMEOUT_MS`) |
| Local setup | Mac: hosted only (no `LLM_BASE_URL`) | OCI: both providers |

**Routing** (`llmRoute`): **the self-hosted model goes first for every task and NVIDIA is the fallback** (changed 2026-10-17; before, tailoring and resume reading went to NVIDIA first). If only one provider is configured, only that one is used (the Mac setup stays NVIDIA-only). With neither, the call fails with a message to add a key or a local model. `LLM_HOSTED_FIRST=tailor,resume` moves named tasks back to NVIDIA first without a code change.

| Task | Used by | Order now |
|---|---|---|
| `tailor` | Resume tailoring (`server.mjs:651`, `:1925`) | Local, then NVIDIA |
| `resume` (default) | Reading an uploaded resume into fields (`server.mjs:1654`, up to 10,000 tokens) | Local, then NVIDIA |
| `answers` | Form-question answers and drafts (`server.mjs:719`, `:2151`, `:2166`) | Local, then NVIDIA |
| `mail` | Mailbox assistant drafts (`server.mjs:1389`) | Local, then NVIDIA |
| `cover`, `classify`, `embed` | Declared, **no caller yet** | n/a |

**Privacy effect:** with the local model first, resume text reaches NVIDIA only when the local call fails or is invalid. Section 3.2 still discloses it.

**Safeguards already in code:** output must be valid JSON or the call fails and the saved documents stay unchanged; `sensitive` questions throw before any network call (tested in `tests/llm-client.test.mjs`); the hosted key is read from settings, never logged.

**Gaps found in this review**

| # | Finding | Effect |
|---|---|---|
| L1 | Local CPU speed was never measured. A 4-core ARM VM running an 8B model is likely a few tokens per second (estimate, not measured). `answers` asks for up to 800 tokens and `mail` up to 1,500, against a 120 s timeout. | Local-first tasks may time out and fall back to the hosted model, or feel slow. |
| L2 | `qwen3:4b` and `nomic-embed-text` are downloaded but nothing uses them (`embed` has no caller; no setting selects the 4B model). | About 3 GB of disk and pull time for nothing. |
| L3 | The hosted model name is hard-coded. | A model retirement needs a code change. |
| L4 | Local calls send `chat_template_kwargs: {enable_thinking:false}`, which Ollama's OpenAI endpoint may ignore. | Qwen3 may spend tokens on hidden reasoning. Unverified. |
| L5 | `resume` parsing requests 10,000 tokens but the local context is 8,192. | If the hosted call fails, the local fallback cannot succeed for long resumes. |
| L6 | Worker containers get `.env.oci` but not `LLM_BASE_URL`; only the API container has it. | Fine today because only the API calls models; any future worker call would silently go hosted-only. |
| L7 | No per-task override UI (`overrides` exists in `llmRoute`, nothing passes it). | Provider choice is fixed by the table above. |
| L8 | Privacy statement was wrong in the first draft (fixed in section 3.2). | Resume content leaves the machine when the hosted model is used. |

The fixes are work package WP-3 in `docs/IMPLEMENTATION-PLAN.md`.

**Model recommendation for the dedicated VM** (research done 2026-10-17 from the Ollama library and NVIDIA's public model list; speeds are *not measured* on this VM)

The VM has 4 ARM cores and no GPU. On CPU, speed depends mostly on how many parameters are read per token, so a model with few *active* parameters answers much faster than a dense model of the same file size. The container has 9 GB.

| Rank | Model (Ollama tag) | Size | Why it is on the list | Main doubt |
|---|---|---|---|---|
| 1 | `granite4.2:8b` | 5.3 GB | IBM states structured JSON output, tool use and RAG as design targets; Apache 2.0. Fits `answers` and `mail`, which must return JSON. | CPU speed unknown |
| 2 | `qwen3.5:9b` (or `:4b`, 3.3 to 4.0 GB) | 6.6 to 7.6 GB | Newest Qwen at this size, 256K context, tools and thinking. Best bet for tailoring quality. | Dense 9B is the slowest on this list; the 4B is the speed compromise |
| 3 | `gemma4:e4b` (or `:e2b`, 4.6 GB) | 6.6 GB | Google's "effective 4B" design aims at low-memory devices; tools and thinking. | Needs a benchmark to confirm JSON discipline |
| 4 | `lfm2.5:8b-a1b` | 5.2 GB | Mixture-of-experts with about 1B parameters active per token, built for fast tool calling on small hardware. The likely speed winner. | Quality below the dense models; good for `mail` and short answers |
| Baseline | `qwen3:8b` (current) | 5.2 GB | What the compose file pulls today, so the new models must beat it. | A year old, 40K context |

Not recommended here: `qwen3.5:35b`, `gemma4:26b`, `nemotron-3-nano:30b`, `granite4.2:30b` (16 to 24 GB files; they do not fit a 9 GB container). `nemotron-3-nano:4b` (2.8 GB) is a lighter option from the same maker as the fallback.

**Starting choice, to be confirmed by the benchmark:** host `granite4.2:8b` for everything, plus `qwen3.5:9b` only if tailoring quality needs it. If `granite4.2:8b` is too slow, drop to `lfm2.5:8b-a1b`. Host **one model at a time** (`OLLAMA_MAX_LOADED_MODELS=1`), because two resident models do not fit.

**Version risk:** the compose file pins Ollama `0.12.6`. The latest release is `v0.40.5` (2026-10-14). The newer models above probably need a newer Ollama (not confirmed from release notes). Bump the pin and test on arm64 before pulling them.

**Fallback model (hosted):** `nvidia/nemotron-3-super-120b-a12b` is still in NVIDIA's public model list, so keep it as the default fallback. Same list also shows `google/gemma-4-31b-it` and `nvidia/nemotron-3.5-lightning-30b-a3b` as alternatives; whether your key can use them is untested.

## 5. Status

| Area | State |
|---|---|
| Autofill gate, tracing, Workday/Lever/Ashby characterization | Done, tested on fixtures |
| LaTeX Jake resume | Done, with fallback |
| Tracker, calendar, assistant approvals, redesign, Vitest | Done |
| Job feed freshness, closed-job detection, logos, Tsenta-style layout | Done; closed-job detection unproven on live boards (0 vanished in a 25-minute trial) |
| Docker rename, git repo, OCI docs | Done; old generic resources removed; counts verified (142 jobs, 10 tasks, 2 applications) |
| OCI deployment | **Not started**: stack never run on OCI |

## 6. Delivery plan

| Phase | Work | Owner | Exit criterion |
|---|---|---|---|
| A. Repo | Create private GitHub repo `daymark`, push the local commits | Applicant | Fresh clone builds and passes tests |
| B. Cloud account | Oracle account, upgrade to Pay-As-You-Go, $1 budget alert | Applicant | Alert active |
| C. Infrastructure | A1 VM, 150 GB volume, Tailscale on VM, Mac and phone | Applicant | SSH over Tailscale works |
| D. Deploy | Follow `docs/oci-deploy.md` and `docs/oci-secrets-checklist.md` | Both | All 7 containers healthy |
| E. Data move | `docs/oci-data-move.md`: dump, copy `data/` without browser profiles, restore | Both | Row counts match local |
| F. Live checks | `docs/LIVE-CHECKS.md`: real-mail invite, consent tick, live fill to review | Applicant | All three pass, nothing submitted |
| G. Source expansion (optional) | Local SearXNG container; readers for Avature, SuccessFactors, iCIMS, Teamtailor, Rippling | Decision pending | Estimated 14 to 20 hours |

## 7. Risks and open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | OCI reclaims idle Always Free instances | Upgrade to Pay-As-You-Go; keep spend at zero with the alert |
| R2 | A1 capacity unavailable in the home region | Retry or pick another availability domain |
| R3 | Proton Bridge needs interactive first login; untested on a headless VM | Test early in phase D |
| R4 | Employer sites change forms; autofill breaks | Characterization tests; Questions fallback; applicant review |
| R5 | Job-site blocking or rate limits | Pacing, backoff, skip after refusals; Common Crawl discovery is flaky |
| R6 | Only 7 ATS readers (Tsenta has 30+) | Phase G, pending approval |
| R7 | Secrets exposure on a public host | Tailscale-only access, secrets outside git, checklist |
| R8 | Data loss on migration | Backups (two DB dumps and a data archive in `data/backups`) before each step |
| R9 | Local model too slow on CPU (L1) | Benchmark first (WP-3); choose the 4B model or hosted-first for slow tasks based on measured numbers |
| R10 | Hosted model sees resume content; key leak or provider outage | Disclosed in privacy row; key stored `0600`, rotate after the move; local fallback keeps the system working |
| R11 | Memory: container limits total about 15.6 GB of 24 GB, with the model taking 9 GB | Acceptable; watch with `docker stats` during the first full run |

**Open decisions for the reviewer**
1. Approve phase G (SearXNG container and five new ATS readers), or defer?
2. Always-on host: OCI only, or keep the Mac as a fallback?
3. Rename the project folder `let-us-workm-x20` to `daymark` after this session?
4. Models on OCI: keep hosted-first for tailoring and local-first for answers and mail (current), or go hosted-only until the local model is measured?
5. One-letter variable names remain in older files (`docs/NAMING.md` lists this as a known gap). Clean up in bulk, or only when touched?

## 8. Verification

- `npm test`: 580 unit tests pass (3 skipped); Vitest 36 pass.
- `tests/browser-screens.mjs`: every screen opens without page errors.
- Fresh-clone check: `npm ci`, tests and web build pass without the `data/` folder.
- Not yet verified: OCI stack, Proton Bridge on OCI, live-board closed-job detection, mobile-width layout of Discover and JobDetail.
