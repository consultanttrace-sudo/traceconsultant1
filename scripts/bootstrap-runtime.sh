#!/usr/bin/env bash
set -euo pipefail
REQUIRED="22.22.2"
if command -v volta >/dev/null 2>&1; then
  exec volta run --node "$REQUIRED" --npm 10.9.2 -- npm "$@"
fi
if command -v mise >/dev/null 2>&1; then
  exec mise exec -- npm "$@"
fi
if command -v nvm >/dev/null 2>&1; then
  nvm install "$REQUIRED"
  nvm use "$REQUIRED"
  exec npm "$@"
fi
if [ "${NODE_VERSION:-}" != "$REQUIRED" ]; then
  echo "TRACE runtime requires Node $REQUIRED. Install/use Volta, mise, or nvm; CI and Netlify already pin it automatically." >&2
  exit 2
fi
exec npm "$@"
