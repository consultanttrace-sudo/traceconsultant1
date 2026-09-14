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
blocked=0
step() { echo; echo "== $1 =="; }

step "1. Syntax-check every non-legacy JS file"
if ! find . -name "*.js" \
    -not -path "*/node_modules/*" \
    -not -path "*/tests_reimpl_legacy/*" \
    -print0 | xargs -0 -n1 node --check; then
  echo "FAILED: JS syntax check"; fail=1
fi

step "2. Core TypeScript build + deterministic core tests"
tsc --noEmit -p tsconfig.json
rm -rf dist/core
 tsc -p tsconfig.json
for test in tests_core/*.mjs; do
  node "$test"
done

step "3. Diagnostic manifest must be clean"
node scripts/build-diagnostic-manifest.mjs
node tests_core/test_platform_static.mjs
node tests_core/test_business_health_platform.mjs
node -e "const m=require('./netlify/functions/_diagnostic-manifest.json'); if(m.staticChecks.length){console.error(JSON.stringify(m.staticChecks,null,2)); process.exit(1)}"

step "4. Environment verification (no implicit network install)"
if [ ! -f package-lock.json ]; then
  echo "BLOCKED: root package-lock.json is missing; release dependency graph is not reproducible."
  blocked=1
elif ! grep -q '"node_modules/' package-lock.json; then
  echo "BLOCKED: root package-lock.json is only a scaffold; transitive dependency graph has not been resolved by npm yet."
  blocked=1
fi
if grep -Eq '"(dependencies|devDependencies)"[[:space:]]*:' package.json && grep -Eq '"[^"\n]+"[[:space:]]*:[[:space:]]*"latest"' package.json; then
  echo "BLOCKED: package.json still contains floating latest dependencies; release versions must be pinned."
  blocked=1
fi
if [ ! -d node_modules ] || [ ! -x node_modules/.bin/vite ]; then
  echo "BLOCKED: React/Vite dependencies are not installed in the root workspace."
  echo "        This check intentionally does not run npm install automatically."
  echo "        Reproduce in a network-enabled environment with a committed lockfile and npm ci."
  blocked=1
fi
if [ ! -d tests_real/node_modules/jsdom ]; then
  echo "BLOCKED: tests_real/jsdom is not installed; browser runtime tests cannot execute."
  blocked=1
fi
if node -e "const [major,minor,patch]=process.versions.node.split('.').map(Number); process.exit(major===22 && (minor>22 || (minor===22 && patch>=2)) ? 0 : 1)"; then
  :
else
  echo "BLOCKED: Node runtime is below the pinned release runtime of Node 22.22.2."
  blocked=1
fi

step "5. Static release assertions (incl. real inline JS syntax check)"
if ! ( cd tests_real && node test_release_static.js ); then
  echo "FAILED: test_release_static.js"; fail=1
fi

if [ "$blocked" -eq 0 ]; then
step "6. Auth gate runtime test"
if ! ( cd tests_real && node test_auth.js ); then
  echo "FAILED: test_auth.js"; fail=1
fi

step "7. Reliability runtime test"
if ! ( cd tests_real && node test_reliability.js ); then
  echo "FAILED: test_reliability.js"; fail=1
fi

step "8. OPEX engine runtime test"
if ! ( cd tests_real && node test_opex.js ); then
  echo "FAILED: test_opex.js"; fail=1
fi
else
  echo "SKIPPED: runtime browser tests because environment is blocked."
fi

step "9. Acquisition function parity for overlapping legacy files"
if [ -d features/acquisition_os/netlify/functions ]; then
  for f in _auth.js acq-google-places.js acq-overpass.js; do
    if [ -f "features/acquisition_os/netlify/functions/$f" ]; then
      if ! cmp -s "netlify/functions/$f" "features/acquisition_os/netlify/functions/$f"; then
        echo "FAILED: divergent Acquisition function: $f"
        echo "        The canonical production function and legacy standalone copy must match."
        fail=1
      fi
    fi
  done
fi

step "10. No stray build artifacts (__pycache__ / .pyc / node_modules)"
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
if [ "$blocked" -ne 0 ]; then
  echo "⚠️ release-check BLOCKED -- environment verification is incomplete; this is not a PASS."
  exit 2
fi
echo "✅ all release checks passed."
