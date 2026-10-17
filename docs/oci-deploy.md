# Deploying Daymark on Oracle Cloud (Always Free)

One Ampere A1 VM (arm64, 4 OCPU / 24 GB) runs everything: API, browser worker, PostgreSQL, Redis, Proton Bridge, a local LLM and SearXNG. Nothing is open to the public internet. You reach Daymark and the live browser viewer over Tailscale only.

## How mail works
- **Proton is the application mailbox.** Applications, employer account logins, verification codes and status tracking all use one Proton address (`APPLICATION_EMAIL`), read by Proton Bridge running headless on the VM.
- **Codes stay inside Daymark.** Verification and security codes are matched on the server and handed to the browser worker over a local socket. They are never forwarded.
- **Forwarding is optional.** If you set `APPLICATION_FORWARD_TO` to another inbox, only Interview, Offer, Rejection, Screening and Assessment mail is forwarded, as a short summary by default.
- **Private mail on your own domain is on hold.** The code for per-application addresses (`app-address.mjs`) is in the repo but only switches on if you set `MAIL_DOMAIN` and `MAIL_ALIAS_SECRET`. Leave them unset.

## Before you start
- **A paid Proton plan** (Mail Plus or higher) on the application account; Bridge requires it.
- **Use a Proton account separate from any personal one** if you want to keep application mail apart. Check which account `APPLICATION_EMAIL` and `PROTON_BRIDGE_USER` belong to.
- **OCI upgraded to Pay-As-You-Go.** Always Free resources stay free, and Oracle stops reclaiming idle instances. Set a $1 budget alert. If A1 says "out of host capacity", retry in another availability domain.
- **Tailscale account** and the app on your Mac and phone.
- **A private GitHub repo.** The project is already a local git repo with commits and no remote: create an empty private repo on GitHub, then `git remote add origin <url>` and `git push -u origin main`.

## 1. Create the VM
Shape `VM.Standard.A1.Flex`, 4 OCPU, 24 GB, Ubuntu 24.04, 50 GB boot volume, **no public inbound ports** in the security list. Paste `scripts/oci/cloud-init.yaml` into the cloud-init box after replacing `TS_AUTHKEY` with a one-time Tailscale key. Then `ssh ubuntu@daymark` over Tailscale.

## 2. Attach storage
Create a 150 GB block volume, attach it, format it, mount it at `/srv/daymark` (add to `/etc/fstab` with `nofail`).

## 3. Get the code and configure
```bash
git clone <your-private-repo> ~/daymark && cd ~/daymark
node scripts/setup-oci.mjs ~/mac.env      # ~/mac.env is optional: only NVIDIA, Apify, the application address and forwarding settings are read
docker compose --env-file .env.oci -f docker-compose.oci.yml up -d --build
```
`setup-oci.mjs` never copies Bridge or ATS passwords. The first build compiles Proton Bridge from source and takes several minutes. Check `BRIDGE_VERSION` in `docker/Dockerfile.bridge` against Proton's releases first.

## 4. One-time Proton Bridge login
```bash
docker compose --env-file .env.oci -f docker-compose.oci.yml run --rm proton-bridge init
# at the Bridge prompt:  login   (email, password, 2FA)   then   info   to read the generated IMAP/SMTP password
```
Proton may challenge a login from a cloud IP; do this while you can answer it. Then save the Bridge username and the generated password in Daymark Settings. The password is stored as a file secret under `/srv/daymark/secrets`, never in the image.

## 5. Move your data from the Mac
1. `pg_dump` the Mac database and copy `data/` (resumes, generated files, adapters, answer pack) to `/srv/daymark/data`. Do not copy browser profiles.
2. Restore the dump into the VM's Postgres.
3. **Stop the Mac stack** (`npm run worker:down`, `npm run infra:down`) so two workers never share one queue, and so two Bridges are not logged into the same account.
4. Sign into employer sites again through the live viewer (`http://<tailscale-ip>:6080`).

## 6. Backups and updates
Create an age key pair, put the public key in `/srv/daymark/backups/age-recipient.txt` and keep the private key off the VM. Nightly: `sudo cp scripts/oci/backup.sh /etc/cron.daily/daymark-backup`. Restore drill: decrypt, `tar -x`, load the SQL into a scratch Postgres, compare row counts. Update with `scripts/oci/deploy.sh` (it rolls back if `/api/health` does not come up).

## Settings the VM uses
| Variable | Purpose |
|---|---|
| `DAYMARK_SECRET_BACKEND=file`, `DAYMARK_SECRETS_DIR` | file secrets instead of the macOS Keychain |
| `DAYMARK_HOST` | API bind address (0.0.0.0 inside Docker, published only on the Tailscale IP) |
| `PROTON_BRIDGE_HOST=proton-bridge`, `DAYMARK_BRIDGE_HOSTS` | the Bridge container the API connects to, and the extra host it may use |
| `LLM_BASE_URL`, `LLM_MODEL` | local OpenAI-compatible model (Ollama); NVIDIA stays the fallback |
| `APPLICATION_FORWARD_TO`, `APPLICATION_FORWARD_CATEGORIES`, `APPLICATION_FORWARD_MODE` | optional forwarding: where, which categories, `summary` or `full` |

## Risks
- **Cloud IPs.** Workday and Cloudflare-protected sites show more CAPTCHAs to datacenter IPs. Those pause for you; solve them in the live viewer over Tailscale.
- **Bridge on a server.** It is built from source and runs headless; test the login and a received verification code before moving real applications.
