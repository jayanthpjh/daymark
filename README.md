# Daymark

Daymark is a local job-search and application-preparation app for macOS. Its dashboard and worker run on your Mac at `http://127.0.0.1:4173`.

## Start Daymark

1. Install Node.js 20 or newer and Google Chrome.
2. In this folder, run `npm install` once, then `npm start`.
3. Open `http://127.0.0.1:4173` in your browser. Keep the terminal window running; the background worker runs while the Mac is awake.
4. In Settings, enter an Apify API token, NVIDIA API key, and your Proton application email. Keys are stored in a private `.env` file on this Mac.
5. In My profile, add target roles and locations, save your verified details, and upload a text-based PDF or DOCX resume.
6. Choose Collect jobs. The feed requests 200 actor results, filters duplicates, and stores at most 100 new roles per day.
7. Choose Prepare application on a role. The pilot prioritizes existing verified resume bullets for that job locally, preserving every source line and qualification. It does not generate cover letters. NVIDIA remains available for resume parsing and separately approved answer drafting.
8. Review the editable resume, change log, source notes, and optional suggestions. Suggestions remain separate until you confirm them; project ideas require a separate check that you completed the project. Each approved edit creates a downloadable PDF and DOCX version.
9. Applications on supported ATS sites are filled automatically and always stop for final review. Approve the resume, review the filled answers, then explicitly submit. Approval is bound to that application and its reviewed materials; edits require another approval.

## Mail and login setup

Install and sign into Proton Mail Bridge yourself. In Settings, enter the local IMAP username and generated Bridge password shown by the Bridge app; Daymark stores that password in macOS Keychain. The Inbox page can then list recent messages locally. It does not send mail content or verification codes to NVIDIA.

ATS credentials can be saved in Settings to `data/ats-credentials.json` with owner-only permissions. Save a default login for portals that share your account, and add a hostname-specific login when a portal uses different credentials. Daymark fills matching credentials only when a supported application page asks you to sign in; it submits recognized sign-in forms once and can enter a matched Proton Bridge verification code once. Ambiguous forms, SSO, CAPTCHA, registration consent and password resets pause for you.

## Optional Apple Silicon Docker worker

The default `npm start` mode still runs Daymark as one local process. The split mode keeps the dashboard/API and Proton Bridge on the Mac and runs the queue and Playwright Chromium in a dedicated worker container. Run `npm run worker:setup` once to generate a private local PostgreSQL password, configure loopback-only PostgreSQL/Redis URLs in `.env`, and refresh `.env.worker` without removing existing ATS/API values. Review `.env.worker`, then start the Mac API with `npm run start:api`.

The setup helper copies only the NVIDIA, Apify, and local database connection settings needed by the worker; Proton Bridge and application-account credentials are excluded. ATS credentials are mounted separately as a read-only runtime secret, and the credential file is masked inside the general shared data volume. PostgreSQL stores the existing Daymark state contract plus transactional checkpoint snapshots; on first use it imports `data/state.json` once. Redis/BullMQ dispatches task IDs only, with one worker consumer; the existing single-owner lease and safe submit-recovery checks remain active. PostgreSQL and Redis use persistent Docker volumes and publish ports on `127.0.0.1` only. The image pins Playwright/Chromium to `1.63.0`, targets `linux/arm64`, and uses its own `data/docker-browser-profile` directory. The shared Daymark data directory is mounted at the same absolute path so generated-document paths remain valid. The worker API is not published; its noVNC browser viewer is bound to `127.0.0.1:6080` only.

After reviewing the setup, start the database/cache with `npm run infra:up`, then start or stop the browser worker with `npm run worker:up` and `npm run worker:down`. To stop PostgreSQL and Redis while retaining their named volumes, run `npm run infra:down`. To restart the API, stop its running terminal with Ctrl+C and run `npm run start:api` again. Confirm the API at `http://127.0.0.1:4173/api/health`; `/api/state` reports whether Daymark is using PostgreSQL/Redis or its compatible JSON/poller mode. Docker Desktop and the Mac must stay awake while tasks run. Do not run `npm start` alongside the split API and Docker worker. See [the worker plan](docs/local-docker-worker-plan.md), [agent architecture](docs/job-application-agent-architecture.md), and [implementation tracks](docs/implementation-tracks.md) for contracts, recovery, and the Keychain boundary.

## Local data

Profile, imported resume, answer pack, jobs, generated documents, and tasks are stored under the ignored `data/` directory when using the default JSON mode, or in the local PostgreSQL volume after the one-time import. PostgreSQL checkpoints and the Redis queue are backed by named Docker volumes. API keys, the generated local database password, and service URLs are in the ignored `.env` file. Keep backups private. Removing `data/` deletes local files and saved ATS credentials; removing the named database volume deletes the PostgreSQL copy of Daymark history; removing `.env` clears provider and database connection settings.

## Supported scope

Job discovery uses the Apify `fantastic-jobs/career-site-job-listing-feed` actor. The versioned ATS registry prioritizes Greenhouse, Avature, and SuccessFactors from the current collection mix, and retains Lever, Ashby, Workday, SmartRecruiters, and iCIMS. Employer-specific schema snapshots stay declarative and versioned. ATS authentication is checked before applicant profile fields or a resume are sent; unsupported or guest-only flows pause safely. Workday sign-in/registration is automated with bounded retries; other recognized ATS sign-in forms use a host-scoped, single-attempt login flow. Password resets, CAPTCHA, ambiguous verification, and consent remain user checkpoints. Proton Bridge can return only an OTP after task, recipient, employer, sender, and time matching; mailbox content and credentials stay on the Mac side. Selectors can vary by employer and page version; inspect each opened application page. The agent clicks the exact final Submit control once, only after the form reaches its review step. It stops and asks you for validation errors, unanswered required questions, unknown consent boxes, an ambiguous or missing Submit button, and any application whose status you recorded manually. If no confirmation page appears, the application is marked Submission unconfirmed and Submit is never clicked again automatically. The application browser session must still be open; after a restart, refill the application first.

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

The Mac API must stay running for the Docker worker to request matched Proton codes through its local socket. Passwords stay in the existing owner-only vault; Bridge credentials remain in Keychain and never enter the worker image, LLM prompts or audit events. Start the API with `DAYMARK_DISABLE_MAIL_FORWARDING=true npm run start:api` to suppress forwarding during a pilot session.


## Sign-in and guest applications (2026-10-15)

Sites that accept applications without an applicant account (Greenhouse, Lever, Ashby, SmartRecruiters and unknown career sites) are filled as a guest. Sites that require an account (Workday, iCIMS, Avature, SuccessFactors) sign in first with the saved login. A visible sign-in, registration, verification, password-reset or CAPTCHA screen always pauses, even on guest sites, and unsupported account flows pause for manual sign-in. The gate runs before applicant data, resume reattachment and final submission.

The visible in-app browser and Docker worker have separate sessions. A MyGreenhouse tracking account is no longer needed for guest Greenhouse applications. Previously completed applications are not resubmitted.


## Tailoring modes (2026-10-15)

Each application, and the default in Automation rules, has a tailoring mode: **honest** (the default; reorders your own bullets, nothing added), **strong** (rewrites the summary, skills and bullets from your own evidence and drops anything it cannot trace to your resume), and **aggressive** (also adds realistic skills, tools and quantified results to match the posting). Every changed line is tagged `source`, `rewritten` or `invented`; the tag is computed from the text (new figures or job keywords your resume never mentioned), not from what the model says it did. Invented claims are listed in the review for you to strike, saved to a claims ledger, and get an interview-prep note. A new claim that contradicts one already sent to the same company is flagged.

Employers, job titles, dates, degrees, schools, certifications, clearances and contact details are never changed or invented in any mode; if a draft touches them the original wording is kept. Application form answers stay factual. If the model is unavailable, preparation falls back to honest mode and says so. Cover letters are generated in strong and aggressive modes unless turned off.

Local starts now supervise the backend: a stopped child restarts with delays of 1, 2, 4, 8 and 16 seconds. Five repeated failures stop the runner instead of creating a restart loop; a healthy minute resets the budget. Ctrl+C stops the runner and its child. Fatal/restart events are recorded without application content. Docker/systemd retain their own restart policy when launching `server.mjs` directly.

If Docker Desktop stops, the configured PostgreSQL/Redis services are unavailable. Start Docker and run `npm run infra:up` to restore them using the existing volumes. Do not reset volumes or switch to a blank JSON store. Database pools reconnect when storage returns. `/api/health` reports 503 when saved state cannot be read; process liveness alone is not readiness. An interrupted submit remains uncertain and is never automatically clicked again.
