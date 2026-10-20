# Tsenta-Style Job Pulling, Autofill & Dockerized NVIDIA LLM Implementation Plan

> **Superseded (2026-10-19).** Keep this as a historical comparison only. Do not implement its proposal to enable NVIDIA by default for real application data, host model inference, or automate employer submissions. The approved release runs Daymark locally in Docker, excludes model hosting and cloud deployment, and keeps any NVIDIA API use gated by account terms, cost, and factual review. See `docs/local-docker-worker-plan.md`, `docs/hybrid-llm.md`, and `docs/mcp.md`.

**Date:** 2026-10-18
**Goal:** Make Daymark pull jobs continuously from employer ATS boards like Tsenta, upgrade the autofill pipeline to resolve and fill application steps autonomously up to Final Review, and run the entire LLM + worker stack against the NVIDIA API inside Docker without dead local-model gates.

## Phase 1: Dockerized NVIDIA API Unification
- **`llm-client.mjs`**: Add `'form'` to `LLM_TASKS`, route all tasks (including `'form'`) to `['nvidia']` when `NVIDIA_API_KEY` is configured and not explicitly disabled, and remove the dead local-only form restriction in Docker.
- **`nvidia-client.mjs`**: Add `requestNvidiaEmbeddings()` calling `https://integrate.api.nvidia.com/v1/embeddings` (`nvidia/nv-embedqa-e5-v5`) with shared Redis rate limiting.
- **`worker-env.mjs` & `docker-compose.worker.yml`**: Enable `LLM_HOSTED_ENABLED=true` and `DAYMARK_NVIDIA_LIVE_APPROVED=true` by default when an NVIDIA key is configured, mount `./.env:/app/.env:ro` into `application-worker`, and add internal `searxng` discovery service.
- **`server.mjs`**: Allow `readEnv()` to read live `/app/.env` updates across both `api` and `worker` roles and auto-enable `LLM_HOSTED_ENABLED=true` when saving `NVIDIA_API_KEY` in `/api/settings`.

## Phase 2: Tsenta-Style Continuous Job Pulling (`job-sources/`)
- **`job-sources/seed-boards.mjs` & `job-sources/registry.mjs`**: Bootstrap the board registry with a curated catalog of verified employer ATS boards across Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Recruitee, Rippling, Pinpoint, BambooHR, Jobvite, and Breezy HR, and use indexed SQL (`WHERE next_poll_at <= ...`) in `PostgresStore.due()`.
- **`job-sources/schema.mjs`, `job-sources/ats/*`, `job-sources/open-check.mjs`**: Add URL parsing, public board readers, and open-status checks for **Rippling**, **Pinpoint**, **BambooHR**, **Jobvite**, and **Breezy HR**.
- **`job-sources/match.mjs` & `server.mjs`**: Score postings against extracted job-posting tech/role requirements instead of penalizing long resumes by raw word count, and wire `requestNvidiaEmbeddings` into `runCollection()` with automatic fallback.

## Phase 3: Tsenta-Style Autofill Strategy (`ats-adapters.mjs`, `answer-engine.mjs`, `form-understanding.mjs`, `application-questions.mjs`, `form-history.mjs`)
- **`ats-adapters.mjs` & `submit-flow.mjs`**: Add guest adapters and submit button patterns for `workable`, `recruitee`, `rippling`, `pinpoint`, `bamboohr`, `jobvite`, and `breezy` so all discovered ATS postings are marked `canFill: true` (`applyMode: 'auto'`).
- **Auto-Enter ATS Application Forms (`server.mjs` & `dynamic-adapter.mjs`)**: When a built-in guest ATS URL opens on a job description page with an "Apply" / "Apply for this job" / "I'm interested" / "Application" button or tab and no visible form inputs yet, run `enterDynamicApplication()` automatically to open the form before reading fields.
- **Preserve `resumeDocument` & Structured History (`server.mjs`, `form-history.mjs`, `ats-hooks.mjs`)**: Stop blanking `profile.resumeDocument` in `fillApplication`, feed structured `resumeDocument.experience` and `education` into `historyEntries()`, and auto-click "Add" / "Add Another" buttons on Experience/Education steps to match the candidate's entry count.
- **Full-Step Autonomous Resolution (`form-understanding.mjs` & `answer-engine.mjs`)**: Default `aiAnswers: true`, expand `understandForm()` to cover all profile/contact/compensation/link/authorization fields (with optional NVIDIA label mapping), compute per-skill years of experience from resume history, allow `acceptAiAnswers()` to fill multi-select `checkbox` groups and custom dropdowns with whitespace-normalized evidence checks, and skip optional unknown questions cleanly so autofill only pauses at Final Review or hard checkpoints.

## Phase 4: Verification & Regression Suite
- Update and run unit tests (`tests/*.test.mjs`), Vitest (`web/src/lib/__tests__/*.test.ts`), and `npm run docker:config`.
