# Secrets checklist for the Oracle Cloud move

Nothing on this list is in the git repository. Each secret is entered once on the VM. Check each off as you do it.

| Secret | Where it lives today (Mac) | Where it goes on the VM | How |
|---|---|---|---|
| `NVIDIA_API_KEY` | `.env` / `.env.worker` | `/home/<you>/daymark/.env.oci` (mode 0600) | Pass your Mac env file to `node scripts/setup-oci.mjs ~/mac.env`; it reads only the keys it knows |
| `APIFY_API_TOKEN` | `.env` / `.env.worker` | `.env.oci` | same |
| `APPLICATION_EMAIL`, `PROTON_BRIDGE_USER` | `.env` | `.env.oci` | same |
| `APPLICATION_FORWARD_*` (optional) | `.env` | `.env.oci` | same |
| `DAYMARK_POSTGRES_PASSWORD` | `.env.worker` | `.env.oci` | **Generated new** by `setup-oci.mjs`. Do not reuse the Mac one. |
| `SEARXNG_SECRET` | none | `.env.oci` | Generated new |
| Proton Bridge password | macOS Keychain ("Daymark Proton Bridge") | `/srv/daymark/secrets/` as a file secret | **Not copied.** Log in to Bridge once on the VM (`docs/oci-deploy.md`, step 4), then save the generated Bridge password in Daymark Settings |
| Employer (ATS) logins | `data/ats-credentials.json`, macOS Keychain | `/srv/daymark/secrets/daymark-ats-credentials` | **Not copied.** Re-enter in Settings on the VM; employer accounts in `data/ats-accounts.json` are rebuilt on first sign-in |
| Tailscale auth key | none | `scripts/oci/cloud-init.yaml` (`TS_AUTHKEY`) | One-time key from your Tailscale account; delete the key after the VM joins |
| Backup encryption key (age) | none | public key in `/srv/daymark/backups/age-recipient.txt` | Keep the **private** key off the VM, for example in your password manager |
| OCI / GitHub credentials | your accounts | not on the VM | Use your own logins in the browser; never paste them into a file |

## Rules
- A secret is never committed, never placed in a Docker image, and never sent through GitHub.
- If a secret was ever typed into a chat or a file in the repo, replace it (new key) after the move.
- After the move, rotate `NVIDIA_API_KEY` and `APIFY_API_TOKEN` if you shared them anywhere else.
