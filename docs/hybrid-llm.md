# Daymark local Docker and provider policy

Daymark runs locally in Docker on one Mac. There is no model server in Compose or in OCI/GCP. Playwright form understanding uses deterministic field classification; supported fills remain deterministic and are verified by the browser worker.

## NVIDIA API gate

- NVIDIA is the only optional model provider for resume parsing/tailoring, cover letters, and grounded screening-answer drafts. These API calls leave the Mac.
- `LLM_HOSTED_ENABLED=true` is necessary but not sufficient. Local Compose sets `DAYMARK_NVIDIA_LIVE_APPROVED=false`, and the request client requires both switches before sending any prompt. A saved API key alone never enables calls.
- Leave the production gate off until the specific NVIDIA account and model endpoint permit production processing of real resume/application data and projected charges fit the $7/month total budget. NVIDIA quota or RPM does not set a spend cap. Check the [NVIDIA NIM access and production terms](https://docs.api.nvidia.com/nim/docs/product) before changing the gate.
- Source-backed preparation remains available when NVIDIA is disabled. Drafts require exact source quotes with claim-specific lexical anchors; legal, consent, demographic, authorization, and other sensitive answers are never sent to a model.
- `NVIDIA_RPM` defaults to 10 and accepts integers from 1 through 15. Redis reserves slots across API/worker processes; each retry and status poll consumes a slot. Transient errors retry at most twice, with bounded backoff. Uncertain application submissions never retry.

## Docker boundary

The API and worker both set `DAYMARK_LOCAL_LLM_DISABLED=true`, so stale `LLM_BASE_URL` settings cannot make Docker depend on an old local inference server. No model weights, inference containers, or GPU resources are used. The worker queue stays at concurrency one.

Local stack setup, persistent storage, backup/restore, MCP transports, and the Proton Bridge host-gateway limitation are documented in [the local Docker plan](local-docker-worker-plan.md). Cloud deployment instructions remain parked and are not part of the active setup.
