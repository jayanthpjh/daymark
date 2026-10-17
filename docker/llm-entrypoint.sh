#!/bin/sh
# Starts Ollama and pulls the pinned models once; they persist in the volume.
set -eu
ollama serve &
pid=$!
for i in $(seq 1 60); do ollama list >/dev/null 2>&1 && break; sleep 1; done
for model in ${LLM_MODELS:-qwen3:8b qwen3:4b nomic-embed-text}; do ollama pull "$model" || echo "pull failed for $model" >&2; done
wait $pid
