#!/usr/bin/env bash
# Serve the game, and keep it up to date with whatever Claude has pushed.
#
#   ./play.sh          serve on :8099 and pull every 60s
#   ./play.sh 9000 0   serve on :9000, never pull
#
# Pulling is what makes the "rewritten" button in the header appear on its own:
# this fetches the new code, the running page notices version.json changed, and
# offers you the reload. Nothing is applied to a session in progress until you
# press it. Note that this runs code Claude pushed without you reading it first.

set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8099}"
PULL_EVERY="${2:-60}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ "$PULL_EVERY" -gt 0 ]; then
  (
    while true; do
      sleep "$PULL_EVERY"
      before="$(git rev-parse HEAD)"
      # Only fast-forward. Local edits or a diverged branch stop the loop rather
      # than being clobbered mid-playthrough.
      if git pull --ff-only --quiet origin "$BRANCH" 2>/dev/null; then
        after="$(git rev-parse HEAD)"
        [ "$before" != "$after" ] && echo "↻ pulled $(git log --oneline -1)"
      fi
    done
  ) &
  PULLER=$!
  trap 'kill $PULLER 2>/dev/null || true' EXIT
  echo "auto-pulling $BRANCH every ${PULL_EVERY}s"
fi

echo "playing at http://localhost:$PORT"
exec python3 -m http.server "$PORT"
