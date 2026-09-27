// Runs after `vite build`. dist/react already contains the new React app's
// index.html + bundled assets. This step copies everything else the site
// still needs at the same root-relative paths it used before the publish
// target changed from "." to "dist/react", so nothing that already worked
// (PWA install, icons, the acquisition_os sub-app, well-known verification
// file) silently breaks.
import { cpSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist', 'react');

function copyFile(name) {
  const src = join(ROOT, name);
  const dest = join(OUT, name);
  // v73 fix: the original version below assumed dirname(dest) already
  // exists, true for every OLD caller here (they all copy flat files
  // straight into OUT, which the check below already requires to exist)
  // but not for the new nested features/acquisition_os/index.html call --
  // caught by actually running this script against a fresh dist/react,
  // not by reading the code.
  if (existsSync(src)) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

function copyDir(name, destName = name) {
  const src = join(ROOT, name);
  const dest = join(OUT, destName);
  if (existsSync(src)) cpSync(src, dest, { recursive: true });
}

if (!existsSync(OUT)) {
  throw new Error(`copy-static-for-publish: ${OUT} does not exist — run "vite build" first.`);
}

// PWA + branding assets referenced by manifest.json / sw.js with relative paths.
['manifest.json', 'icon-192.png', 'icon-512.png', 'logo.png', 'sw.js'].forEach(copyFile);

// well-known/assetlinks.json was served from a folder literally named
// "well-known" (missing the leading dot), which is not the path Android/iOS
// verification actually requests. Publish it at BOTH paths: the historical
// one (in case anything already links to it) and the correct standard one.
copyDir('well-known', 'well-known');
copyDir('well-known', '.well-known');

// The acquisition_os feature folder holds its own dev tooling (docs,
// schema.sql, netlify function *source*, tests_real/, a python dev
// server, .command launchers) alongside one file the deployed site
// actually needs: index.html, embedded by the LEGACY classic app
// (index.html -> legacy-classic.html below, via
// ./features/acquisition_os/index.html?embedded=1). The NEW React app's
// own AcquisitionView.tsx embeds a different, canonical copy instead
// (react-app/public/acquisition/index.html, copied automatically by Vite
// via its public dir -- not by this script).
//
// audit v73 finding #4 (2026-09-26): this used to unconditionally copy
// the entire features/ directory (every subfolder, wholesale, no filter).
// That shipped three things nothing needed in production: (1) a second,
// stale copy of the Acquisition tool at
// features/acquisition_os/trace-acquisition-os.html (confirmed by
// checksum to differ from every other copy, and confirmed by grep to be
// referenced by nothing -- not even the legacy classic app, which only
// points at this folder's index.html); (2) every internal audit .md,
// schema.sql, and netlify function *source* file in that folder,
// world-readable off the live site for anyone who found the path; (3) a
// separate root-level orphan, trace-acquisition-os.html, confirmed by
// grep to be referenced by nothing anywhere in this repo either --
// removed below instead of copied.
copyFile(join('features', 'acquisition_os', 'index.html'));
// trace-acquisition-os.html (root) intentionally NOT copied -- see above.
// features/acquisition_os itself is left exactly where it is in the repo
// (source/history), just no longer shipped to dist/ wholesale.

// Legacy single-file app, kept reachable as a manual fallback/reference at
// /legacy-classic.html (NOT the site root — the React app owns "/").
// (unchanged by finding #4 -- restored here after an in-progress edit of
// this file briefly dropped it; caught by re-running the script and
// diffing dist/react's contents, not by re-reading the diff.)
if (existsSync(join(ROOT, 'index.html'))) {
  mkdirSync(OUT, { recursive: true });
  copyFileSync(join(ROOT, 'index.html'), join(OUT, 'legacy-classic.html'));
}

console.log('copy-static-for-publish: done.');
