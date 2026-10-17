# Naming in Daymark

Every name should say what the thing is and belong to Daymark. No names borrowed from a folder, a tool or a draft.

## Docker
| Kind | Name |
|---|---|
| Compose project | `daymark` (set with `name:` at the top of each compose file) |
| Containers | `daymark-postgres`, `daymark-redis`, `daymark-worker`, `daymark-api`, `daymark-proton-bridge`, `daymark-llm`, `daymark-search` |
| Volumes | `daymark-postgres-data`, `daymark-redis-data` |
| Network | `daymark-net` |
| Database and user | `daymark` |

Containers, volumes and the network have explicit names, so they stay the same wherever the project folder lives or is renamed to.

## Repository and package
- Git repository: `daymark`. Package name: `daymark`.
- On a server the code lives in `~/daymark`; data lives in `/srv/daymark`.

## Code
- **Files:** kebab-case and descriptive (`application-removal.mjs`, `company-logos.mjs`). One idea per file. Tests are `<module>.test.mjs`; API scripts are `tests/api-<area>.mjs`.
- **Functions and variables:** camelCase, a verb for actions (`removeFromState`, `scheduledCollectionDue`), a noun for values (`approvalLedger`).
- **React components:** PascalCase (`MatchRing`, `JobDetail`). Hooks start with `use`.
- **Constants:** `UPPER_SNAKE_CASE` for fixed values (`MAX_ICS_BYTES`).
- **Task origins:** a short kebab-case label such as `scheduled-poll` or `auto-apply` (see `task-origin.mjs`).
- **Avoid:** `tmp`, `foo`, `data2`, `test1`, `thing`, and one-letter names other than loop counters or tiny callbacks.
- **Known gap:** older files (`server.mjs` and some `public-legacy/` code) use one-letter variables inside long functions. Rename them when you touch the function, not in a bulk change.

## Docs
- `docs/<TOPIC>.md`; guides for deployment start with the platform (`oci-deploy.md`, `oci-data-move.md`).
