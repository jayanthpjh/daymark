# Daymark hybrid LLM implementation

2026-10-17; updated 2026-10-19. Supersedes conflicting routing, Bridge and paid-upgrade instructions in docs/IMPLEMENTATION-PLAN.md and the historical proposal in tasks/tsenta-parity-plan.md.

## Inspection
Existing Node application, BullMQ/Redis queue, deterministic Playwright ATS adapters, source-only honest tailoring, model-assisted strong/aggressive tailoring, protected identity checks and final submission approvals. Git working tree was clean before this work. Do not restart live services or run live applications during implementation.

## Ordered phases and acceptance
1. Model boundary: no local or cloud model hosting. Use deterministic Playwright field understanding; NVIDIA is an optional external API and remains disabled for real application data until the specific account terms and budget are verified. Fail closed when disabled or unavailable, preserve source-based preparation, and block sensitive content before dispatch.
2. Request controls: bounded local queue, hosted request pacing default 10 RPM, maximum 15, shared across API/worker when Redis is configured. Count retries and polling; bounded retries for 429/temporary server failure, honour Retry-After; no retry of submission actions. Test concurrency and pacing with fake clocks.
3. Quality: retain protected identity checks, disallow unsupported model additions, bind source evidence to each writing claim, and preserve final review. Test unsupported numbers, skills and identity mutations. Benchmark NVIDIA models with synthetic fixtures before enabling any hosted model for real application data.
4. Application safety: one application execution at a time initially, retain durable queues, explicit submission approval, host-scoped credentials and manual consent/CAPTCHA handling. Test queue and existing approval protections.
5. Local deployment: run the API, dashboard, PostgreSQL, Redis, Playwright worker and MCP in local Docker with persistent data and loopback-only published ports. Keep Proton Bridge on the Mac and pause mail/OTP until a restricted relay is verified. OCI and GCP provisioning are explicitly out of scope for this release.
6. Integration: full unit tests, web tests/build if UI changes, simulated ATS workflow. Live model benchmark and real ATS final-review checks require available services and explicit test data. No production migration until backups restore and soak checks pass.

## External gates
- OCI is parked for this release. Do not provision resources or change the tenancy; the prior console review did not verify A1 entitlement.
- Hosted NVIDIA terms, model access, rate allowance, and actual cost require account verification; a catalog listing is not an account quota guarantee. Until verified, real-data calls remain disabled.
- Mac availability is required for Bridge mail/OTP flows; unavailable mail pauses authentication. Mail stays paused until a restricted relay is validated.

Sources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm ; https://docs.api.nvidia.com/nim/reference/z-ai-glm-5-3-infer


## Phase 7: Daymark MCP interface — included in the local implementation; client rollout remains staged

Goal: a Tsenta-like conversational workflow for discovering jobs, preparing materials, inspecting application progress, reviewing the filled form and tracking replies. This is a product capability target, not a promise of Tsenta feature parity. Tool metadata was inspected; no Tsenta account data was accessed or changed.

### Reuse before building
The repository already has `agent-tools.mjs` (tool catalogue and read/change/approve tiers), `agent-actions.mjs` (application actions), `agent-approvals.mjs` (approval runtime), `agent-read-tools.mjs` and `agent-server.mjs`. MCP should adapt these same services so dashboard and chat use the same task IDs, state, quality gates, provider queues and approval checks. Do not create a second browser worker, application database or LLM router.

### Planned increments and acceptance
1. **Read interface:** expose bounded job search/details, profile readiness, task/application status, unanswered questions, draft/review receipts and tracker queries. Strict schemas, pagination and explicit state meanings. Acceptance: reads cannot queue actions; credentials, verification codes, raw browser state and private file paths never appear in responses.
2. **Draft interface:** add job links and queue source-backed resume/cover/screening preparation through existing services. Return task IDs and next actions immediately; clients poll status. Client retries use idempotency keys and expected document versions. Acceptance: duplicate calls create one preparation, cancellation is recorded accurately, unsupported claims are held for review, NVIDIA calls share the existing 10 RPM schedule and 15 maximum.
3. **Fill and review:** request a fill through the approval dispatcher; report missing fields, sign-in/CAPTCHA checkpoints, selected answers and document versions. Acceptance: Playwright remains deterministic, only one application runs, no consent/credential/OTP appears in model prompts, stale form snapshots require reinspection.
4. **Submission boundary:** expose a request-for-review tool, not an unrestricted submission tool. Human confirms in Daymark against application ID, employer identity, document/answer fingerprint and expiry. MCP callers cannot mint approvals or confirm their own requests. Acceptance: missing, expired, replayed or changed-material approvals fail; uncertain employer outcomes never auto-retry; only an employer receipt means submitted.
5. **Tracker and inbox:** bounded tracker status/history first. Mail search/selected threads and reply drafts are a separate opt-in scope, with mail still served through Mac Bridge. No outbound sending in the first MCP version. Acceptance: mail unavailable produces a named pause, draft save does not send, returned personal/mail data has explicit client disclosure.
6. **Transport and packaging:** Target all compatible MCP clients, including Codex, ChatGPT, Claude and other standards-compliant clients. Provide stdio for local clients and Streamable HTTP for remote clients, sharing one tool catalogue and service layer. Remote access requires supported authorization, strict Origin/Host handling and revocation. A private Tailscale URL is not assumed reachable by cloud clients. Pin SDK/protocol versions, package with reproducible install/start instructions and a compatibility matrix and client smoke tests; public plugin distribution is deferred. Test protocol negotiation, tool discovery, schemas, authorization, task polling and approval handoff on each supported client. Universal compatibility is a target, not an untested guarantee; document client-specific limitations.

### Data flow
```text
MCP client -> validated Daymark MCP adapter -> existing action/approval services
                                               | reads -> bounded state/review receipts
                                               | drafts -> same provider queues + factual gates
                                               | fill -> one Playwright worker -> final review
                                               | submit request -> Daymark human approval -> verified receipt
Mac Proton Bridge -> restricted Tailscale relay -> Daymark mail service
```

### Test diagram and rollout gate
```text
schema/auth/read-scope tests -> adapter/service contract tests
                            -> idempotent draft + durable task integration
                            -> simulated ATS fill -> stale/replayed approval rejection
                            -> explicit human approval -> one simulated receipt
                            -> local + remote MCP client compatibility tests
```
Test disconnects, cancellation, Redis/model failure, rate limiting across API/MCP/worker, malformed output, malicious job/mail text, duplicate requests, changed documents and unavailable Mac. Measure tool response latency separately from background model/browser runtime. Polls should not invoke a model. Keep MCP disabled until authorization and submission-boundary tests pass.

### Open engineering decisions
- Client scope decided by user: all compatible MCP clients. Support both local stdio and remote Streamable HTTP. Verify Codex, ChatGPT, Claude and additional clients against a published compatibility matrix; choose rollout order based on available test access, without restricting the product to those clients.
- Grant resume and mail read scopes separately; sharing data through MCP also exposes it to the connected assistant under that client's data handling rules, even when form inference is local.
- Request-only submission is the recommended first release; retain confirmation in Daymark.
- Future optional parity: named resume variants, feed preference updates, dry-run application rules, outreach drafts. Do not enable autonomous submission, paid contact enrichment or new paid job sources as part of MCP.

### Review status
The MCP read contract and local stdio transport are implemented in `mcp/read-interface.mjs` and `mcp/read-stdio.mjs`, backed by existing read tools plus a bounded tracker page. Privacy, pagination, argument validation, protocol negotiation and response redaction checks pass. Authenticated Streamable HTTP exists on the local API, but broad remote access and client compatibility remain out of scope until separately reviewed. The local API now rejects untrusted Host/Origin and cross-site mutations, NVIDIA calls require both explicit opt-ins, and HTML discovery requires an exact-host terms review plus a reachable permissive robots.txt; redirects fail closed. The full unit suite, web tests/build, Compose config, Postgres/Redis integration and browser fixtures are part of this ship validation. OCI is parked. Live NVIDIA eligibility, simulated ATS receipt/replay, backup restore soak, the restricted Mac mail relay and external MCP-client compatibility remain deferred before production use.

Reference: https://ts.sdk.modelcontextprotocol.io/server and the available Tsenta connector tool descriptions (capability contract only, not its private implementation).
