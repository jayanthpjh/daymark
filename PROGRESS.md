# Daymark progress

Last updated: 2026-10-05

## 2026-10-05 — Application processing repair

- Automatic submission is the default after verified employer identity, live attachment and required-field checks. Review remains an optional setting; protected-fact inconsistencies still pause.
- Career-site redirects now use the resolved Workday employer for authentication, checkpoints and recovery; original postings remain saved privately.
- Transient navigation retries are bounded. Frontend errors hide raw browser commands, terminal formatting, authentication URLs and private locators.
- Required/conditional controls refresh during filling. Application-only confirmed answers can recover when the question schema is unchanged; reusable answers require an explicit save choice.
- Resume replacement recovers through the normal fill pipeline after a restart and checks the current PDF/DOCX file. Historical upload records cannot authorize submission.
- Submit clicks are recorded before execution. Paused, completed or manually recorded outcomes block execution. Employer rejection, uncertainty and confirmed receipt remain separate outcomes.
- Hidden CAPTCHA badges alone do not create manual challenges; actual challenges and legal attestations pause. Uncertain submissions can open their saved session without another automatic click.
- Verification: 112 regression tests passed with permitted local networking, no skips. Synthetic API checks passed for automatic submission, review compatibility, queue recovery, answer-saving defaults, document replacement, batch limits/eligibility and collection retries/cap.
- Local state was backed up under data/backups before rollout. Final live application results are in APPLICATION-REPAIR-REPORT.md.

## Implemented in this workspace

- Resume PDF/DOCX upload parses locally into editable profile fields; users review extracted values before saving.
- Confirmed profile details produce a reusable master resume. Per-job resume and cover letter generation sends the confirmed profile, resume, and job description to NVIDIA only after the per-job confirmation.
- Tailored resume drafts include a change log with source status and a live formatted preview. Download and form-fill actions are gated on user review.
- Model-suggested claims stay unchecked and separate from the draft. Project ideas require a distinct confirmation that the user completed them. Employer/title/date/contact/client facts from the confirmed profile are checked before approval.
- Each approved resume revision creates a separate PDF and DOCX version. Cover letters remain application-specific DOCX files.
- Main workspace pages use bundled Inter, neutral surfaces, dark text, blue-violet actions, clearer focus indicators, and responsive review layouts. Sidebar styling is preserved.
- ATS credentials support a default login plus hostname-specific overrides. The local fill flow only populates visible username/password fields on supported ATS domains, leaves the sign-in click and MFA/reset work to the user, and reuses the existing Chrome session when the task resumes. Passwords are kept in an owner-only local file and never sent to NVIDIA.
- Resume scoring remains deferred.

## Verification

- `node --check server.mjs` and `node --check public/app.js` pass.
- `node --test tests/workflow.test.mjs` passes all 6 tests.
- Isolated API checks confirmed DOCX parsing populates profile fields; ATS default and host-specific credentials persist with mode 0600 and the read endpoint omits passwords.
- Isolated review API checks confirmed project ideas require completion attestation and produce versioned PDF/DOCX downloads.
- Rendered a synthetic resume PDF and inspected its page layout; it is readable and fits a Letter page.
- Browser screenshot review confirmed the refreshed desktop setup screen. The layout includes responsive CSS and keyboard focus states.
- `npm audit --omit=dev` reports zero vulnerabilities.

## Resume here

1. Run `npm start` and upload a real selectable-text PDF or DOCX; confirm extracted profile fields and correct any parsing errors.
2. Confirm the profile, finish the answer pack, then prepare a role with the per-job NVIDIA confirmation and review the tailored draft and versioned exports.
3. Configure a default ATS email/password or a site-specific override. Verify sign-in autofill only on a supported ATS and complete sign-in/MFA/reset manually in Chrome and Proton Inbox.
4. Test the remaining supported ATS adapters and complete keyboard/mobile checks on the user's Mac.

This workspace does not contain a `.git` directory. The changes are local to this workspace and have not been committed or pushed.

## 2026-10-04: collection limit and labeled mailbox

- Apify starts explicitly use `maxItems=200`, with a 200-item feed and 100-new-job daily import cap. Provider codes are retained; failed starts do not consume the daily collection allowance.
- Inbox now has a responsive list/reader, local search/category filters, verification-code copying, safe text links, and custom labels stored in `data/mail-labels.json`. Message IDs hash the Bridge account, INBOX, UIDVALIDITY, and UID; mailbox access is read-only.
- Automatic categories: Verification, Password reset, Assessment, Screening, Interview, Application confirmation, Application update, Offer, Rejection, Other. Mail never goes to NVIDIA.
- Passed 22 unit tests, isolated API tests for label persistence, mocked end-to-end collection failure/retry/cap tests, and browser checks across six widths and seven pages. Inbox browser checks covered custom labels, text safety, search, refresh failure retention, mobile reading, and code copying.
- Collection testing launched no paid Apify runs. Live Bridge delivery depends on the saved Bridge connection.

## 2026-10-04: discovery and reviewed application queue

- Default discovery balances preference match (70%) and freshness (30%); explicit newest/match sorting remains available. Lists use 24-role pagination and retain session filters.
- The first Discover card imports a public job link and shows the imported role immediately. Cards open full details and links; Apply queues preparation with per-job NVIDIA confirmation.
- The approved flow is tailored-resume review, automatic supported-ATS filling after approval, and manual final submission. Existing sign-in, verification, and reset review pauses remain. Repeated requests reuse existing preparation/fill steps.
- Company details are requested on future feed collections, preferring stable company-logo permalinks. Visible cards recover missing/broken logos from public posting metadata, with initials when no usable company logo exists.
- Passed 27 unit tests, isolated queue integration checks, mocked collection checks, and browser checks at six widths across seven pages plus zoom. Browser checks include pagination, URL import, queueing, broken-logo recovery, mailbox behavior, and profile editing. No paid collections or real applications were triggered during testing.

## 2026-10-04: NVIDIA empty-answer and compensation correction

- Reproduced Kimi K3 returning HTTP 200, finish_reason=stop, and reasoning-only output with synthetic text in regular/streaming requests and low/high settings. Kimi K2.5/K2.6 and Mistral Large 2 endpoints returned 404; catalog presence did not imply a usable endpoint.
- Switched structured text requests to the live-tested NVIDIA Nemotron 3 Super 120B model with thinking disabled. Empty or invalid final answers still cannot overwrite saved documents; application failures now suggest task retry instead of local resume parsing. Failed task cards expose Retry.
- Explicit published salary ranges in descriptions are extracted when structured salary is missing. Existing job/task views recalculate compensation; Paramount's $110,000–$165,000 range supersedes the $110,000 fallback.
- Passed 29 unit tests and isolated reviewed-queue checks. Live model diagnosis used synthetic text only; no real application was retried automatically.

## 2026-10-04: separate application workspace and one final review

- Overview is a discovery/workspace snapshot; Applications is a compact card list. Application cards show polling-driven messages and progress with a direct link to a dedicated per-role screen (`#application/<job-id>`).
- The processing screen presents stage progress, timestamped activity, required-control information, tailored preview, and the full final resume editor. Polling updates activity without recreating focused controls or overwriting edits.
- New and existing unapproved preparation tasks use final review: supported forms fill automatically with the factual tailored draft, then pause for one final application/resume approval. Sign-in, verification, and unsupported required controls can still need user input. Unsupported ATS sites retain a manual document flow.
- Final approval queues only attachment replacement in the same application browser page. This preserves filled answers and attaches the approved PDF version without rerunning preparation or requiring another review. Submission remains manual. Existing unapproved drafts and credentials are preserved.
- Passed 32 unit tests, isolated queue API checks, mocked-browser end-to-end filling/attachment replacement, and real browser UI tests at six widths. Browser verification covers separate pages, card progress navigation, final-only editor, and edit preservation during live updates. No real applications were run in tests.

- Fixed the approved/manual application screen's missing-fill error (`run.fill.formSnapshot`). Submission links now safely fall back to the job posting when no browser-fill task exists. Regression browser check confirms approved manual applications render without errors; the running server serves the fix immediately.

## 2026-10-04: manual application statuses

- Dedicated application screens now allow saving In progress, Filled manually (not submitted), Submitted, Screening, Interview, Offer, Rejected, or Withdrawn. A posting's details also provide “Already applied? Update status,” without needing an automated application task.
- Local application records retain user-authored status history and submission timestamps; cards, status filters, and submitted totals update accordingly. Edits persist across reloads.
- Manual status changes stop relevant automatic tasks, preserve documents and credentials, and cannot trigger submission or model calls. Terminal status updates prevent subsequent document edits from restarting browser filling.
- Verified invalid status rejection, unknown job rejection, persistence, record deduplication, and stopping queued tasks in isolated API checks. Browser verification covers saving Submitted, reload persistence, card labels, and submitted filtering. Existing unit/workflow checks pass.

## 2026-10-04: live Workday autofill test

- Tested the user-provided Marathon Petroleum Senior Data Engineer link (requisition 00024516) through the actual manual link grabber. Fixed rejection of valid structured JobPosting metadata when Workday's HTML title is empty; role and full description imported successfully.
- Prepared and saved a real tailored resume/cover letter with the user's existing consent. Opened the actual Workday application in Chrome via Apply → Autofill with Resume.
- Fixed initial Workday loading waits, application entry navigation, form-free login handling, and the accessible Email Address selector. Saved default credentials filled correctly; one sign-in attempt was rejected by Workday (wrong credentials or account locked).
- Current live application job ID: manual-38432568-4b3d-4690-8bce-882e38e6faf0. Fill is needs_you at authentication; resume is saved but was not uploaded, no application fields beyond sign-in were filled, and nothing was submitted.
- User must complete sign-in/create/reset in the existing Chrome application tab, then Continue processing in Daymark. New password entry and required account consent remain user actions. Do not claim full autofill has passed until authentication is resolved.

## 2026-10-04: deterministic Workday account automation

- Added `ats-auth.mjs` for Workday registration, existing-account sign-in, bounded password recovery, email verification links/codes, CAPTCHA pause/resume, and authenticated session reuse. Default credentials alone no longer imply an employer account exists.
- Account records are private, keyed by employer host + career site + application email in `data/ats-accounts.json`. Pending requests and consumed message IDs persist so retries/reloads do not duplicate account creation or recovery. Credentials remain in the existing private store; account metadata is excluded from `/api/state`.
- Authentication uses no LLM. Proton reads remain read-only. Messages must be fresh and match the recipient, Workday sender, employer context, and operation. Links are restricted to the same HTTPS employer host and career site. Browser exceptions are replaced with safe messages to avoid exposing passwords or token URLs.
- Actual Workday screens inspected: Forgot your password? → Forgot Password → Reset Password, plus Create Account with Email Address, Password, Verify New Password and required employer consent. Consent remains an explicit user checkpoint; CAPTCHA and unsupported identity/MFA steps also pause.
- Password recovery tries the supplied password once; employer refusal to reuse it requires updating that employer's password override. Uncertain reset responses are not blindly resubmitted.
- Application fields use the configured application email. Authentication failures retain honest progress and do not enable final document review.
- Verification: 53 unit tests passed, including 18 authentication tests; isolated mocked API final-review/attachment workflow passed. No real account was created, password reset, or application submitted during this implementation. Live registration/verification still needs validation with the user completing password entry and employer consent under the computer-use handoff rules.

## 2026-10-04: authorized automatic registration consent

- Per the user's instruction, enabled automatic checking of the exact Workday registration checkbox “Yes, I consent”. The option defaults off in the reusable auth module and is explicitly enabled in Daymark's Workday integration.
- Record the authorized checkbox label, acceptance time, and source in the private employer account record. Check success before attempting registration; unknown agreement labels retain a manual checkpoint.
- CAPTCHA remains manual. No real employer consent was accepted, new credential entered, account created, or application submitted during these code changes; validation used synthetic browser fixtures.
- All 55 unit tests passed, including default-off consent, authorized consent, and unknown agreement behavior.

## 2026-10-04: Workday redirected verification checkpoint

- Root cause of Apply wait timeout confirmed in actual Chrome: Workday was on `/en-US/MPCCareers/login` showing “An email has been sent to you. Please verify your account.” Account entry now recognizes login/create/reset/verification paths and does not wait for an Apply button on those screens; slow non-account pages wait for either Apply or an account/form control. Timeout messages no longer expose raw browser call logs.
- Adopt externally completed registration when the browser is waiting for verification; do not create another account. Preserved the observed employer verification checkpoint in the private account record before restart.
- Read-only Proton metadata confirmed a fresh verification message from `otp.workday.com` with a same-employer verification link; added that official sender domain with spoofing coverage. No token, code, credential or body was printed.
- All 58 unit tests passed.

## 2026-10-04: application status controls repaired

- Added explicit Not applied, In progress, Applied / submitted, and Failed choices alongside existing hiring stages. Applied/not_applied API aliases normalize to existing stored statuses.
- Status saving now uses a stable delegated submit handler and FormData, with duplicate-save protection and visible success/errors. Live panel replacement cannot detach the saving handler.
- Manual status updates work by job or application identifier, retain history, stop queued processing, clear stale submission timestamps when corrected to not applied/in progress/filled/failed, and distinguish failed/paused tasks from completed ones.
- Cards now show saved manual labels including Not applied and provide direct Update status actions for records without an automated task. Failed/not-applied records no longer display a forced 100% progress.
- Verified In progress → Failed → Applied / submitted → Not applied using actual browser controls against isolated sample data; reloaded and confirmed the saved value and card badge. Live user application statuses were not altered during testing. Isolated API queue/status tests passed; all 60 unit tests passed.
- Updated ATS settings guidance to describe the new Workday account flow accurately.

## 2026-10-04: live verification succeeded; final review guarded

- Retried the existing user-created account checkpoint. Workday email verification and saved-credential sign-in succeeded; account metadata is active. Chrome showed `tailored-resume.pdf` (50.8 KB) “Successfully Uploaded!”. No additional NVIDIA calls, new credentials, registration consent acceptance, or application submission occurred during this retry.
- Continued from resume upload to Workday My Information. Its resume parsing correctly populated first/last name, city, phone, and application email. Remaining employer-specific questions and contact choices are incomplete; do not claim the six-step application is fully filled or submitted.
- Fixed premature final-review readiness: Workday must show the actual Review heading. Authentication recognizes all current wizard steps, including Review pages without input fields. Do not overwrite Workday's separate First Name with the full profile name.
- Corrected the live saved task's readiness flag to false while My Information is pending. Old timeout activity is rendered as a readable explanation without raw call logs or terminal escape formatting.
- 62 unit tests passed; isolated API queue/status tests passed. Mocked final-review attachment regression was rerun.

## 2026-10-04: resume filenames and ATS-friendly exports

- Descriptive, bounded ASCII filenames include candidate, company, role, document type and version. Per-task folders prevent same-company/role application collisions; download headers use the same naming convention.
- Shared PDF/DOCX exports use single-column Letter pages, Arial 11-point body text, black text, standard headings, selectable text, body contact details and no tables/images/headers/footers. Preview typography is aligned. Supplied facts remain unchanged.
- Upload selection honors file-field PDF/DOCX acceptance, prefers PDF, uses DOCX when required, and checks conservative byte caps (Greenhouse 2.5MB parsing limit, Workday 5MB upload limit, otherwise 2.5MB). Unsupported or oversized uploads pause clearly; employer-specific requirements still apply.
- Regenerated current saved document sets without model calls, changes to content/approval, or overwriting historical version files. Existing employer-uploaded attachments remain unchanged until explicitly reattached.
- 64 unit tests passed, including filename safety, selectable PDF text, DOCX fact preservation and accepted-format selection. Rendered and visually inspected sample PDF and DOCX pages.

## 2026-10-04: Chrome profile conflict recovery

- Diagnosed an orphan Daymark server (no listening socket) in this workspace holding the dedicated Chrome profile through its child Chrome process, while the current server was listening on 4173.
- Stopped only the confirmed orphan server and its dedicated Chrome process. Browser profile, saved login and application documents preserved.
- Shutdown now awaits browser context closure before exiting; repeated shutdown signals are ignored. Profile-in-use launches return a readable recovery message instead of Chrome command lines.
- Syntax checks and all 64 unit tests passed. Restarted the current local server with the cleanup fix.

## 2026-10-04: background browser and duplicate-worker prevention

- Previous orphan worker ignored graceful termination and reopened Chrome. Force-stopped that confirmed workspace worker and closed its dedicated Chrome instance; personal Chrome profiles were untouched.
- Normal filling now launches headless Chrome. Explicit DAYMARK_SHOW_BROWSER=1 remains available for manual recovery/debugging. CAPTCHA/verification still require user intervention; no claim of a completed embedded remote browser is made.
- Added exclusive per-data-folder worker ownership with stale PID recovery and guarded release. Second instances cannot silently operate the same queue/profile on another port. State writes use unique temporary filenames to avoid rename collisions.
- All 65 unit tests passed, including competing-worker and stale-lock recovery tests. Restarted on 4173.

## 2026-10-04: resumable questions and per-job activity — work in progress

- Implemented a local question checkpoint module that captures visible native inputs, labels, required flags, choices, helper text, constraints, and employer validation. Stable checkpoint IDs/signatures are checked before answer application; private selectors and session URLs are removed from the public task response.
- Added `/api/tasks/:id/answers` for validated answers, stale/duplicate protection, and optional explicit answer-pack saves. Added `/api/tasks/:id/handoff` and `/handoff/resume` to switch the dedicated saved profile between hidden and visible Chrome, then re-check the current step.
- Processing page renders answer controls, retains local drafts across reload, offers NVIDIA answer drafting behind per-request confirmation, and includes Resolve this step / Continue in background. Job cards display stage, current step message, timestamp, and progress, and open the processing page.
- Isolated synthetic UI walkthrough verified radio, number, select, date, answer-pack opt-in, reload persistence, answer application, and visible/hidden handoff. Mocked employer state showed values retained and only the selected answer saved.
- 70 unit tests passed; isolated queue test covers stale checkpoint, invalid choice, duplicate answer rejection, explicit answer-pack save, and exclusion of private URL/locators. Isolated final-resume attachment test passed.
- **Not finished / resume here:** do not treat the live Workday application as completed. The user's actual application has employer-specific My Information fields and remains unsubmitted. Verify retained page/session and upload state before any retry; never repeat the resume upload blindly. Confirm manual status stops queueing. The live app at port 4173 has not yet been restarted with this latest question UI/API code.
- Remaining work: inspect/fix any runtime issues in startup/handoff and Workday custom dropdowns; ensure every stopped task has a useful current-stage/recovery link and card states prioritize active fill over the older prepare task; refine question fields for actual Workday controls; verify visible/hidden handoff against isolated Chrome fixture after reload and session expiry; test 360px mobile layout, keyboard/focus behavior, multi-answer validation, and retained form errors; run all API tests; update activity log/API exposure and ensure errors never disclose verification/reset URLs; restart Daymark and confirm 4173 serves the latest frontend before live use.
- The temporary sample app uses synthetic Alex Doe records at 4196. Stop that isolated server and close its temporary tab before resuming. No employer submission was performed.

## 2026-10-04: live cards, application questions and dedicated-session handoff

- Added structured checkpoints with exact employer labels/options, native/ARIA option groups, instructions, constraints, values and validation messages. Private locators and authentication URLs are excluded from task state sent to the frontend.
- Processing page renders unresolved questions, persists local drafts/save choices, applies answers through a guarded endpoint, verifies retained values, refreshes changed schemas, and offers explicit answer-pack reuse. Descriptive NVIDIA drafts use prepared tailored material without requiring an interim resume approval and retain explicit sending confirmation.
- Workday now loops through recognized Continue/Next steps, stops on unanswered/custom/legal controls, and only exposes final review at Review. Supported single-page adapters share the extraction/answer interface. Unknown widgets require manual resolution; no final submission is automated.
- Cards display recorded stage, current message, timestamp and progress, link to the processing page, and focus its questions. Fill status takes precedence over an older preparation state; manual application statuses remain authoritative.
- Added Resolve this step / Continue in background. The server switches its exclusive profile between hidden and visible Chrome, captures/restores matching non-authentication form values, rechecks the actual step, pauses other browser work during handoff, and blocks resuming manually closed applications. Employer links are clearly identified as separate-session fallbacks.
- Avoid generic cover-letter insertion into arbitrary textareas and repeat draft uploads when an attachment was already recorded. Older live form snapshots become recoverable saved checkpoints at startup without inventing current questions or application completion.
- Verified 70 unit tests and isolated queue/status/question API tests. Mocked final attachment regression passed. Real Daymark UI using synthetic data verified answer persistence across reload, four answered employer fields, one explicitly saved reusable answer, headless→headed→headless handoff, desktop and 390px mobile layout. No live employer submission, new NVIDIA call, or paid collection was triggered.
- Live employer-specific wizard behavior still requires checking on its actual form; unsupported controls pause honestly. The live application remains paused for the user to choose Continue processing or Resolve this step.

## 2026-10-04: review-before-submit toggle, agent submission and live execution stream

- Added preferences.reviewBeforeSubmit (default on) with POST /api/preferences and a switch on the Overview execution stream. On: filled applications wait as needs_you (stage "Awaiting your review") with the filled answers recorded per step (filledSteps; selector-free, passwords excluded). The review form's "Approve & submit application" approves the resume, re-attaches it and submits in one action. Off: the agent auto-approves the tailored resume only if missingProtectedResumeFacts is clean, then submits.
- New submit-flow.mjs: exact per-ATS Submit control match; refuses on CAPTCHA, validation alerts, or a missing/duplicate/disabled button; records submitAttemptedAt before the single click; success needs a confirmation page/text, otherwise "Submission unconfirmed" (never re-clicked, including across restarts). Success marks the application submitted and stores a confirmation screenshot under data/files/submissions.
- Routes: /api/tasks/submit (needs approved resume, ready review, open browser session, confirmed:true) and /api/tasks/submit-waiting (only while the toggle is off). Flipping the toggle never submits waiting applications by itself; the user chooses "Submit N waiting".
- Overview shows the live stream (public/stream-model.js): Discover, Score, Tailor, Fill, Your review (only when relevant), Submit; process count and elapsed clock; per-task event feed with ACTION/RUNNING/SKIPPED/DONE; today's batch bar. Everything derives from recorded tasks. Recruiter-reply and skip-rule events are not shown because those sources are not in app state.
- Known limit: submission needs the live application browser page; after a server restart the application must be refilled (no refill-and-compare yet). Real employer submission was not exercised; verified with a real Chrome fixture page and a mocked-browser server flow.
- Tests: 80 unit tests, tests/api-submit.mjs (review on/off, protected-fact hold, single click, preference route), api-queue and api-fill-final pass. UI checked in-browser at desktop and 375px with synthetic data. The live 4173 server was not restarted; restart it to load these changes.

## 2026-10-04: Tsenta-style filling — answer engine, dynamic adapters, receipt

- New answer-engine.mjs resolves answers per question from profile → answer pack (incl. optional EEO choices) → learned library → optional NVIDIA drafts (preferences.aiAnswers, off by default). Sensitive questions (legal, demographic, consent, criminal) never go to AI and are never auto-remembered. Option matching handles yes/no wording, state names/abbreviations, United States variants and decline-to-answer wording.
- fillApplication now runs one generic step loop for every adapter (capture, resolve, apply, re-capture up to three passes for dependent fields, Next when present). Optional unanswerable questions are skipped instead of blocking; required ones still pause. Answer sources persist across pauses (sourceMemory); task.receipt summarizes filled/skipped/AI counts.
- New dynamic-adapter.mjs: resolveAdapter() returns the built-in adapter or a dynamic one for any non-aggregator host; entry finds the Apply link/popup and switches to a built-in adapter when it lands on a known ATS. Per-host cache in data/adapters with a trust counter; untrusted hosts always require review, including through submit-waiting.
- Answers given in Needs you are remembered by default (Remember for future applications). Added Profile → Application details, EEO choices and Learned answers on the Answer pack page, AI toggle in Settings, Applications status tabs, receipt with source tags on the review screen. Approving an unchanged resume no longer needs an upload field to be visible before submit.
- Verified: 94 unit tests; tests/api-fill-dynamic.mjs drives real Chrome through an intercepted unknown career site (Apply click, multi-step form, profile/pack/AI/library answers, pause on the one unknown required question, learning, submit after review, trust counter, first-submission review rule); api-submit, api-queue, api-fill-final pass; UI checked in-browser with synthetic data.
- Not done: inline editing of AI answers on the review screen (fix via Resolve this step), account sign-in/creation on non-Workday custom sites, searchable-combobox typing and cross-iframe capture, and the dynamic adapter does not yet ask NVIDIA to map unfamiliar labels (answers come from the engine/library/AI path). No live employer form was filled with the new code except as noted below.

## 2026-10-04: handoff re-authentication and Workday dropdown fixes

- Resolve this step / Continue in background no longer reopen a bare page. A restart or browser switch loses the Workday session, so both now requeue the fill pipeline: it signs in with the saved login, returns to the application, best-effort restores retained answers (restoreAnswers) and rechecks the step. Manual handoff stays selectable by the worker while other browser tasks wait. Stale manualHandoff flags are cleared at startup.
- Dropdown capture waits for the list to load, skips the "Select One" placeholder, reads only options the click opened (falling back to all visible options when the page reuses elements), and selection waits for the wanted option. This fixed empty State lists; live Marathon now fills Country, State, City, First/Last name, Phone Device Type.
- Removed the Country Phone Code rule: typing into that search box opened a popup that polluted later dropdowns. It still needs a pick in Resolve this step.
- Live Marathon run (headless, no submission): still waits for Address Line 1, Postal Code, "How did you hear about us", "previously employed" and Country Phone Code. Tests: 95 unit, api-queue, api-fill-final, api-submit, api-fill-dynamic (now includes handoff open/resume) pass.

## 2026-10-05: Tsenta workflow parity (find → prep → apply → track)

- Find: apply-rules.mjs plans auto-apply after each collection and every 15 minutes: roles first seen in the last 7 days, match ≥ 70%, top N within a 10/day cap (state.dailyAutoApply), only where an adapter can fill. Skip rules (clearance required by default; optional salary floor, excluded companies/title words, remote-only) record applications with status `skipped`, skipReason and rule; they show as SKIPPED stream rows and under the Skipped tab, and "Apply" overrides a skip. Settings → Auto-apply & skip rules.
- Prep: per-application Resume (Tailored/Default) and Cover letter (On/Off), editable while queued, defaults in Settings. Default mode exports the master resume with no NVIDIA call; Off skips cover letters. Submit all previews eligible vs held-back applications (closed sessions, manual statuses, first submission on an untrusted new site) and submits only after confirmation.
- Apply: receipts add generic-answer counts and agent time (activeSeconds accumulated per worker run); "Fix for next time" copies an answer into Learned answers; successful submissions freeze the receipt and proof onto the application.
- Track: mail-routing.mjs routes Proton messages (inbox refresh and every 10 minutes) by sender domain, career-site domain, Workday tenant, company/role text; only unique confident matches count. Status moves forward only (confirmation → submitted, screening/assessment, interview, offer; rejection from any non-terminal). Inbox reader shows the routed application with a manual Route-to control; recruiter replies appear as ACTION rows in the execution stream.
- Tests: 102 unit tests; api-workflow.mjs (auto-apply cap, clearance skip, default resume without NVIDIA, Submit all exactly one click each) plus api-queue, api-fill-final, api-submit, api-fill-dynamic pass. Mail routing is unit-tested; it was not exercised against the live Bridge in tests.

## 2026-10-13: ATS autofill hardening (phase 0, 1, 3 and parts of 2)

- **Root causes found:** (1) every dynamic-host application failed after entry with "A versioned ATS adapter is required" because the dynamic adapter had no `version`; (2) the auth preflight returned `guest_only` for any form containing "Submit application"/"Apply now", pausing Greenhouse/Lever/Ashby before a field was filled; (3) the capture layer found labels only through Workday markup and dropped unlabeled controls; (4) Submit was searched on the top page only, so iframe forms never submitted; (5) Greenhouse security codes are 8 alphanumeric characters from `*.greenhouse-mail.io`, but mail matching accepted digits only and the gateway only allowed `verify`.
- **Capture/apply (`application-questions.mjs`):** label fallbacks (aria, field wrapper, nearest preceding label), stronger required detection, unlabeled required controls surfaced, contenteditable editors, Ashby-style toggle buttons grouped as radios, multi-select tags, generic error text, normalized retain-check (masked phone/salary no longer reported as unretained), label-aware resume file input (never the cover-letter field), generic prior-employment step heuristic.
- **Answers (`answer-engine.mjs`):** phone country code from profile, calling-code option matching, fuzzy "How did you hear" source matching.
- **Adapters/auth:** `authMode:'guest'` for Greenhouse, Lever, Ashby, SmartRecruiters and dynamic hosts; preflight still stops on visible CAPTCHA, verification, sign-in and password screens. Avature/SuccessFactors submit patterns added.
- **Submit:** frame-aware Submit/CAPTCHA/error/confirmation detection. New `security-code.mjs`: fills an emailed Greenhouse security code once, clicks verify once, otherwise stops with an explicit user checkpoint. Mail gateway accepts purpose `security` (alphanumeric); code is matched to the applicant email, never ATS credentials.
- **Other:** consecutive identical activity entries collapse (Fusion logged 23); Greenhouse embed board derivation moved to `greenhouse-embed.mjs` (explicit `for=`, multi-part TLDs, generic subdomains).
- **Tests:** new fixtures under `tests/fixtures/ats`, `tests/ats-fixtures.test.mjs`, `tests/greenhouse-embed.test.mjs`, helper `tests/helpers/browser.mjs` (falls back to any installed Chromium; browser tests previously skipped silently). Stale integration mocks updated (`getByRole(...).first`); `api-fill-dynamic.mjs` honours `DAYMARK_TEST_CHROME`.
- **Not done yet (plan phases 2, 4, 5, 6, 7):** strategy-hook refactor of the `adapter.id==='workday'` chains; repeating work-history/education sections; masked/split date fields and pickers; shadow-DOM capture; Workday My Experience/Voluntary Disclosures end to end; Lever hCaptcha and Ashby drop zones against real pages; Avature/SuccessFactors/iCIMS authenticators; Workday link-verification inside the Docker worker. No live employer form was filled or submitted in this work.

## 2026-10-13: live Greenhouse dry run (Robinhood direct board, Airbnb company-site embed)

- Dry run only: filled the visible form in headless Chromium with the Daymark engine; no resume upload, Submit never clicked. Nothing was sent to the employers.
- Bugs the live pages exposed and fixed: a visible invisible-reCAPTCHA badge (`size=invisible`, inside `.grecaptcha-badge`) was reported as a CAPTCHA challenge; React-Select hidden `requiredInput` shims (aria-hidden, tabindex -1) were captured as 12 phantom "Unlabeled required field" questions and one received the phone number; "legally work authorized to work" and "Have you ever worked for X as an employee, intern or contractor" wordings did not match any rule; sentence-style options ("I have never worked at X") could not be chosen for "No"; the Country picker displays "+1" for "United States +1" and failed the retain-check.
- Result: Robinhood 24 real questions, 11 answered automatically, 0 apply errors; Airbnb (embed derived as `for=airbnb`) 18 questions, 10 answered, 0 apply errors. Remaining required items are intentionally the user's: EEO choices (none saved in the answer pack), legal/privacy/AI-attestation consents, non-compete, relatives-at-company, preferred office.
- Known issue: each capture re-opens and reads every dropdown (including a 244-item country list), so a 24-question form takes about a minute per pass. Candidate fix: cache enumerated options per question signature and skip re-enumeration after the first pass.

## 2026-10-13: Questions inbox (central screen for unknown questions)

- New sidebar page **Questions** (`#questions`, badge = waiting questions). It lists every unanswered question from applications waiting on you (`needs_you` fill tasks with unresolved checkpoint questions).
- **Facts merge, decisions don't:** identical wording + type + options across applications becomes one card ("answer once, fills N applications"). Consents, attestations and legal questions (non-compete, relatives at company, background/export checks) are classified as *decisions*: one card per application, employer's exact wording, no "remember" option, never shared across applications. Controls that only exist on the employer page (consent boxes) are listed separately with an "Open application" button.
- **Remembering:** facts default to remembered (learned answers); open-ended answers default to *not* remembered (company-specific); EEO choices are written to the Answer pack (the engine ignores learned answers for EEO questions), anything legal/consent is never remembered.
- **Sending:** drafts persist locally and survive reloads/polling; a sticky bar sends all answered cards in one request (`POST /api/questions/answer`, all-or-nothing validation, stale-step and busy-task checks). The per-application answers route now shares the same helpers (`rememberAnswer`, `queueTaskAnswers`).
- Files: `public/questions-model.js` (classification/grouping, shared with the server), `public/questions-inbox.js` (screen), `public/app.js`/`index.html`/`workspace.css` wiring; tests `tests/questions-model.test.mjs`, `tests/api-questions.mjs`; `tests/demo-questions-server.mjs` + `questions-demo` launch entry serve the UI on synthetic data (port 4197) without touching real data.
- Verified in the browser at desktop and 375px (no horizontal overflow): answering, reload persistence, progress bar, send resumes all waiting applications, empty state. 241 unit tests and all API scripts pass.
- Not done: the final review-before-submit screen with inline editing of every filled answer; "Draft with NVIDIA" in the inbox reuses the existing per-task endpoint and was not exercised against the live model.
