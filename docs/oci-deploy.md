# OCI deployment status

This deployment guide was replaced by [the hybrid LLM rollout runbook](hybrid-llm.md). Do not follow the old 4 OCPU / 24 GB instructions, Pay-As-You-Go upgrade step, or cloud Proton Bridge setup.

Local form-field evaluation on 2026-10-17 found Qwen3 4B consumed about 3.4 GiB and continued generating on a short prompt beyond one minute. Qwen3 1.7B returned HTTP 200 in 28 seconds but produced no JSON within a 60-token budget. Ollama was removed from OCI Compose; safe profile-field mapping now reuses Daymark's deterministic question classifier. No cloud model is needed for that task.

The OCI console was checked on 2026-10-17 in US East (Ashburn). It shows a Free Trial account, no instances in the root compartment, an A1 regional service limit of 16 OCPUs / 96 GB (0 used), and a 200 GB Free Tier Block Volume quota (0 used). The A1 shape is marked Always Free-eligible. These service limits do not increase the post-trial Always Free ceiling of 2 OCPUs / 12 GB.

Provisioning is still gated on reducing and measuring the container memory budget for a 12 GB host, confirming the selected OS image and boot disk are Always Free-eligible, and finishing the Mac Bridge relay restrictions. No paid upgrade or non-free spending is approved. See the runbook for the remaining benchmarks, security checks, and cutover gates.
