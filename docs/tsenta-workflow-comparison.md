# Daymark application workflow compared with Tsenta

This comparison uses Tsenta's public product pages and changelog, checked 2026-10-05. It describes public claims, not Tsenta's private implementation.

| Stage | Tsenta's public workflow | Daymark today | Daymark direction |
| --- | --- | --- | --- |
| Find roles | Continuously monitors company career pages and accepts pasted job links. | Apify feed collection is user-started and capped at 100 new roles per day; pasted links are supported. The local Mac must stay awake. | Keep collection cost-visible and local. A later scheduler should be an explicit setting because each feed run can incur provider charges. |
| Match and queue | Match feed plus an application queue, with preferences controlling which roles proceed. | Preference match, filters, cards, and application queue exist; the overview has a live execution stream. Simultaneous Apply clicks now reuse one preparation task; current task status takes priority over stale manual application status. | Keep the best next action, match reason, and current task visible on the card and processing page. |
| Prepare materials | Tailored resume and cover letter, with changes available for review. | Source-aware preparation, proposed additions, editable resume review, PDF/DOCX output, and change log exist. NVIDIA Developer API calls remain blocked for real application data; the UI explains that no request was sent and retains the source-backed fallback. | Preserve profile facts and make each proposed claim traceable before approval. |
| Fill applications | Supported ATS workflows, saved profile data, application questions, and document upload. | Adapters support a limited ATS set. Workday and dynamic pages can pause on sign-in, missing answers, verification, or unsupported fields. Sign-in checkpoints link to the application workspace; only answer checkpoints link to the question inbox. Older actionable tasks remain visible when newer collection events arrive. | Treat a pause as a named checkpoint with the employer page, saved state, exact question, and one clear way to continue. The Docker worker now has a browser readiness probe and isolated viewer. |
| Review and send | Tsenta describes review-before-submit and auto-approve modes; its changelog shows an editable final review with answers and documents. | Daymark records filled-answer sources and documents, then uses its existing final review/submit controls. This implementation does not submit any application. | Keep a complete receipt and avoid treating a click or ambiguous employer response as proof of submission. |
| Track employer mail | Tsenta describes routing recruiter email to its application tracker, updating statuses, and saving reply drafts for the user to review/send. Its public description does not describe blanket forwarding to another mailbox. | Proton Bridge inbox, local categories, application routing, status changes, and manual status editing exist. | Added automatic forwarding of new, locally classified application mail to the personal inbox, while preserving the Proton/Keychain boundary. Existing messages are not bulk-forwarded; “Other” is not forwarded until relabeled. |
| Recovery and receipts | Web, desktop, mobile, and extension entry points are described publicly. | Daymark is a local Mac app: worker operation pauses when Docker or the Mac is down. It keeps task history, answers, source labels, status evidence, and a checkpoint. | Keep the dashboard honest about worker readiness and provide a direct path to the next recovery action. |

## Email forwarding behavior

Forwarding uses Proton Bridge SMTP on the Mac, authenticated with the same Bridge credential held in macOS Keychain. The Docker worker receives no Bridge credentials and cannot send mail. The host API starts from the current inbox UID and UIDVALIDITY baseline, then checks for new messages on a short interval. It forwards messages with a recognized application category, sends plain text rather than original HTML, preserves attachments up to 20 MB, and records each message before sending. If delivery is interrupted or ambiguous, Daymark marks it uncertain and does not automatically send it again.

Set the personal destination and enable or pause the feature in Settings → Proton Bridge mailbox. Classification is local; messages and labels are not sent to NVIDIA. Messages categorized “Other” remain in Proton until their labels are corrected. Existing mail is left alone.

## Public references

- [Tsenta overview](https://tsenta.com/) — find, prepare, apply, track, and inbox descriptions.
- [Tsenta changelog](https://tsenta.com/changelog) — review-before-submit behavior.
- [Tsenta privacy policy](https://tsenta.com/privacy) — connected inbox and draft/reply behavior.
- [Proton Bridge settings](https://proton.me/support/comprehensive-guide-to-bridge-settings) — local IMAP/SMTP ports and connection modes.
- [Proton Bridge IMAP/SMTP setup](https://proton.me/support/imap-smtp-and-pop3-setup) — Bridge support for local outgoing SMTP.
- [Nodemailer SMTP transport](https://nodemailer.com/smtp) — STARTTLS and SMTP connection options.
