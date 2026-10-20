# Daymark

Daymark is a local job-search and application-preparation app for macOS. Its dashboard and worker run on your Mac at `http://127.0.0.1:4173`.

## Start Daymark

1. Install Docker Desktop and Node.js 20 or newer.
2. In this folder, run `npm install` once.
3. If migrating an existing Docker-backed installation, run `npm run docker:backup` while its `daymark-postgres` container is running, before setup changes local settings. Then run `npm run worker:setup` and `npm run worker:up`.
4. For a new setup, run `npm run worker:setup` and `npm run worker:up`.
5. Open `http://127.0.0.1:4173`. Keep Docker Desktop and the Mac awake while tasks run.
6. Open the legacy settings page at `http://127.0.0.1:4173/legacy` to enter an Apify API token, your NVIDIA API key, and your Proton application email. NVIDIA calls remain gated until its production terms and costs are approved.
7. In My profile, add target roles and locations, save your verified details, and upload a text-based PDF or DOCX resume.
8. Choose Collect jobs. The feed requests 200 actor results, filters duplicates, and stores at most 100 new roles per day.
9. Choose Prepare application on a role. With NVIDIA gated off, preparation uses verified source material and deterministic tailoring; cover letters and AI answers require the approved NVIDIA API path.
10. Review the editable resume, change log, source notes, and optional suggestions. Suggestions remain separate until you confirm them; project ideas require a separate check that you completed the project. Each approved edit creates a downloadable PDF and DOCX version.
11. Applications on supported ATS sites are filled automatically and always stop for final review. Approve the resume, review the filled answers, then explicitly submit. Approval is bound to that application and its reviewed materials; edits require another approval.

## Mail and login setup

Proton Mail Bridge remains a Mac app. The current Docker setup deliberately pauses Bridge sync, forwarding, OTP retrieval and outbound mail because Docker Desktop cannot share the host's local Unix socket safely, and Bridge may listen only on Mac loopback. Do not enter Bridge credentials or enable mail features until a restricted relay is implemented and verified. Existing locally stored messages and drafts remain available; OTP-required sign-ins stop for manual verification.

ATS credentials can be saved in Settings. Daymark encrypts saved passwords with AES-256-GCM in `data/secrets/ats-credentials.json`; the private key is stored separately in `data/secrets/ats-credential-key`, and the browser worker mounts both files read-only. Save a default login for portals that share your account, and add a hostname-specific login when a portal uses different credentials. Daymark fills saved credentials only on a recognized sign-in form. If the password is rejected, the session expires, or the employer requests a reset, the application pauses for you to recover through the employer and update the saved password in Settings. Daymark does not request or submit a password reset. SSO, CAPTCHA, OTP, registration consent and unfamiliar sign-in forms also pause for you. Each application uses an isolated persistent browser profile, so employer session cookies can survive a Daymark restart. Refill the application after restart to reopen its saved page; browser history can restore a page but cannot authenticate an expired session. Daymark uses only saved credentials for that ATS and never imports cookies from your ordinary browser, Codex, or OCI console. It selects “necessary only” or “reject optional” when that exact cookie choice is offered; ambiguous cookie banners pause for your choice.

## Local Docker app

The one-user setup runs the dashboard/API, PostgreSQL, Redis, Playwright worker, and MCP in Docker on this Mac. Proton Mail Bridge remains a Mac app; no cloud resources or model server are part of the stack. For an existing Docker-backed installation, run `npm run docker:backup` before setup changes `.env`. Then run `npm run worker:setup` once. This creates private `.env` and `.env.worker` settings, a random PostgreSQL password, and a local MCP token while preserving existing provider settings. Review `.env.worker`, then run `npm run worker:up`.

Open `http://127.0.0.1:4173`. The dashboard and browser viewer (`http://127.0.0.1:6080`) bind to loopback; PostgreSQL and Redis ports are private to the Compose network. Application files and browser profiles remain under the ignored `data/` directory, while PostgreSQL and Redis use persistent named volumes. Existing `data/state.json` is imported once into PostgreSQL if the database has no Daymark state. The worker remains single-concurrency, and submission still requires your explicit review and approval.

Before switching an existing setup, preserve its state and database with `npm run docker:backup`. It writes a private archive and PostgreSQL dump under `data/backups/`. To stop the full stack without deleting data, run `npm run docker:down`; `npm run worker:down` is an alias. Docker Desktop and the Mac must stay awake while applications run. Do not run `npm start` or `npm run start:api` alongside this stack.

MCP Streamable HTTP is served by the local API at `http://127.0.0.1:4173/mcp` and uses the generated bearer token; no remote access is enabled. Local MCP clients use stdio through Docker: configure their command as `npm` with arguments `run`, `mcp:stdio`, and set the working directory to this repository. The Compose API service must be running. MCP cannot approve or submit applications.

NVIDIA is the only optional model API. Docker forcibly keeps the separate `DAYMARK_NVIDIA_LIVE_APPROVED` production gate off, so a saved NVIDIA key or hosted-writing setting cannot send real resume or application data. Keep it off until the specific account and endpoint permit production use and expected charges fit the $7/month total budget. Source-backed preparation and manual answers remain available. No local model server is included.

Proton Bridge remains on the Mac. Although Docker Desktop exposes the host as `host.docker.internal`, the current Compose setup keeps mail and OTP paused because the host-mounted Unix-socket handoff is unsupported and the default Bridge listener may accept connections only from Mac loopback. A successful connection check alone is not available in this setup; enable mail only after a restricted relay replaces the unsupported socket handoff. Never expose Bridge, MCP, PostgreSQL, Redis, or the browser viewer publicly. See [the worker plan](docs/local-docker-worker-plan.md), [agent architecture](docs/job-application-agent-architecture.md), and [implementation tracks](docs/implementation-tracks.md) for recovery contracts and local boundaries.

## Local data

Profile, imported resume, answer pack, jobs, generated documents, ATS credentials, Bridge secrets, and browser profiles stay under the ignored `data/` directory. PostgreSQL and Redis state use named Docker volumes; `.env` stores private provider, database, and MCP settings. Keep backups private. Removing `data/` deletes local files and saved credentials; removing the named database volume deletes PostgreSQL application and approval history; removing `.env` clears provider and connection settings.

## Supported scope

Job discovery reads public listing APIs across supported ATS boards, searches for more boards through local SearXNG, and combines free job-source APIs. The supported ATS URL catalog covers 28 platforms; actual listing-reader coverage depends on each platform's public endpoint. Free sources now include Jobicy and Himalayas alongside Remotive, Remote OK, Arbeitnow, Hacker News, and The Muse when its required API key is configured. Jobicy and Himalayas listings keep visible source links and use their source-approved application URLs. Jobicy is polled no more than hourly; Himalayas is polled daily. Adzuna and USAJobs remain inactive unless their credentials are configured. Apify is optional and can incur charges, so it is not part of automatic collection. LinkedIn, Indeed, Glassdoor, and ZipRecruiter are not crawled; their login-walled listings are never filled. This is an expanding source catalog, not a claim of Tsenta's advertised 50,000-page coverage. ATS authentication is checked before applicant profile fields or a resume are sent; unsupported or guest-only flows pause safely. Workday sign-in/registration is automated with bounded retries; other recognized ATS sign-in forms use a host-scoped, single-attempt login flow. Password resets, CAPTCHA, ambiguous verification, and consent remain user checkpoints. Proton Bridge can return only an OTP after task, recipient, employer, sender, and time matching; mailbox content and credentials stay on the Mac side. Selectors can vary by employer and page version; inspect each opened application page. The agent clicks the exact final Submit control once, only after the form reaches its review step. It stops and asks you for validation errors, unanswered required questions, unknown consent boxes, an ambiguous or missing Submit button, and any application whose status you recorded manually. If no confirmation page appears, the application is marked Submission unconfirmed and Submit is never clicked again automatically. The application browser session must still be open; after a restart, refill the application first.

Application question suggestions use NVIDIA only after a per-question confirmation in the UI (when offered). Eligibility, legal, demographic, background-check, work-authorization, and consent questions require your own answer. CAPTCHA and account recovery steps remain yours to complete.

## Filling applications (Tsenta-style)

Daymark fills every answerable question on each application step, in this order: your profile (Profile → Application details), your Answer pack (work authorization, sponsorship, relocation, travel, availability, optional EEO choices you saved), answers you explicitly saved before (reused when compatible; edit them under Answer pack → Learned answers), and, only if you turn on **AI-drafted answers** in Settings, a grounded draft for open-ended questions (question text, tailored resume and job description go to NVIDIA; never used for legal, demographic or consent questions). It stops only for required questions it cannot answer, validation errors, CAPTCHAs and consent boxes. The review screen shows an application receipt: every filled value with its source, the optional questions that were skipped, and how many answers were AI-drafted.

Sites without a built-in adapter get a dynamic adapter: Daymark finds the Apply control (following links, popups and redirects to known ATS sites), reads the form's questions, and remembers per-host entry details under data/adapters. New sites follow the same authentication gate and verified submission checks. Login-walled boards (LinkedIn, Indeed, Glassdoor, ZipRecruiter) are never filled. Recognized non-Workday sign-in forms are automated with one saved attempt; account creation remains manual.


## Automatic submission and recovery (2026-10-05)

Review before submit is required in this pilot. Daymark checks the resolved employer/application identity, current required fields, live PDF/DOCX attachment, and an exact Submit control before clicking once. Actual CAPTCHA challenges, authentication, legal attestations and unsupported controls pause for manual resolution. A missing confirmation is an uncertain outcome, never Applied, and is never retried automatically. Resolve this step opens the dedicated employer session, including for uncertain submissions. Previously saved documents, approvals and manual statuses are preserved. Remember for future applications is unchecked unless selected for that draft.


## Source-only pilot (2026-10-14)

The existing Apify feed, per-job tasks, local PostgreSQL/JSON state, BullMQ/poller queues, ATS adapters, checkpoints and tracker remain in use. Tailoring reorders contiguous source bullet groups using job-description overlap; it never adds tools, years, achievements or projects. Unchanged bullet order is valid when the source has no relevant bullet groups. Cover-letter generation is disabled for this pilot.

Explicit submission approval is recorded as a hash of the job, resume version, documents, employer identity and filled-answer receipt. The worker checks it before processing and again immediately before the durable submit attempt. A completed task or timestamp alone is not ATS confirmation. Missing or ambiguous receipts stay uncertain and are not retried automatically.

Flow fingerprints persist across resumes, so continuing an unchanged completed step cannot reset cycle detection. Correcting the form changes its fingerprint. Per-run steps remain capped at 12, with 36 attempts across resumes. Navigation has three bounded attempts; sign-in has one saved attempt per credential version. A changed password clears the saved login-attempt guard; account state survives the pending-queue reset to prevent repeated lockouts.

The Docker API currently does not provide Proton codes to the worker: the Bridge relay is not implemented, and mail sync, OTP retrieval, forwarding and outbound sends stay paused. ATS passwords stay in the owner-only credential file; no Bridge password is needed while mail is paused. Neither enters the worker image, LLM prompts or audit events.


## Sign-in and guest applications (2026-10-15)

Sites that accept applications without an applicant account (Greenhouse, Lever, Ashby, SmartRecruiters and unknown career sites) are filled as a guest. Sites that require an account (Workday, iCIMS, Avature, SuccessFactors) sign in first with the saved login. A visible sign-in, registration, verification, password-reset or CAPTCHA screen always pauses, even on guest sites, and unsupported account flows pause for manual sign-in. The gate runs before applicant data, resume reattachment and final submission.

The visible in-app browser and Docker worker have separate sessions. A MyGreenhouse tracking account is no longer needed for guest Greenhouse applications. Previously completed applications are not resubmitted.


## Tailoring modes (2026-10-15)

Each application, and the default in Automation rules, has a tailoring mode: **honest** (the default; reorders your own bullets, nothing added), **strong** (rewrites the summary, skills and bullets from your own evidence and drops anything it cannot trace to your resume), and **aggressive** (also adds realistic skills, tools and quantified results to match the posting). Every changed line is tagged `source`, `rewritten` or `invented`; the tag is computed from the text (new figures or job keywords your resume never mentioned), not from what the model says it did. Invented claims are listed in the review for you to strike, saved to a claims ledger, and get an interview-prep note. A new claim that contradicts one already sent to the same company is flagged.

Employers, job titles, dates, degrees, schools, certifications, clearances and contact details are never changed or invented in any mode; if a draft touches them the original wording is kept. Application form answers stay factual. If the model is unavailable, preparation falls back to honest mode and says so. Cover letters are generated in strong and aggressive modes unless turned off.

Local starts now supervise the backend: a stopped child restarts with delays of 1, 2, 4, 8 and 16 seconds. Five repeated failures stop the runner instead of creating a restart loop; a healthy minute resets the budget. Ctrl+C stops the runner and its child. Fatal/restart events are recorded without application content. Docker/systemd retain their own restart policy when launching `server.mjs` directly.

If Docker Desktop stops, Daymark pauses. Start Docker and run `npm run worker:up` to restore the app using the existing volumes. Do not reset volumes or switch to a blank JSON store. Database pools reconnect when storage returns. `/api/health` reports 503 when saved state cannot be read; process liveness alone is not readiness. An interrupted submit remains uncertain and is never automatically clicked again.
