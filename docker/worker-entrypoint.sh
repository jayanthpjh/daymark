#!/usr/bin/env bash
set -euo pipefail

export DISPLAY=:99
if [ -f /tmp/.X99-lock ]; then
  display_pid="$(cat /tmp/.X99-lock 2>/dev/null || true)"
  if ! [[ "$display_pid" =~ ^[0-9]+$ ]] || ! kill -0 "$display_pid" 2>/dev/null; then
    rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
  fi
fi
Xvfb "$DISPLAY" -screen 0 1280x900x24 -nolisten tcp -ac >/tmp/daymark-xvfb.log 2>&1 &
(
  for attempt in $(seq 1 40); do
    if x11vnc -display "$DISPLAY" -forever -shared -nopw -listen 127.0.0.1 -rfbport 5900 >/tmp/daymark-vnc-attempt.log 2>&1; then
      exit 0
    fi
    sleep 0.25
  done
  cat /tmp/daymark-vnc-attempt.log >&2
) >/tmp/daymark-vnc.log 2>&1 &
websockify --web=/usr/share/novnc 0.0.0.0:6080 127.0.0.1:5900 >/tmp/daymark-websockify.log 2>&1 &

for attempt in $(seq 1 40); do
  if curl --silent --fail http://127.0.0.1:6080/vnc.html >/dev/null; then break; fi
  sleep 0.25
done

exec node server.mjs
