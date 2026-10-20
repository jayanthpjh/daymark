# Daymark employer discovery and ATS coverage roadmap

**Status:** reviewed staged plan; initial source expansion is implemented locally, with broad employer coverage still in staged rollout.
**Date:** 2026-10-17
**Scope:** one-user local Docker application, under the existing $7/month total spending ceiling.

## Goal and decisions

Daymark should grow toward broad U.S. employer discovery, sponsorship evidence, and coverage of major ATS platforms. Preserve that full target, but add sources and ATS support in measured stages. The current rollout continues to use one application worker and stops for the applicant's review before every employer submission.

Decisions from the engineering review:

- Keep the broad employer and ATS target; begin with a measured pilot and expand only when its quality and reliability gates pass.
- Create one canonical employer record, with ATS board records linked to it. Keep legal entities, brands, aliases, and ATS boards distinct where evidence does not prove they are the same organization.
- A job posting's own text determines its role-level sponsorship status (`yes`, `no`, or `unknown`). Historical employer filing evidence is a separate, dated signal and never changes an unknown role into a role marked `yes`.
- Use public ATS read APIs and official public datasets first. Check source terms and robots policy before crawling HTML career pages. Search engine and Common Crawl results are discovery leads, not verified employers or permission to crawl.
- Keep paid data sources, paid enrichment, cloud hosting, and model hosting out of the initial roadmap. No source may exceed the user's $7/month total budget; a source that can incur charges stays disabled until its exact cost and a per-source cap are reviewed.
- Measure the current registry at 1k, 10k, and 30k synthetic boards. Add indexed, bounded Postgres due selection only if the observed latency or memory crosses the gate in the performance section.

## What already exists

`job-sources/` has a durable board registry, public listing readers behind a 28-platform ATS URL catalog, SearXNG and optional Common Crawl discovery, ATS-link harvesting, nine aggregators, deduplication, freshness snapshots, retries, per-host pacing, and due-board tiers. The aggregators include Jobicy and Himalayas; their visible source links and application links follow each provider's API terms, and polling is capped at hourly and daily intervals respectively. The Muse is not called without its required API key; Adzuna and USAJobs also remain credential-gated. Search query budgets are spread across all configured ATS hosts and roles before location refinements. Existing form adapters are a separate capability: discovering/listing jobs through an ATS does not mean Daymark can sign in to or fill applications on that ATS.

Daymark's feed is designed to collect directly from employer career APIs when a verified board is known, then use public aggregators as supplemental discovery. Tsenta publicly claims monitoring 50,000+ company career pages; Daymark does not yet match that monitored-board scale and must not imply it does. Some large job platforms do not expose an appropriate public listing API for this personal use, so Daymark does not bypass login walls or crawl them without documented permission.

The current registry stores ATS board records and a company-name string; it does not yet provide canonical employer entities or evidence provenance. `inferSponsorship()` currently applies a small text pattern to a posting and returns only a label. `robotsAllows()` is tested but is not called by a source. Postgres due selection currently loads all board records before filtering and selecting its bounded batch.

## Staged implementation

### Stage 0 — Baseline and source inventory

1. Run the existing job-source trial against a throwaway registry and save a baseline report; do not modify the user's saved jobs or apply to any employer.
2. Inventory each source and ATS separately: what it discovers, whether it reads a public listing API or HTML, source terms, robots requirements, rate limit, freshness semantics, cost, and last successful fixture/live check.
3. Build a manually checked pilot set of 100 U.S. employer career pages/boards spanning the currently supported ATS types and a sample of the requested target systems. This is a validation cohort, not a coverage promise.
4. Record baseline discovery yield, correct ATS classification, duplicate/alias rate, posting freshness, source errors, throttling, and manual correction rate.

### Stage 1 — Canonical employer identity and provenance

Add an additive migration with two tables, reusing the existing registry and source modules rather than adding a second discovery service:

- `daymark_employers`: stable employer ID, display name, verified primary domain, status, created/updated timestamps.
- `daymark_employer_evidence`: employer ID, evidence kind (`official_careers_link`, `legal_alias`, `brand_alias`, `source_match`, `sponsorship_filing`), source URL or dataset/version, observed/valid dates, entity-match confidence, and a compact cited value or excerpt.
- Add nullable `employer_id` to existing board rows while retaining each existing `board_key`, posting ID, and company string for compatibility.

Existing boards migrate to provisional employer records without merging similar names. Only deterministic evidence (such as an employer's own careers link or an exact verified ATS board identity) may attach a board automatically. Ambiguous legal-name/brand matches remain candidates for review. The migration must be repeatable, preserve IDs and job/application references, and have a tested backup/rollback path.

### Stage 2 — Safe discovery pilot

1. Keep SearXNG, Common Crawl, and harvested links as candidate generators only. Apply strict ATS URL parsing and canonicalization, deduplicate candidates, retain the discovery URL and source, and place each candidate in an unverified state.
2. Verify candidates with the corresponding public ATS listing endpoint where available. Do not label a candidate as a confirmed board until the response parses into the expected schema and identifies a live board.
3. For any HTML career-page discovery, check source terms and `robots.txt` before fetching; retain the check and observed policy version/time. If the policy cannot be checked, the source disallows access, or the vendor requires credentials, do not crawl that page. Respect per-host pacing, `Retry-After`, deadlines, and repeated-refusal backoff.
4. Keep incomplete, truncated, malformed, or failed source responses out of freshness snapshots. They must never close postings. Treat an unexpected empty response from a never-verified board as a candidate/parser anomaly and retry soon; do not park it for 90 days after one unexplained empty response.
5. Run against the 100-employer pilot set. Proposed gates: at least 99% precision among registered ATS boards; 100% provenance on displayed jobs and employer evidence; no automatic merge of ambiguous entities; and no closure based on a failed, partial, or truncated listing. Report recall separately and expand only after manual review of misses.

### Stage 3 — ATS breadth, measured by capability

Maintain a capability matrix per vendor with four independent columns: employer/board discovery, job listing, application sign-in/recovery, and deterministic form fill/review. Record fixture coverage and last verification date for each capability. An unknown or unsupported form routes to a visible manual checkpoint; it must never be called supported because its job listing works.

The current seven listing readers and eight form adapters are the baseline. The expansion target includes, subject to public access and documented terms, iCIMS, Avature, SAP SuccessFactors, UKG, ADP Recruiting, Oracle Taleo, Jobvite, JazzHR, BambooHR, Breezy HR, Teamtailor, Pinpoint, Rippling, and other major systems found in the pilot. Prioritize by unique relevant jobs and user demand, not by vendor count. Do not claim universal ATS compatibility until every advertised flow has a passing fixture and its supported sign-in, CAPTCHA, recovery, and stop-before-submit states are documented.

### Stage 4 — Sponsorship evidence

- Preserve the current role-level status as `yes`, `no`, or `unknown`, but make the decision evidence-backed: store the exact posting URL, observed date, a short supporting excerpt, and whether the status came from an explicit role statement. Conflicting or ambiguous text stays `unknown` and is flagged for review.
- Import official Department of Labor public disclosure data as versioned historical evidence, keeping program type separate (for example, H-1B/H-1B1/E-3 LCA versus PERM). The source and fiscal year must remain visible.
- Match filings to legal entities using stable identifiers or reviewed aliases. Show match confidence and never roll a subsidiary's history into a parent or brand without evidence.
- Describe these as historical employer filings, not proof that the employer hired a worker, obtained a visa, or will sponsor this role. Do not provide legal advice or predict an individual's eligibility.
- Refresh only when a new official data file is published; make imports idempotent and retain dataset version/checksum and import time.

### Stage 5 — Expand and operate

Expand in batches only after the preceding cohort passes. Retain the existing Redis queue and one-user worker; avoid a second source scheduler. Track source-level requests, latency, last success, parse failures, 429s, retry/backoff counts, candidate-to-verified conversion, duplicate rate, stale/closed corrections, employer-identity corrections, and postings with explicit sponsorship evidence. Surface a concise run report in the current job-source task/UI before building a separate monitoring system.

Keep vendor-specific caps and the global collection schedule configurable. Do not increase browser/application concurrency as discovery grows. Job collection may grow independently, while a single Playwright profile remains leased to one application at a time. If any public source changes its terms, starts requiring payment, or repeatedly refuses requests, pause that source without blocking others.

## Data flow

```text
Role/location preferences
        |
        v
SearXNG / Common Crawl / official careers links / approved public aggregators
        |  candidate URL + source + observed time
        v
ATS URL validation and deduplication -> provisional employer + candidate board
        |                                  |
        |                                  +-> exact/verified identity evidence -> canonical employer
        v
Terms + robots check (HTML only) -> public ATS listing API -> complete/partial/error result
        |                                                   |
        |                                                   +-> only complete snapshots affect freshness
        v
Normalized job + source provenance + role-level sponsorship excerpt/status
        |                         ^
        |                         +-- separate DOL filing evidence by legal entity/program/year
        v
Match and freshness filters -> Discover feed -> explicit user start -> one Playwright worker
                                                        -> review checkpoint -> user approval -> submit
```

## Test and acceptance flow

The project uses Node's built-in `node:test` runner, with existing fixture-driven source tests. Extend that setup; do not introduce another test framework.

```text
URL/schema/source fixtures
      -> candidate dedupe + provenance
      -> employer entity/alias resolution
      -> ATS listing parser (success | empty | malformed | truncated | 429 | timeout)
      -> registry migration + retry/backoff + per-host pacing
      -> freshness snapshots (only complete results can close after two misses)
      -> sponsorship evidence (role text separate from dated DOL records)
      -> Discover API/UI output and source/run report
      -> synthetic ATS application fixtures
      -> sign-in/CAPTCHA/manual checkpoints -> final review -> stop before submit
```

Required tests:

- Existing board IDs and jobs survive the migration; rerunning it is safe; rollback restores the pre-migration database from backup.
- Employer aliases with exact proof join the canonical employer; ambiguous names, subsidiaries, and parent companies do not merge automatically.
- Every displayed job/evidence record includes valid source provenance; duplicate source discovery is idempotent.
- HTML fetches obey terms/robots checks; disallowed/unknown policy causes no fetch. Public ATS GET endpoints remain distinct from application POST/submission APIs.
- Each listing reader has fixtures for valid, empty, malformed, partial/truncated, throttled, unavailable, and changed-schema responses. Unexpected empty results do not silently park unverified boards; partial responses never close jobs.
- Sponsorship fixtures cover clear yes/no statements, negation, quoted contradictory language, no mention, outdated posting, multiple visa classes, unknown legal-entity match, LCA versus PERM, and source/version display. Historical filings never alter the posting's role-level status.
- Idempotent data import, dataset refresh, retry-after behavior, per-host concurrency, cancellation, and independent continuation when one source fails.
- ATS capability matrix is backed by a synthetic listing/form fixture per claimed capability. Unknown systems stop for manual completion and every test ends before real submission.
- Synthetic Postgres registry benchmarks at 1k, 10k, and 30k boards record due-selection p50/p95, rows and bytes read, RSS, and collection duration. Optimize only if the documented gate is crossed.
- Regression: `node --test tests/*.test.mjs mcp/*.test.mjs`, API/UI tests as applicable, Compose configuration/build, then a read-only live discovery trial against a throwaway registry. No paid APIs, real applicant submission, or user-state mutation in tests.

## Performance gate

First benchmark the existing full-scan implementation using synthetic Postgres data at 1k, 10k, and 30k boards on the local Docker setup. Record p50/p95 due-selection latency, bytes/rows read, peak API memory, and total collection runtime at the existing concurrency and per-host pace. Add indexed, bounded selection per ATS lane if p95 due selection exceeds 250 ms at 10k boards, peak registry selection exceeds 256 MiB at 10k boards, or a normal scheduled cycle cannot finish within its configured interval at 30k boards. Re-run the same benchmark and ATS-fairness tests after any optimization. These are engineering thresholds, not claims about expected employer count or coverage.

## Source notes

- The [Greenhouse Job Board API](https://docs.greenhouse.io/job-board) documents public, unauthenticated GET endpoints for public job listings; its POST endpoint is an application submission boundary and remains out of Daymark's discovery path.
- The [Lever postings API](https://github.com/lever/postings-api), [SmartRecruiters Posting API](https://developers.smartrecruiters.com/docs/posting-api), and [Ashby job posting API guidance](https://docs.ashbyhq.com/using-the-lightweight-job-posting-api-to-list-openings-on-your-site) are vendor documentation to verify before implementing/advertising each capability.
- The [Department of Labor OFLC Performance Data](https://www.dol.gov/agencies/eta/foreign-labor/performance) publishes fiscal-year public disclosure files and record layouts for LCA and PERM programs. The data describe filings/determinations; they are historical signals, not guarantees of hiring or future role sponsorship.
- [Jobicy's public API documentation](https://github.com/Jobicy/remote-jobs-api) permits use in discovery products with source attribution and a canonical Jobicy link, and asks integrations not to start automated syncs more than hourly.
- [Himalayas' API documentation](https://himalayas.app/api) permits internal job-search interfaces with visible Himalayas attribution and source-approved application links; its dataset refreshes daily.
- [Tsenta's public product page](https://tsenta.com/ai-agent) states that it monitors more than 50,000 company career pages; it does not publish a complete source directory, so Daymark uses that only as a scale comparison, not as a list of sites to copy.
- If SEC EDGAR is later used for public-company identity resolution, follow its [fair-access and user-agent requirements](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data); it is optional and does not cover every employer.

## Out of scope

- New code for this roadmap itself; cloud provisioning; hosted model inference; paid job boards, contact enrichment, or data vendors; multi-user operation; autonomous applications; credential/CAPTCHA bypass; and any flow that submits without the applicant's explicit final approval.
- Coverage-count promises such as a fixed number of U.S. employers or ATS boards. Discovery yield must be measured from the cohort and reported with source and freshness limitations.

## GSTACK REVIEW REPORT

| Review | Runs | Status | Findings |
|---|---:|---|---|
| Scope challenge | 1 | Accepted as staged full coverage | Reuse existing discovery, queue, board registry, seven listing readers, aggregators, freshness, and form adapters after the 8-file complexity gate. |
| Architecture | 1 | Decisions resolved | Canonical employer/evidence records; role-level sponsorship stays separate from employer filing history; terms/robots gate for HTML. |
| Code quality | 1 | Addressed in plan | `robotsAllows()` currently has no production caller; future HTML discovery must check policy before fetching. No second discovery service. |
| Tests | 1 | Coverage specified | Node `node:test` retained; migration, provenance, entity resolution, feed edge cases, sponsorship semantics, adapter fixtures, and safety boundaries covered. |
| Performance | 1 | Benchmark-first gate accepted | Full registry scan identified in `job-sources/registry.mjs:51,70,128`; benchmark 1k/10k/30k before adding indexed selection. |
| Sources/cost | 1 | Within stated limits | Vendor and official-source docs cited above; paid sources disabled; $7/month total budget. |
| Outside voice | 0 | Skipped | Independent agent review skipped under the current no-subagent runtime instruction. |
| NOT in scope | 1 | Recorded | Listed above. |
| TODO cross-reference | 1 | Recorded | `tasks/todo.md` retains restore, simulated ATS receipt, external model/Mac relay, and MCP packaging gates; no cloud or paid-source task added. |
| Failure modes | 1 | Addressed in plan | Policy-denied crawl, throttling/schema changes, partial/empty listings, ambiguous entity matches, stale filings, and registry growth have pause/retry/manual-review/measurement gates. |

**VERDICT: Reviewed plan, staged full coverage; no implementation or live external source run is included in this document change.**

NO UNRESOLVED DECISIONS
