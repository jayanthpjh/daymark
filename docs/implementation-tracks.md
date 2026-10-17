# Daymark Implementation Tracks

Daymark work is coordinated across two tracks. The browser/runtime work supports the existing application workflow; it does not change what a task means or which user checkpoints are required.

## Track A: Application flow and UX

Continue repairing form progression, answer capture, checkpoint recovery, task activity, and submission evidence. Keep the current dashboard routes and task/checkpoint data readable throughout the worker transition. A live application task must not be marked applied without employer confirmation evidence, and a process restart must not repeat a submission attempt.

Current public interfaces to preserve:

- `GET /api/state` and `GET /api/tasks/:id` for dashboard polling.
- `POST /api/tasks/:id/answers` for checkpoint-scoped answers.
- `POST /api/tasks/:id/handoff` and `POST /api/tasks/:id/handoff/resume` for visible recovery and background continuation.
- `POST /api/tasks/:id/pause`, `/resume`, and `/cancel` for task control.
- Existing task IDs, task types and statuses, checkpoint IDs, question IDs, and the sanitized public checkpoint shape.

The current application worker owns a persistent Playwright context and its in-memory page map. The dashboard and worker currently share one `server.mjs` process and write `data/state.json`; `data/worker.lock` prevents a second owner of the same data directory. The browser profile is under `data/browser-profile`, and task files are under `data/files`.

## Track B: Local Docker application worker

The local-runtime separation in [local-docker-worker-plan.md](local-docker-worker-plan.md) is implemented and running on the Mac. The dashboard/API and Proton Bridge remain on the host; one ARM64 container owns queue execution and Chromium. PostgreSQL and Redis are now additive local services for durable shared state/checkpoints and queue dispatch. Keep that separation and the task/checkpoint contracts intact.

The worker must preserve Track A's contracts. Add internal coordination behind the existing routes rather than changing frontend request/response shapes. PostgreSQL stores the same state document/revision used by current handlers and transactionally records checkpoint snapshots. Redis/BullMQ carries task IDs only and runs with one consumer; state reconciliation and the existing worker lease remain the duplicate-execution guard. The host API remains the authority for state and UI polling; only one worker may claim the queue and own the persistent browser profile. Recovery must use the existing task/checkpoint identity and must safely handle a process restart, particularly tasks with a prior submit attempt.

The container is pinned to Playwright/Chromium 1.63.0 for `linux/arm64`, was rebuilt and reported healthy on 2026-10-06, and the API reports its current heartbeat separately from API health. The worker listener binds inside its container while Compose publishes only the local viewer on host loopback. State writes use a cross-process lock, merge concurrent task changes, write through a synced temporary file, and refuse to replace unreadable, structurally invalid, unexpectedly missing, or older-revision state. The queue lock is a renewable shared-file lease so Linux container PIDs cannot be confused with macOS PIDs. Regression tests cover corrupted/missing/reset state, initialization races, concurrent writes, expired leases, worker readiness, and duplicate worker ownership.

The host API remains the only process that reads Proton Bridge through macOS Keychain. The inbox now decodes HTML-only mail, derives verification labels locally, and routes the Cloudflare code email to its unconfirmed task using employer context, recipient, and IMAP receipt time. The code is only returned for inbox display; it is not written into state or task logs. The Docker worker deliberately cannot access the mailbox; verification remains a user checkpoint until a task-scoped, explicitly authorized code handoff is implemented and tested.

The keychain boundary is a specific integration requirement: Proton Bridge authentication currently reads its password through the macOS `security` command, so the container must never receive the Bridge password or pretend macOS Keychain is available. If browser authentication needs an email code, define a narrow host-side request scoped to the active task and employer; return only the needed code at runtime, without persisting it in task state or logging it. Keep mailbox polling and local settings on the Mac.

Runtime configuration must be explicit and minimal. Do not mount the general home directory, the normal Chrome profile, or the project `.env` wholesale. Persist only the Daymark state/files and a dedicated worker browser profile. Supply only the runtime secrets actually required by the worker, and keep them out of image layers, logs, API state, and browser-facing UI.

## Coordination and order

1. Keep Track A's application fixtures and checkpoint/recovery behavior passing while these repairs continue.
2. Preserve the additive worker boundary and existing task and dashboard APIs.
3. Test PostgreSQL migration and revision merging, Redis single-consumer dispatch, watchdog recovery, flow-loop stopping, field verification, secret redaction, and Proton Bridge isolation using local fixtures.
4. The user authorized the local Docker worker rollout. Database/queue changes are configured in Compose; this work does not submit or retry an application.

The coordinated job-agent design, rollout order, and safe defaults are documented in [job-application-agent-architecture.md](job-application-agent-architecture.md). Resume extraction, ATS adapters, checkpointed application-flow understanding, and question validation remain in Daymark's existing modules; this addition makes the storage, dispatch, watchdog, verification, and human-review boundaries explicit.

This handoff authorizes local runtime changes and tests. It does not authorize a new employer submission. Application submission continues to follow the user's separate, application-specific instructions and checkpoints.
