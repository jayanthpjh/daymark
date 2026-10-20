# Daymark hybrid rollout plan

This is the current execution plan for the hybrid LLM and MCP rollout. Detailed implementation and safety decisions live in [hybrid-llm.md](hybrid-llm.md) and [mcp.md](mcp.md).

## Completed locally

- Route form understanding to a local quantized model; let Playwright validate, fill, and verify fields deterministically.
- Route resume tailoring, cover letters, and screening drafts to a configurable hosted provider, with NVIDIA GLM/Nemotron candidates benchmarked before selection.
- Enforce 10 RPM by default and a configurable maximum of 15 RPM, with shared queueing, bounded retries, factual checks, and single-application execution.
- Add the Daymark MCP server, guarded tools, approval steps for writes, and local stdio plus authenticated HTTP transport.
- Keep Proton Bridge on the Mac; the OCI compose stack has no Bridge container.
- Pass the current local Node and MCP regression suite (3 environment-dependent skips). OCI deployment and live integrations remain untested.

## OCI findings (2026-10-17)

- OCI is a Free Trial in US East (Ashburn), the home region. The console showed no instances in the root compartment.
- Regional Compute service limits show A1 ceilings of 16 OCPUs / 96 GB, with 0 used. These ceilings do not mean that all of this is Always Free.
- Block Volume shows a Free Tier quota of 200 GB, with 0 used. This includes boot and data volumes together.
- The VM wizard labels `VM.Standard.A1.Flex` Always Free-eligible. Oracle's current post-trial Always Free ceiling is 2 OCPUs / 12 GB total. Plan for no more than this; the old 4/24 GB target is obsolete.
- Do not upgrade to Pay-As-You-Go, rely on a budget alert as a cap, or provision anything that may consume trial credits without explicit approval.

## Remaining gates

1. **Resource budget:** the Compose ceilings now total 8.625 GiB. Benchmark the model, browser worker, and host together to confirm those caps work and leave adequate operating-system headroom before approving a 12 GB VM.
2. **Provider selection:** benchmark the pinned local model and accessible NVIDIA GLM or alternative endpoints using synthetic resume data. Keep the 10 RPM default, never exceed 15 RPM, and select models based on quality and latency results.
3. **Mac mail relay:** keep Bridge local; verify Tailscale Serve ports and ACLs expose them only to the Daymark node. Test inbox sync and OTP matching before migration.
4. **Safety checks:** exercise simulated ATS forms, factual review failures, MCP approval cards, authentication, and the final-review barrier. No test submits an application.
5. **Recovery:** run the encrypted backup and restore drill, record row counts and checksums, and keep the Mac as rollback until recovery passes.
6. **Soak:** run a 24-hour health and resource check before cutover.
7. **Provision only after all prior gates:** use an Always Free-eligible A1 shape at or below 2 OCPUs / 12 GB and keep combined boot plus block volume at or below 200 GB in the home region. Keep public inbound ports closed and connect over Tailscale. Stop before any paid upgrade or overage.

OCI provisioning is parked for this release. No cloud resources have been provisioned; any future provisioning requires a fresh tenancy, capacity, and cost review.
