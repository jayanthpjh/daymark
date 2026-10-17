#!/usr/bin/env bash
set -euo pipefail
# First run: create a passphrase-less gpg key and a pass store so Bridge can keep its vault without a desktop keyring.
if [ ! -d "$HOME/.password-store" ]; then
  gpg --batch --passphrase '' --quick-gen-key 'Daymark Bridge <bridge@localhost>' default default never
  pass init 'Daymark Bridge <bridge@localhost>'
fi
case "${1:-run}" in
  init)  # One-time interactive login: docker compose run --rm proton-bridge init, then `login` and `info` at the prompt.
    exec bridge --cli ;;
  run)
    socat TCP-LISTEN:2143,fork,reuseaddr TCP:127.0.0.1:1143 &
    socat TCP-LISTEN:2025,fork,reuseaddr TCP:127.0.0.1:1025 &
    exec bridge --noninteractive ;;
  *) exec "$@" ;;
esac
