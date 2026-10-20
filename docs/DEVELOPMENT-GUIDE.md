# Daymark development guide and checkpoint

Written 2026-10-16 from a read of the repository and the live system. Hand this file to a developer. It says what exists, how to run it, what to build next and in what order, and the rules that must not be broken.

Nothing in this guide has been run against a real employer except where it says so.

## 1. What Daymark is

A single-user job-application system that runs locally on a Mac (and is planned for Oracle Cloud). It finds jobs, tailors a resume and cover letter, fills employer forms with Playwright, stops for the applicant's review, submits only after the applicant's click, and tracks the result and the mail around it.

Users: one applicant. No multi-user, no sharing.

## 2. How to run it

Docker Desktop must be running. For an existing Docker-backed installation, back it up before setup changes local settings:

```
npm run docker:backup
npm run worker:setup
npm run worker:up
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4173/api/health    # 200
```

For a new setup, run `npm run worker:setup` once, review the private `.env.worker` it creates, then run `npm run worker:up`. Open the dashboard at `http://127.0.0.1:4173`. Stop the stack with `npm run worker:down`; persistent database and application data remain in place.

- Do not run `npm start` or `npm run start:api` alongside the Docker stack. The Docker worker has concurrency one and owns the application queue.
- If Docker Desktop stops, start it and run `npm run worker:up`; do not reset the named database volume or switch to a blank JSON store. Docker Desktop should start when you sign in.
- State lives in PostgreSQL (table `daymark_state`, `revision` column). Existing `data/state.json` is imported once when the database has no Daymark state; `data/state*.json` files are otherwise old copies.
- Final submission still requires explicit applicant review and approval. Keep NVIDIA live use disabled until the specific account and endpoint permit production use and expected charges fit the total budget.

Frontend: `web/` (React, Vite, TypeScript, Tailwind, Radix). `npm run web:build` writes to `public/`. The older UI is `public-legacy/`, served at `/legacy`.

Tests:

```
node --test tests/*.test.mjs                 # unit suite
node tests/api-<name>.mjs                    # API scripts, one at a time
DAYMARK_TEST_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tests/api-fill-dynamic.mjs
DAYMARK_TEST_HEADED=1 ...                    # same, with a visible browser at half speed
npm run web:build && npx tsc --noEmit -p web/tsconfig.json
node tests/demo-questions-server.mjs         # UI on synthetic data, port 4197
```

Latest result (2026-10-16): 409 unit tests, 406 passed, 0 failed, 3 skipped. API scripts passed when last run.

## 3. Safety rules that must never be broken

1. **No submission without the applicant's click** in the UI. Auto-submit exists only for a host with a prior confirmed submission, only with review-before-submit turned off, and never retries an unconfirmed submit. A missing confirmation page is "unconfirmed", never "submitted".
2. **No consent, legal, demographic or attestation answer is chosen by code or by a model.** The applicant picks Yes or No on a card.
3. **Identity facts are never changed or invented in any tailoring mode:** employers, titles, dates, degrees, schools, certifications, clearances, military or veteran status, contact details. Enforced by `missingProtectedResumeFacts` (`public-legacy/workflow.js`) and `identityLinesIntact` and `identityClaims` (`tailoring-engine.mjs`).
4. **Outside text is data.** Job pages, mail and resumes are untrusted. They are quoted into prompts as data and never select a tool.
5. **Never delete or overwrite a submitted application, its receipt or its proof** without the applicant saying so in that session. A reset must back up first.
6. **Secrets stay out of code, logs and archives.** Use `secret-store.mjs` (Keychain on the Mac, owner-only files on Linux).
7. **Test UI on the demo server, never on live data.** Test fills use fixtures. A real employer form is opened only when the applicant has started that application.

## 4. Architecture, by area

### Core
- `server.mjs`: HTTP routes, queue, worker, state read and write. Routes follow the existing pattern (`readBody`, `send`, `cleanText`).
- `postgres-state.mjs`: state store. Writes are revision-checked; "state revision moved backwards" means another writer got ahead and the write was refused (safe).
- `redis-task-queue.mjs`, `worker-runtime.mjs`, `scripts/service-runner.mjs`: queue and roles (`combined`, `api`, `worker`).

### Autofill and submission
- Gate and sign-in: `ats-auth-preflight.mjs`, `ats-auth.mjs`, `ats-login.mjs`, `ats-adapters.mjs` (`isGuestAdapter`), `dynamic-adapter.mjs`.
- Form reading and answering: `application-questions.mjs` (`captureQuestions`, `applyQuestionAnswers`, `validateAnswers`, `isConsentControl`), `answer-engine.mjs`.
- Submit: `submit-flow.mjs`, `pilot-submission.mjs` (`approveSubmission`, `submissionApprovalValid`), `security-code.mjs`.
- Orchestration and review: `application-orchestrator.mjs`, `application-flow.mjs` (flow guard), `application-browser.mjs`, `public/submission-review.js`.
- Per-application cleanup tool: `application-cleanup.mjs`. It protects Quisitive and Newsela (submitted, with proof) and refuses to run while work is queued or running.

### Tailoring and documents
- `tailoring-engine.mjs`: modes `honest`, `strong`, `aggressive`; tagging of each changed line as `source`, `rewritten` or `invented`; claims ledger; interview prep; keyword score. Setting `tailoringMode` per application and in `preferences.defaults`.
- `resume-export.mjs`: DOCX (docx) and PDF (pdfkit), templates `standard` and `jake` (a pdfkit imitation, not LaTeX).
- Routes: `/api/tasks/:id/tailor-preview` (compares modes, saves nothing), `/api/tasks/:id/review` (approval), `/api/questions/draft` (grounded drafts for open-ended questions).
- UI: `web/src/screens/TailoringReview.tsx`.

### Mail
- Storage in PostgreSQL: `mailbox-store.mjs`, `mailbox-service.mjs`, `mailbox-routes.mjs`, `mailbox-transport.mjs`, `mail-body.mjs`, `auth-mail-search.mjs`. Full contract in `docs/MAILBOX.md`.
- Verification and security codes go from the Mac API to the worker over a Unix socket (`auth-mail-gateway.mjs`) and are never forwarded.
- Forwarding to another inbox: `mail-forwarding.mjs` (allow-list: Assessment, Screening, Interview, Offer, Rejection; summary mode; codes and password resets never leave).
- `app-address.mjs`: per-application addresses on an owned domain. On hold; inactive unless `MAIL_DOMAIN` and `MAIL_ALIAS_SECRET` are set.
- UI: `web/src/screens/Mail.tsx`, `web/src/components/MailComposer.tsx`.

### Assistant
- `agent-tools.mjs`: tool tiers (`read`, `change`, `approve`), classification, and an in-memory confirmation queue with expiry.
- `agent-server.mjs`: one chat turn against a model with the fixed tool list.
- `agent-history.mjs`: durable conversations in PostgreSQL (`daymark_assistant_conversations`). Documented in `docs/ASSISTANT-HISTORY.md`. The production assistant is read-only: mutating tool proposals become visible refusals, and the old confirm and decline routes return a conflict.
- UI: `web/src/components/AgentPanel.tsx`.

### Job sourcing
- `job-sources/`: public ATS listing readers (28 ATS URL families), employer-board discovery (SearXNG, optional Common Crawl, and ATS-link harvesting), and nine aggregators. Jobicy is limited to hourly refreshes and Himalayas to daily refreshes, with source attribution preserved in the feed. Credential-gated sources remain inactive until configured. Entry point `job-sources/collect.mjs`; Apify stays optional and may incur charges.

### LLM
- `llm-client.mjs`: routes writing tasks only to the explicitly enabled NVIDIA-compatible hosted provider, with shared pacing and bounded retries. Form-profile mapping reuses deterministic local question rules; sensitive questions never reach a model.

### OCI (built, never deployed)
- `docker-compose.oci.yml`, `docker/Dockerfile.api`, `docker/Dockerfile.bridge`, `docker/bridge-entrypoint.sh`, `docker/llm-entrypoint.sh`, `scripts/setup-oci.mjs`, `oci-env.mjs`, `scripts/oci/{cloud-init.yaml,deploy.sh,backup.sh}`, `docs/oci-deploy.md`, `secret-store.mjs`.

### Frontend
- `web/src/screens/*` (Applications, Workspace, Questions, Overview, Discover, Mail, Calendar, Tracker, Materials, System, TailoringReview), `web/src/components/*` (Shell, AgentPanel, ApplicationReview, ApplicationProcessing, MailComposer, CompanyLogo).
- Calendar uses labelled sample data. Everything else reads real data.

## 5. Status

Done and tested: guest sign-in gate; review-before-submit setting; flow-guard reset; tailoring engine and review UI; mailbox (sync, threads, drafts, review-then-send with uncertain-send protection); saved assistant conversations (read-only); application review UI; OCI files; job-sourcing modules; question drafting; consent Yes/No cards (unit-tested).

Built, not run live: consent tick on a real employer form; job sourcing against real boards; the whole OCI stack; the tailoring engine with the real model on more than one posting.

Added 2026-10-17 (all covered by tests, none run against a live employer or real Proton mail):
- Task origin tracing (`task-origin.mjs`); dropdown option cache; Workday branches moved into `ats-hooks.mjs`.
- Form features: open shadow roots, work-history and education blocks from the resume (`form-history.mjs`), per-field date formats, Lever hCaptcha pause, Ashby drop zone fixtures.
- Sign-in profiles for iCIMS, Avature and SuccessFactors (`ats-auth.mjs`, used by `ats-login.mjs`); inline review edits (`POST /api/tasks/:id/review-edits`, `review-edits.mjs`).
- Jake resume through Tectonic (`latex-resume.mjs`, `scripts/prefetch-tectonic.mjs`; run the prefetch once, renders then work offline at 10, 11 and 12pt and shrink to one page).
- Calendar (`calendar-ics.mjs` with `ical.js`, `calendar-service.mjs`, `calendar-routes.mjs`): invites found in mail, manual events, RSVP saved only as a mail draft that goes through review-then-send. Tracker (`tracker-model.mjs`, `/api/tracker`): stages, automatic Ghosted with undo, notes, timeline, funnel.
- Assistant actions (`agent-actions.mjs`, `agent-approvals.mjs`): add link, collect, prepare run at once; fill, submit, mail draft and plain answers wait on a durable card. Not wired on purpose: consent, resume accuracy approval, settings. Cards are bound to a fingerprint of what was shown (review token, checkpoint, prepared task), not to the global state revision, because that moves every few seconds while a worker runs.
- Design tokens in `web/src/index.css` (light and dark, AA contrast checked by `tests/design-tokens.test.mjs`), theme toggle, live updates over `/api/events` (server-sent events, polling as fallback), Vitest for `web/src/lib` (`npm run web:test`).

Job pulling (2026-10-17): `scripts/job-sources-trial.mjs` runs the real pipeline against a throwaway registry and writes a report to `trial-output/` without touching state (`--pass 1|2|3`). Live runs showed that Common Crawl is flaky and alphabetical, has no Lever pages, and that Workable throttles hard (the HTTP client now slows and then skips a throttling host). Fixed from the trials: ATS interleaving in `registry.due()`, Greenhouse company names, country-aware location filter (`job-sources/geo.mjs`).
Feed freshness: scheduled collection every 60 minutes by default (`collection-schedule.mjs`, Discover controls); each complete board listing refreshes `last_seen_at`, and a job missing from two listings in a row is marked closed and hidden (`job-sources/freshness.mjs`); posted-date limit default 30 days; `ensureJobOpen` checks the posting (`job-sources/open-check.mjs`) before tailoring or filling and from the Discover "Check still open" button. Workday lists are search results, so they never close jobs; they rely on the open check.

Not started: see section 7.

## 6. Reset and checkpoint procedure (run only when the applicant says so)

The applicant asked for a clean pipeline with no leftover applications. The repository's `application-cleanup.mjs` protects two submitted applications by design. Before running anything, ask the applicant whether to keep those two, because "remove everything" and "protect receipts" conflict.

1. Bring up PostgreSQL and Redis (`npm run infra:up`). Pause running tasks (`POST /api/tasks/<id>/pause`). Stop every `node server.mjs`. Close the automation Chrome using `data/browser-profile`.
2. Archive into `data/backups/checkpoint-YYYY-MM-DD/`:
   - `database.sql` from `pg_dump -U daymark daymark` run inside the postgres container;
   - `data.tar.gz` of `data/` without the browser profiles and `backups/`;
   - `code.tar.gz` of the project without `node_modules`, `data/` and `.env*`;
   - `MANIFEST.txt` with checksums, the database revision, record counts and the restore commands.
   Test-restore `database.sql` into a scratch database and compare counts.
3. Dry run: `cleanupPreview(state)` prints exactly what would be removed, with a fingerprint. The applicant approves that fingerprint.
4. Apply with `applyCleanup(state, preview, fingerprint)` in one transaction that checks the revision as a number (PostgreSQL returns it as text, which once made a guard fail), writes revision plus one, and verifies the row count.
5. Delete the generated files listed in `state.cleanup.pendingFiles`. Clear `data/adapters/` so no host stays trusted for auto-submit.
6. Verify: counts match the preview, protected applications and receipts are intact, the revision rose by one, auto-apply is off, no stray processes.

Never delete browser profiles: they hold employer logins.

## 7. What to build next, in order

Each item: goal, steps, done when. Add tests in the same change.

### 7.0 Find what created tasks on its own
On 2026-10-16 at 01:19, prepare and fill tasks for two jobs appeared with no known trigger. Only `POST /api/tasks` and `runAutoApply` create prepare tasks, and auto-apply was off.
- Add `createdBy` and `source` to every task and log one line per creation.
- Look at restart recovery near the end of `server.mjs` and at BullMQ jobs that survive a restart (`redis-task-queue.mjs`).
- Done when: a restart with auto-apply off creates zero tasks, proven by a test.

### 7.1 OCI deployment and the self-hosted model
The earlier steps in this section are obsolete. Follow [`docs/hybrid-llm.md`](hybrid-llm.md), which keeps Proton Bridge on the Mac and uses deterministic local rules for safe form-profile mapping after the local model benchmark failed its latency and output-quality gates.

OCI verification on 2026-10-17 found a Free Trial tenancy in US East (Ashburn), a 200 GB Always Free volume quota with 0 used, and an A1 shape marked Always Free-eligible. Oracle's current Always Free documentation sets the post-trial A1 ceiling at 2 OCPU / 12 GB. Do not upgrade to Pay-As-You-Go or follow the old 4/24 GB target. Provisioning waits for the memory budget and remaining acceptance gates in the hybrid runbook.

### 7.2 Job sourcing live
Set `SEARXNG_URL=http://searxng:8080`; run one Common Crawl discovery pass and a scheduled collection; check de-duplication, ATS tagging and per-host rate limits. Done when a run returns postings from Greenhouse, Lever and Ashby and quiet boards are polled less often.

### 7.3 Jake's resume in real LaTeX
- Template: Jake Gutierrez's resume (MIT licence); keep the licence file with it.
- Renderer: Tectonic (single binary, arm64 build). Install it in `docker/Dockerfile.api` and on the Mac.
- New `latex-resume.mjs`: `escapeLatex` for `\ { } $ & # ^ _ % ~`; `renderJake` builds `.tex` from the resume sections (header, Education, Experience, Projects, Technical Skills; omit empty sections) and runs `tectonic --untrusted` with a 30-second timeout and no shell escape.
- Wire into `resume-export.mjs` when `template === 'jake'`; fall back to the current pdfkit output if Tectonic is missing or fails. DOCX is unchanged.
- Tests: escaping (a line containing `\input{/etc/passwd}` prints literally), section omission, the PDF text parses back with every section, date and keyword in order (`pdfjs-dist`), runaway build is killed.
- Done when a Jake PDF renders for the demo profile, passes the parse check, and is one page for under 10 years of experience.

### 7.4 Assistant actions with durable approvals
The current assistant is read-only by design. To add actions:
1. Add an approval ledger table: pending action, bound state revision, expiry, state (`pending`, `confirmed`, `declined`, `expired`, `done`), actor.
2. Wire executors only to existing routes: prepare (with `autoFill:false`), collect, add job link, draft text; and, behind confirmation cards, fill, approve resume, submit, send mail, answer question, answer consent, change settings.
3. A confirmation binds to the exact state revision and fails with a conflict if the state changed.
4. Every action writes an activity entry with `actor: 'agent'`.
5. Show confirmation cards in `AgentPanel.tsx` with summary, Accept, Decline and a countdown.
- Done when: a submit request never runs without an accepted card; an expired or declined card does nothing; text inside a job page cannot trigger a tool; executors call the same code as the buttons.

### 7.5 Redesign
- One token set in `web/src/index.css` (colour, type scale, spacing, radius, elevation, focus ring), light and dark.
- Shell: grouped sidebar, a ⌘K palette, a top bar with worker status and queue, a skip link.
- Screens, in order: Applications (sortable table, saved views, side drawer), Workspace, Questions, Overview, Discover, Mail, Calendar, Tracker, Materials, System.
- Bring "Resolve this step" and "Continue processing" (`POST /api/tasks/:id/handoff` and `/handoff/resume`) into the new UI. They exist only in `/legacy` today.
- Live run panel over Server-Sent Events (`/api/events`), keeping polling as the fallback.
- Accessibility (WCAG 2.2 AA): contrast at least 4.5:1, visible focus on every control, status never by colour alone, tables with `<th scope>`, targets at least 24 px (44 on touch), respect `prefers-reduced-motion`.
- Done when every screen works at 1280 px and 375 px with no console errors and the legacy UI can be removed.

### 7.6 Calendar and tracker
- Calendar: `calendar_events` linked to applications; parse `.ics` invites from mail (`ical.js`); RSVP as an iTIP reply through the existing review-then-send path; month, week and agenda views; reminders. Replace the sample data.
- Tracker: stages Saved, Applied, Screening, Assessment, Interviewing, Offer, plus Rejected, Withdrawn, Ghosted (automatic after N quiet days, with undo); a timeline per application; analytics by tailoring mode, resume variant, ATS and source.

### 7.7 Remaining autofill gaps
Dropdown option cache in `captureQuestions` (key: host, step, question key); move the 13 Workday branches in `server.mjs` into adapter hooks in `ats-adapters.mjs`; repeating work-history and education sections; masked, split and picker dates; open shadow roots; Lever hCaptcha (pause) and Ashby drop zones; iCIMS, Avature and SuccessFactors sign-in in `ats-auth.mjs`. Each gets an HTML fixture in `tests/fixtures/ats/`.

### 7.8 Verify the consent tick on a real form
When the applicant starts an application whose form has a consent box: answer the card, watch the box get ticked or left clear, confirm the verification step, and stop at review. Do not submit as part of the test.

## 8. Known issues

- Docker Desktop stops on its own and takes PostgreSQL down.
- `npm start` prints a raw stack trace when PostgreSQL is unreachable; it should print one clear line (fix in `server.mjs` around `createPostgresStateStore`).
- The unexplained task creation in 7.0.
- "State revision moved backwards" warnings after restarts (safe; the write is refused).
- Web search and fetch tools were unavailable in some sessions, so design references were not researched from the web.
- `tests/browser-ui.mjs` still targets the old interface (`.home-welcome`) and fails against the React build; rewrite it for the React screens or retire it.
- Tailoring is strong-only (the aggressive and honest modes are clamped to strong in `server.mjs`).
- Two test skips need a browser that the test runner cannot find without `DAYMARK_TEST_CHROME`.

## 9. Conventions

- Server code: ES modules (`.mjs`), small pure modules with injected dependencies (model, fetch, clock), matching the surrounding style.
- Frontend: TypeScript under `web/src`, Tailwind and the primitives in `web/src/components/ui`. Sentence-case labels, one primary button per view.
- Errors tell the applicant what happened and what to do; no raw exception text.
- Every new route validates input, bounds sizes, rejects cross-origin writes, and has a test.
- Never log mail bodies, addresses, credentials, resume text or model content.
