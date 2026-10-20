# Daymark MCP

Daymark exposes the same bounded read and action catalogue over local stdio and authenticated Streamable HTTP. The current tools can search saved jobs, inspect application status and tracker pages, list items waiting for the applicant, save a job link, queue source-backed document preparation, draft screening answers as approval cards, and request an applicant approval card to fill a prepared form.

MCP can never confirm an approval or submit an application. A fill request creates a durable Daymark approval card; the applicant must review and approve it in Daymark. Resume and cover-letter generation uses the source-backed fallback while NVIDIA is gated off; when enabled, Daymark's factual checks and document review still apply. Playwright remains the deterministic browser operator. The first release does not expose mail, credentials, resume bodies, raw job descriptions, private paths, OTPs, raw browser state, or outbound sending.

## Local clients

The stdio server runs inside the API container. Configure a compatible local client to launch it through Docker:

```json
{
  "mcpServers": {
    "daymark": {
      "command": "npm",
      "args": ["run", "mcp:stdio"],
      "cwd": "/absolute/path/to/let-us-workm-x20"
    }
  }
}
```

The Compose API service must be running. The stdio process reads the same private settings and database as the app. PostgreSQL reads use a read-only connection setting and transaction.

Write tools proxy to the local Daymark Streamable HTTP endpoint so queueing and approval always use the live application services. `npm run worker:setup` creates a private 64-character bearer token in `.env`; it is never placed in an MCP client config or shared with a hosted assistant. To rotate it, replace `DAYMARK_MCP_TOKEN` in `.env` and restart the stack.

The stdio process reads the token from the same mounted `.env` file. It proxies only to `127.0.0.1:4173` inside the API container; alternate remote endpoints are outside this local setup.

## Streamable HTTP

The app serves `/mcp` on its local API listener. Compose publishes the API only on `127.0.0.1:4173`; the default Host allowlist accepts `127.0.0.1:4173` and `localhost:4173`. Do not add a public, proxy, or Tailscale MCP route.

This first transport uses a static bearer token. MCP clients that require an OAuth authorization server or dynamic client registration are not supported yet. The protocol is implemented with the official MCP TypeScript SDK v2 Streamable HTTP handler, with Host and Origin checks and bounded request bodies. Compatibility with each individual client remains to be smoke-tested; the supported-client matrix is intentionally pending rather than claiming universal support.

## Safety and persistence

MCP action requests require Daymark’s PostgreSQL mailbox store, which provides durable idempotency records and approval cards. Without it, reads stay available and writes fail closed. Idempotency keys are 16–128 safe characters, persist across retries, and conflict if reused with different input. An uncertain request is not automatically repeated. The initial browser worker concurrency remains one application at a time.

MCP reads return employer and role names and application progress, which are shared with the connected assistant under that client’s data handling rules. They omit credentials, verification codes, mail and private document contents. Error responses avoid local paths and database connection details.

Run `npm run test:mcp` for protocol negotiation, read-scope, schema, authorization, idempotency, and approval-boundary tests. Codex, ChatGPT, Claude, and other compatible clients still need individual connection and workflow smoke tests before they can be listed as verified.
