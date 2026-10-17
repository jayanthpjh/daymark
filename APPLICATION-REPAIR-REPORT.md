# Application repair verification — 2026-10-05

Daymark is running at http://127.0.0.1:4173 with automatic submission enabled and one worker. Local state was backed up before migration. No paid collection retry was launched.

112 regression tests passed with local networking permitted, no failures or skips. Isolated workflow checks cover queue/answer endpoints, dynamic forms and browser handoff, automatic submission and duplicate protection, document replacement, batch eligibility and collection limits. Desktop/mobile question controls were checked, including unchecked remembering, retained draft choices and no horizontal overflow.

## Affected live applications

| Company | Role | Actual state | Remaining blocker | Missing questions |
|---|---|---|---|---|
| Booz Allen Hamilton | Palantir Data Engineer | Needs verification | Account creation was already requested. Complete verification in Chrome or wait for the email, then Continue processing. |  |
| Fusion Worldwide | Senior Data Engineer  | Submission unconfirmed | Submit was clicked but no confirmation appeared. Check the employer page or your inbox before trying again. |  |
| Gemini | Senior Data Engineer | Needs your answer | Application information: 1 question need your answer. | Applicant Privacy Statement * |
| Roblox | Senior Data Engineer, Economy  | Needs verification | The application form is not available yet. Open the application or complete sign-in, then Continue processing. |  |
| RGP | Senior Data Engineer Consultant | Needs your answer | This does not look like the end of an application: no Submit button was found. Choose Resolve this step to continue it in Chrome. |  |
| 73 Strings | Senior Data Engineer | Needs your answer | This does not look like the end of an application: no Submit button was found. Choose Resolve this step to continue it in Chrome. |  |
| Capgemini | Python & AWS Data Engineer | Needs your answer | This does not look like the end of an application: no Submit button was found. Choose Resolve this step to continue it in Chrome. |  |
| Booz Allen Hamilton | Data Engineer | Needs verification | Account creation was already requested. Complete verification in Chrome or wait for the email, then Continue processing. |  |
| Paramount | Sr Data Engineer (Data Architecture and Modeling) | Needs your answer | This does not look like the end of an application: no Submit button was found. Choose Resolve this step to continue it in Chrome. |  |
| 4500 Marathon Petroleum Company LP | Senior Data Engineer | Needs your answer | My Information: 2 questions need your answer. | How Did You Hear About Us?*; Country Phone Code* |

Fusion: Submit was clicked once, but no employer confirmation was received. This is uncertain, not Applied; no automatic retry will occur. Inspect the saved employer session or inbox, then record the outcome.

Other rows remain paused; no new employer-confirmed submission was recorded during these live checks. Previously recorded outcomes and documents remain saved. Resolve this step uses the dedicated employer profile; the ordinary employer link may require sign-in.
