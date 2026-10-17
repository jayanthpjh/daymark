# Saved assistant conversations

2026-10-16. Implements the accepted durable-conversation slice of the Daymark assistant plan for one applicant. This is production source code integrated with the server and UI; the browser verification uses synthetic data and a stubbed model. It does not enable employer actions or mail sending through chat.

## Architecture

Reuse the existing PostgreSQL record adapter and connection pool rather than adding a second persistence service. The assistant owns an additive `daymark_assistant_conversations` table. It shares the existing short-lived transaction lock with mailbox records; no model or network call holds that lock. The explicitly synthetic fixture backend uses the existing temporary file adapter. Production without PostgreSQL returns a visible configuration error rather than claiming chat is saved.

```
User message + conversation ID + stable request ID
  -> validate input and resolve application context on server
  -> atomic claim and persist user turn
  -> model + allowlisted read tools (outside transaction)
  -> persist reply, per-tool result/refusal, and target context
  -> render history + action receipts

Duplicate ID -> existing running/completed/failed result; no second execution
Different request while one is running -> conflict; no overlap
Provider failure -> saved failed turn; original message retained
Expired running turn -> interrupted; late output cannot overwrite it
Reload/reconnect -> read journal, never replay tool calls
```

Conversations retain up to 100 user turns and receipts; reaching the bound asks for a new chat and never silently trims records. The selector lists the most recent 50 conversations. Transcript contents are excluded from PostgreSQL list projections. Only the previous eight completed text exchanges enter a subsequent model request, as quoted untrusted conversation data. Prior tool results and old approval claims do not enter the prompt as authority.

The production assistant explicitly runs in read-only mode. Its prompt lists only wired read tools. Unsupported or mutating proposals become visible refusals; they do not enter the old in-memory approval queue. Even accidentally supplying a mutating executor does not bypass this guard. Mail sending and employer actions continue through their existing review controls. A future assistant action integration must add durable revision-bound approvals and domain checks deliberately; this feature is not that approval ledger.

## API

- GET `/api/agent/conversations`: bounded conversation summaries, no transcript body.
- POST `/api/agent/conversations`: create an empty conversation. Opening chat never sends a prompt.
- GET `/api/agent/conversations/:uuid`: restore the saved transcript and reconcile expired running states without executing tools.
- POST `/api/agent/message`: `{conversationId, requestId, message, jobId?}`. UUIDs are required; message length is 1–2,000 characters. The server resolves job/company/role and counts from persisted state. Client page text cannot grant authority.
- Legacy chat confirm/decline endpoints return a visible conflict directing the user to application/mailbox review controls.

Responses include `conversation`, turn `status`, `reply`, `ran`, and `refused`. Validation/missing/conflict/storage errors use explicit 400/404/409/503 status and a redacted error. Mutations require same-origin JSON and reject cross-site origins. Diagnostics contain event names, conversation/request IDs, status and action count, never message bodies, private answers or credentials.

## UI and drafts

One mounted panel offers Saved conversation, New chat, Reconnect history, and the existing application shortcuts. Switching conversations restores the corresponding transcript and browser-tab draft. Saved chats use PostgreSQL; unsent text uses sessionStorage for that tab, not the conversation database. Only the active conversation ID is in localStorage. A lost response retains the request ID for retry in the mounted panel. A known provider failure allows a new explicit request. Navigation from freshly completed read tools remains target-validated, and restoring history never triggers navigation.

## Verification and failure map

| Case | Expected result | Coverage |
|---|---|---|
| Restart/reload | Transcript, result and original application context restored | unit persistence + PostgreSQL integration + browser |
| Duplicate request / lost response retry | One model/tool invocation; same receipt | concurrent unit and PostgreSQL tests |
| Two different overlapping messages | Visible conflict | unit |
| Provider failure | Failed turn retained; internal error not exposed | unit |
| Interrupted turn / late model result | Interrupted state preserved, no replay | controlled-clock unit |
| Conversation at 100-turn bound | Preserve all history, request a new chat | unit |
| Malicious/unsupported model call | Refuse, no implicit approval or mutation | agent policy tests |
| Historical prompt injection | Previous text remains quoted data; no approval authority | prompt contract test |
| Missing DB / invalid ID / oversized message | Specific configuration/validation error | unit |
| Switching chats and reloading unsent text | Restore the correct chat and draft | browser |

Existing mailbox PostgreSQL tests now also verify assistant table persistence, summary projection, and deduplication across two store instances. The browser uses the production routes with temporary synthetic fixtures. Live model quality, real employer actions, and OCI operation are not claimed as verified.

## Rollout and boundaries

The actual Daymark process on port 4173 was not restarted, so ongoing application work and automation were not interrupted. New source behavior takes effect on the next controlled application restart. The synthetic preview on 4197 was refreshed for browser QA. No environment file, live profile, employer task, mailbox contents, credentials, or cloud resources were reset. Additive tables can remain in place when rolling back the UI. No new dependency was installed.

Remaining roadmap: connected draft insertion, durable domain-approval/action execution ledger, broader final-review/immutable-receipt improvements, complete ATS fixture journey, phone/zoom audit, and later OCI rollout. These remain separate work, not a claim that the full Daymark roadmap is finished.

## Verification result

Latest integration run: 392 tests total, 390 passed, zero failed, two existing skips. Frontend production build and TypeScript checks pass. Isolated PostgreSQL confirmed cross-instance claim deduplication and transcript-free list projections. Browser checks confirmed reload/new-chat/switching behavior; screenshot is `daymark-saved-assistant-preview.png` in the planning outputs. No formal gstack runner clearance, live-model validation or production restart is claimed.
