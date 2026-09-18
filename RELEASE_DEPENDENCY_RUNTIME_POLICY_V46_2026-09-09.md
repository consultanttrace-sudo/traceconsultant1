# TRACE v46 — Dependency & Runtime Policy

## Root cause addressed
- `latest` dependencies made builds non-reproducible and could silently change APIs between deployments.
- Node was pinned in project metadata but the local execution environment could still be older.

## Controls
- All root dependencies are exact semantic versions.
- `.nvmrc` and `.node-version` pin Node 22.22.2.
- `netlify.toml` pins Netlify build/preview/branch runtime to Node 22.22.2.
- `verify:runtime` fails closed when the runtime is below the supported floor. It does not pretend it can upgrade the host process.
- `verify:dependencies` rejects floating dependency ranges.

## Important lockfile truth
A root `package-lock.json` scaffold is included, but it is intentionally NOT called a complete reproducible lock graph until npm has resolved all transitive packages in an online dependency-capable environment. The release gate must continue to block `npm ci` until that graph is generated and validated. We do not fabricate integrity hashes.
