#!/usr/bin/env bash
# Runs at the start of every Claude Code session (hook in .claude/settings.json).
# Does something only in cloud sessions (claude.ai/code, the phone app):
# installs the npm packages so tests, lint and the type check work there.
# On your own computer it exits at once; there you run `npm install` yourself.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Skip the install when node_modules already matches package-lock.json,
# e.g. when a paused session is resumed.
stamp=node_modules/.package-lock.sha256
hash=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$hash" ]; then
  exit 0
fi

npm ci --no-audit --no-fund
echo "$hash" > "$stamp"
