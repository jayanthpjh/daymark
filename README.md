# Daymark

Daymark is a local job-search and application-preparation app for macOS. Its dashboard and worker run on your Mac at `http://127.0.0.1:4173`.

## Start Daymark

1. Install Node.js 20 or newer and Google Chrome.
2. In this folder, run `npm install` once, then `npm start`.
3. Open `http://127.0.0.1:4173` in your browser. Keep the terminal window running; the background worker runs while the Mac is awake.
4. In Settings, enter an Apify API token, NVIDIA API key, and your Proton application email. Keys are stored in a private `.env` file on this Mac.
5. In My profile, add target roles and locations, save your verified details, and upload a text-based PDF or DOCX resume.
6. Choose Collect jobs. The feed requests 200 actor results, filters duplicates, and stores at most 100 new roles per day.
7. Choose Prepare application on a role. After a confirmation that names NVIDIA as the destination, Daymark sends your resume text, saved answers, and that role description to NVIDIA Kimi K3. It creates a tailored DOCX and PDF resume plus a cover letter DOCX for review.
8. Choose Fill application form on a reviewed task to open Chrome and fill known fields for supported ATS adapters. Review remaining required fields and submit the application yourself.

## Mail and login setup

Install and sign into Proton Mail Bridge yourself. In Settings, enter the local IMAP username and generated Bridge password shown by the Bridge app; Daymark stores that password in macOS Keychain. The Inbox page can then list recent messages locally. It does not send mail content or verification codes to NVIDIA.

ATS site passwords can be saved in Settings to `data/ats-credentials.json`. The file has owner-only permissions. Site authentication and multi-factor challenges may still need your interaction in Chrome.

## Local data

Profile, imported resume, answer pack, jobs, generated documents, and tasks are stored under the ignored `data/` directory. API keys and the application email are in the ignored `.env` file. Keep backups private. Removing `data/` deletes this local application history and saved ATS credentials; removing `.env` clears provider credentials.

## Supported scope

Job discovery uses the Apify `fantastic-jobs/career-site-job-listing-feed` actor. The first browser adapters cover Greenhouse, Lever, Ashby, Workday, SmartRecruiters, and iCIMS. Selectors can vary by employer and page version; inspect each opened application page. Other ATS jobs can still use tailored documents manually. The app never clicks the final application submit button.

Application question suggestions use NVIDIA only after a per-question confirmation in the UI (when offered). Eligibility, legal, demographic, background-check, work-authorization, and consent questions require your own answer. CAPTCHA and account recovery steps remain yours to complete.
