# Daymark Local Docker Worker Plan

## Goal

Run Daymark's application automation in an isolated Docker worker on the user's Apple Silicon Mac. The dashboard remains local, credentials and documents stay on the Mac, and Playwright uses Chromium inside the container rather than launching the installed macOS Chrome. This removes the GCP VM charge, but the Mac and Docker Desktop must remain awake and running.

## Current architecture to account for

Daymark currently starts its API and background worker together in `server.mjs`. The worker launches a persistent Playwright context and keeps application pages alive for review and recovery. This means containerizing the browser alone is insufficient: the worker/browser lifecycle and its persistent profile must have a clear owner, and the dashboard must continue to receive task state and recovery actions.

## Target architecture

- **Mac dashboard/API:** Continue serving the UI at `127.0.0.1:4173` and own local configuration/state where practical.
- **Docker worker:** Run the application queue and Playwright Chromium in a dedicated Linux container on a private Docker network. Initially allow one active application at a time.
- **Worker interface:** Use a narrow authenticated local API or queue contract for start, status, checkpoint, resume, and manual handoff. Do not expose the worker port beyond the Mac.
- **Persistent local data:** Keep Daymark state, generated documents, task checkpoints, and the worker's Playwright profile in named Docker volumes or explicitly scoped local data directories. Never mount the user's general home directory or ordinary Chrome profile.
- **Secrets:** Inject NVIDIA and ATS secrets at runtime using a local-only secret mechanism; never bake them into the image or emit them in logs/state. Keep Proton Bridge on the Mac if its access depends on macOS Keychain, and define a narrowly scoped local handoff if the worker needs mailbox access.

## Implementation sequence

1. **Inventory runtime boundaries.** Identify state files, generated-resume paths, upload/download paths, queue ownership, and current browser launch/handoff behavior. Decide which process owns each persistent resource.
2. **Separate execution from presentation.** Extract the application worker behind a stable local interface while preserving the current API, task identifiers, checkpoint schema, and UI polling behavior. Ensure only one worker can own the queue and browser profile.
3. **Add a pinned ARM64 container.** Build for `linux/arm64` on Apple Silicon. Pin the Playwright image to the exact package version and run as a non-root user with only required browser permissions. Keep Chromium headless for background work; support an explicit inspection handoff through a container viewer or controlled local display if the user needs to watch a run.
4. **Persist and protect state.** Add named volumes for worker profile and application data. Restrict file permissions, exclude secrets and runtime data from image layers and source control, and document encrypted backup/restore for important local state.
5. **Integrate Compose lifecycle.** Provide a simple start/stop/restart flow, health checks, graceful shutdown, bounded logs, and a visible worker status in Daymark. Browser closure or Docker restart must leave a recoverable checkpoint rather than false completion.
6. **Validate with safe fixtures.** Test queue exclusivity, ARM64 browser startup, task pause/resume, persistent profile after restart, application-specific file access, secret redaction, and UI status synchronization before testing a real employer form. Keep CAPTCHA, inaccessible verification, unknown legal attestations, and missing factual answers as explicit user checkpoints.

## Local resource budget

- Configure Docker Desktop with approximately **4 GB RAM** available to the worker during initial testing; tune against measured use.
- Run a single application at a time until memory use and recovery behavior are stable.
- Cloud VM spend: **$0** for this local setup. Existing NVIDIA/API charges and local electricity/storage remain.
- The Mac must be awake, online, and running Docker Desktop. Sleeping or shutting down pauses the worker; it cannot provide Tsenta-style 24/7 cloud execution.

## Acceptance checks

- The worker starts on Apple Silicon without opening the installed macOS Chrome or colliding with its profile.
- One application can run, pause at a critical checkpoint, resume, and preserve its checkpoint and local profile through a controlled container restart.
- Daymark UI continues to show actual task state and recovery links while the worker runs separately.
- Credentials, resume contents, private profile data, and tokens do not appear in the image, logs, frontend state, or source control.
- Proton Bridge behavior is explicitly verified; do not assume a Linux container can access macOS Keychain.
- Starting a second worker or duplicate task cannot concurrently use the same profile or submit twice.

## Coordination with current Daymark work

Treat this as a deployment/runtime track alongside the current resume, application-flow, and UI work. Preserve current API contracts and task/checkpoint compatibility; integrate after active application-flow repairs have stable tests. The worker split should not introduce new application behavior or bypass existing user checkpoints. Validate first with isolated employer fixtures, then with a live application without submitting unless separately authorized.

The shared work sequence, existing endpoint/checkpoint contracts, current process boundaries, Proton Bridge boundary, and handoff scope are tracked in [implementation-tracks.md](implementation-tracks.md). The current implementation still couples the queue, API, persistent Playwright context, and page map in `server.mjs`; this plan must account for that lifecycle instead of containerizing Chromium alone. Keep the existing `data/state.json`, task identifiers, checkpoint/question identifiers, and safe no-duplicate-submit recovery behavior compatible during the split.
