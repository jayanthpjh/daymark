# Changelog

## [0.2.0.0] - 2026-10-19

### Added
- Discover jobs from additional public ATS boards and job feeds, with role and location matching, freshness tracking, and source links.
- Add a local MCP interface for bounded job/application reads and approval-gated preparation and fill requests.
- Add NVIDIA request pacing, explicit real-data opt-ins, factual review, and source-based fallback when hosted drafting is unavailable.
- Keep ATS login sessions in isolated browser profiles and pause for sign-in, password recovery, CAPTCHA, cookies, and other user checkpoints.
- Add persistent local Docker services for the API, PostgreSQL, Redis, Playwright worker, and MCP, with loopback-only published ports.

### Changed
- Keep application work to one at a time and route changes through the existing approval ledger and submission review.
- Improve Discover refresh, filtering, ranking, and company/source presentation; update the application, mailbox, and materials screens.
- Keep Proton Bridge on the Mac and pause mail sync and OTP features until a restricted relay is verified.
- Park OCI provisioning and model hosting for the local-first release.

### Fixed
- Reject cross-site API mutations and untrusted host/origin requests.
- Preserve saved job/application history when enriching incomplete ATS listings, and avoid duplicate collection tasks.
- Reuse collection scores when profile inputs are unchanged instead of repeatedly ranking the full feed.
- Surface sanitized watchdog and scheduled-collection failures, and stop worker activity when its lease is lost.
- Retry stale in-flight PostgreSQL snapshots so concurrent state writes do not falsely fail Discover collections.
