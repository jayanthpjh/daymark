# Daymark: Plan, Requirements and Architecture (Review Draft)

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

### 3.2 Non-functional

| Area | Requirement |
|---|---|
| Safety | Review-before-submit on by default; auto-apply off; identity facts never invented. |
| Privacy | Personal data stays on the applicant's machine or private VM; nothing sent to third parties except the employer and the job-site requests needed. |
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
 Worker (worker-runtime.mjs) -- Playwright autofill, LaTeX resume (Tectonic), LLM client
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

**Open decisions for the reviewer**
1. Approve phase G (SearXNG container and five new ATS readers), or defer?
2. Always-on host: OCI only, or keep the Mac as a fallback?
3. Rename the project folder `let-us-workm-x20` to `daymark` after this session?
4. One-letter variable names remain in older files (`docs/NAMING.md` lists this as a known gap). Clean up in bulk, or only when touched?

## 8. Verification

- `npm test`: 580 unit tests pass (3 skipped); Vitest 36 pass.
- `tests/browser-screens.mjs`: every screen opens without page errors.
- Fresh-clone check: `npm ci`, tests and web build pass without the `data/` folder.
- Not yet verified: OCI stack, Proton Bridge on OCI, live-board closed-job detection, mobile-width layout of Discover and JobDetail.
