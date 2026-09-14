#!/usr/bin/env bash
# release-check.sh
#
# Run this ONE command before zipping any "FINAL" release. It runs every
# check that has previously been claimed as "passed" in release docs
# without actually being run -- so those claims are true by construction
# instead of by hope.
#
# Usage:
#   ./release-check.sh
#
# Exits non-zero (and prints exactly what failed) if anything is wrong.
# Do not zip a release while this is failing.

set -euo pipefail
cd "$(dirname "$0")"

fail=0
step() { echo; echo "== $1 =="; }

step "1. Syntax-check every non-legacy JS file"
if ! find . -name "*.js" \
    -not -path "*/node_modules/*" \
    -not -path "*/tests_reimpl_legacy/*" \
    -print0 | xargs -0 -n1 node --check; then
  echo "FAILED: JS syntax check"; fail=1
fi

step "2. Install tests_real dependencies"
( cd tests_real && npm install --no-audit --no-fund >/dev/null )

step "3. Static release assertions (incl. real inline JS syntax check)"
if ! ( cd tests_real && node test_release_static.js ); then
  echo "FAILED: test_release_static.js"; fail=1
fi

step "4. Auth gate runtime test"
if ! ( cd tests_real && node test_auth.js ); then
  echo "FAILED: test_auth.js"; fail=1
fi

step "5. Reliability runtime test"
if ! ( cd tests_real && node test_reliability.js ); then
  echo "FAILED: test_reliability.js"; fail=1
fi

step "6. OPEX engine runtime test"
if ! ( cd tests_real && node test_opex.js ); then
  echo "FAILED: test_opex.js"; fail=1
fi

step "7. Acquisition functions: production vs standalone copy must match"
if [ -d features/acquisition_os/netlify/functions ]; then
  if ! diff -rq netlify/functions features/acquisition_os/netlify/functions; then
    echo "FAILED: the two Acquisition Netlify function folders have diverged."
    echo "        Re-sync them (copy netlify/functions/* over the standalone"
    echo "        copy) before releasing -- this is exactly how a CORS/SSRF"
    echo "        fix silently failed to reach one of the two copies before."
    fail=1
  fi
fi

step "8. No stray build artifacts (__pycache__ / .pyc / node_modules)"
if find . -iname "__pycache__" -o -iname "*.pyc" | grep -q .; then
  echo "FAILED: found __pycache__/.pyc files -- clean before releasing:"
  find . -iname "__pycache__" -o -iname "*.pyc"
  fail=1
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "❌ release-check FAILED -- do not zip this as a release."
  exit 1
fi
echo "✅ all release checks passed."
