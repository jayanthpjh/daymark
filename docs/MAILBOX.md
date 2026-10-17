# Daymark mailbox

Implemented 2026-10-16 for one applicant. The accepted decision is dedicated PostgreSQL storage, with the complete workflow delivered in working increments. No infrastructure was provisioned and no real message was sent during development.

## Architecture and decisions

Reuse ImapFlow, mailparser, Nodemailer, existing Proton credentials, message classification, application matching, and the existing model router. No new package, tenant layer, provider subscription, or queue was added. Five additive tables share the existing database: `daymark_mail_messages`, `daymark_mail_drafts`, `daymark_mail_send_attempts`, `daymark_mail_sync`, and `daymark_mail_attachments`. Rows contain an ID and JSONB payload. Thread identity comes from References / In-Reply-To / Message-ID, never matching subjects alone. Threads do not need their own service or table. A cross-process PostgreSQL transaction lock serializes mailbox mutations for this one-user workload. IMAP and SMTP operations run outside database transactions.

```
Proton Bridge -> metadata/size check -> bounded MIME parsing
                                      -> messages + files + cursor (one transaction)
                                      -> classified, application-linked conversation cards

Compose -> versioned saved draft -> exact-revision review -> send claim
                                                       -> SMTP
                                                          | accepted -> Sent history
                                                          | rejected -> editable draft
                                                          | uncertain -> locked draft
                                                                         -> inspect Sent
                                                                         -> positive evidence: sent
                                                                         -> human confirms not sent: new review allowed
```

Mailbox reads do not invoke IMAP or mutate application status. Explicit sync and the 60-second background poll import Inbox and the provider's discovered Sent folder. Existing application verification/routing runs after mailbox persistence; its failure is logged independently. No background process sends replies. Review approvals expire after ten minutes and are invalidated by an edit. A stable draft ID makes a lost create response retryable. Duplicate send requests cannot claim the same attempt twice. Restarted in-flight sends remain protected; after two minutes reconciliation can check Sent by the exact Message-ID. A missing Sent message is not proof of non-delivery, so it never triggers automatic resend. The user can explicitly release an uncertain attempt after checking Proton, with a recorded resolution reason.

## API contract

All routes use existing same-origin local Daymark access. Mutations require JSON, reject cross-site Origin/Sec-Fetch-Site, and do not enable CORS. Errors are `{error: string, code: string}` with 400 validation, 403 origin rejection, 404 missing resource, 409 version/approval conflicts, or 503 integration/storage failure. No mail body, addresses, files, credential, or model content is logged.

| Route | Contract |
|---|---|
| GET /api/mailbox | folder, query, offset, optional jobId; returns threads, draft summaries, nextOffset, hasMore, connection, demo |
| POST /api/mailbox/sync | `{older?: boolean}`; imports a bounded window and atomically checkpoints it |
| GET /api/mailbox/threads/:id | recent messages in chronological order; capped indicator for long threads |
| POST /api/mailbox/messages/:id | boolean unread/starred/archived/needsReply or jobId; applies to stored conversation records |
| POST /api/mailbox/drafts/:uuid | to, subject, body, attachments, revision; revision 0 creates a stable-ID draft; updates require current revision |
| GET /api/mailbox/drafts/:id | full editable draft including files |
| POST /api/mailbox/drafts/:id/review | revision; returns exact preview and server-owned attempt ID |
| POST /api/mailbox/drafts/:id/discard | revision; refuses a sent, in-flight, or uncertain draft |
| POST /api/mailbox/attempts/:id/send | claims the reviewed attempt once; returns attempt status |
| POST /api/mailbox/attempts/:id/reconcile | checks provider Sent by Message-ID; never resends |
| POST /api/mailbox/attempts/:id/resolve-not-sent | `{confirmed:true}`; explicit human resolution of an uncertain attempt |
| GET /api/mailbox/attachments/:id | binary attachment download, encoded filename, no-sniff, sandbox policy |
| POST /api/mailbox/assist | threadId, mode summary/reply; read-only model assistance, no send authority |

## UI behavior

Conversation cards replace the mock row list. Views: Inbox, Needs reply, Interviews, Assessments, Updates, Unread, Starred, Drafts, Sent, Archive, All. Search, pagination, older-mail import, loading/empty/error states, last-sync status, read/star/archive, manual application linking, and application-scoped mail reuse the same stored data. Read/star/archive are explicitly Daymark-local organization; they do not mutate Proton folders or flags. Needs reply clears after a sent reply or an explicit Mark handled action.

Drafts debounce-save, save on close, warn before unloading unsaved edits, and flush pending edits on composer unmount. Conflicting edits stay visible and can be copied before explicitly loading the server version. Review shows sender, recipient, subject, full body and attachment names. The result says server acceptance, not guaranteed delivery. No automatic replies, availability commitments, salary commitments, or employer actions are delegated to AI.

The message reader renders plain text. Remote pixels and HTML scripts are not rendered; validated HTTP(S) links are explicit external actions. Attachment downloads never render inline. Model buttons explain that the thread goes to the configured model provider. Mail is isolated as untrusted user-role data; the model gets no tools. Invalid/empty model output and refusal without usable text are visible errors.

## Bounds and operational requirements

Production requires `DAYMARK_DATABASE_URL` and existing Proton Bridge settings. Mac credentials stay in Keychain; Linux uses the existing private secret-store configuration. The synthetic preview alone sets `DAYMARK_MAIL_DEMO=true`, stores fixtures in a temporary owner-only file, and uses a no-delivery transport. It is labelled Synthetic demo. Never enable that switch for a real mailbox.

- Sync imports up to 50 messages per discovered folder per pass; initial import starts with the newest window. Older import walks backwards. UIDVALIDITY changes rebaseline safely. Empty and sparse UID ranges are supported.
- Full source larger than 15 MB is not downloaded. A placeholder explains how to read it in Proton.
- Import stores up to 20 attachment entries per message, 10 MB of file bytes per message, and 20 MB of file bytes per sync batch. Unavailable files are explicitly marked for downloading in Proton.
- Outbound: one recipient, subject <=300 chars, body <=60,000 chars, <=5 files totaling <=10 MB. MIME is generated by Nodemailer; no user URL or file-path loading is allowed.
- Lists page 50 distinct threads; thread detail/action propagation is bounded to the latest 200 stored records and the reader discloses this cap. Draft listing returns at most 200 draft summaries and strips file bytes in PostgreSQL before materializing results.
- Additive startup migrations preserve application tables. Rollback: stop mailbox polling, restore previous code/UI, retain mailbox tables and drafts; no destructive down migration.
- Before any public/OCI exposure, complete the separate deployment/authentication and backup review. This implementation does not open a listener beyond the existing Daymark host configuration.

## Failure and verification map

```
Sync -> missing credentials / Bridge offline -> cached history + retry message
     -> oversized source/file -> explicit Proton fallback, no oversized fetch
     -> UID validity reset -> new identity/window, preserve stored history
     -> fetch/parse failure -> no cursor advancement, release mailbox lock
Draft -> stale revision -> 409, preserve editor text, reload/copy recovery
      -> lost create response -> stable-ID retry, no duplicate draft
Review -> expired / changed version -> 409, require fresh review
Send -> concurrent request -> one claim, one SMTP invocation
     -> authentication/envelope rejection -> retained editable draft
     -> DATA disconnect / crash -> uncertain/in-flight state, no automatic retry
     -> persistence failure after SMTP -> retained claim, reconcile after restart
Files -> invalid base64/header injection/limit -> reject before sending
Model -> absent/malformed/refusal/failure -> explicit error, no mail mutation
```

Tests live in `tests/mailbox*.test.mjs`. They cover persistence/restart, draft races, stable-ID retry, review invalidation, single send claim, uncertain/rejected delivery, human resolution, safe download headers, cross-origin writes, malformed JSON, limits, message threading, application overrides, cache preservation, UID windows/reset/empty/error paths, oversized MIME, HTML link extraction and model prompt separation. PostgreSQL integration uses an isolated temporary schema. SMTP integration exercises real Nodemailer against a loopback-only synthetic SMTP server, including disconnect after DATA. Existing tests cover classification, verification routing and mail-body extraction.

Browser QA covers cards, opening threads, saved draft reload, review/send with no-delivery transport, attachments displayed, and mailbox/application navigation. Live Proton delivery, live-model quality, and phone-width testing remain separate validation, not claimed as completed.

## Outside current scope

Multi-user ownership, OCI provisioning, public hosting, provider-side folder mutations, CC/BCC/reply-all, scheduled sends, signatures/rules builders, and automatic reply sending. No mock mail is used by the Mail screen or application Mail tab; unrelated sample calendar data remains labelled separately.

## Verification result

2026-10-16: 382 tests total; 380 passed, zero failed, two existing skips. PostgreSQL and SMTP integration tests ran against isolated synthetic infrastructure. Frontend production build and TypeScript checks passed. Browser proof: `daymark-mailbox-preview.png` in the planning workspace outputs. Existing Vite bundle-size warning remains; no new dependency was added.
