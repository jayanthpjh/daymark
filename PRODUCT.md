# Daymark
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
The owner runs a private job-search and application workflow on their Mac.

## Product Purpose
Discover roles, prepare factual per-job documents, sign into the ATS, fill known answers, request missing answers, review before sending, and track evidence of the outcome.

## Operating Context
A Mac API accesses Proton Bridge through Keychain. A Docker worker owns a separate browser session. PostgreSQL and Redis back the local queue. The Mac and Docker must remain awake.

## Capabilities and Constraints
Sign-in is required before applicant data, attachment replacement or submission. Unsupported login flows pause. Resumes must use verified qualifications. Submission needs explicit user approval and ATS confirmation. Uncertain submit attempts never retry automatically. Cover-letter generation is disabled in the pilot. Live application status is distinct from manually recorded history.

## Brand Commitments
Keep the Daymark name. The user explicitly selected a close visual match to Tsenta's application screens: compact status, grouped form receipt, Form / Resume / Cover / Job tabs, and clear review and issue states. Keep the existing stack and working actions.

## Evidence on Hand
Authenticated Tsenta list, completed/skipped detail, form, resume, cover-letter-empty and job panes inspected in the browser. No remote application was created for the design audit. Active submission screens are observable only while an application is running.

## Product Principles
- Show the current step and one clear next action.
- Distinguish account access, preparation, review and confirmed receipt.
- Preserve edits during background updates.
- Never invent submission success, and never change identity facts (employers, titles, dates, degrees, certifications). Skills and results may be added only in aggressive mode, tagged for review.
