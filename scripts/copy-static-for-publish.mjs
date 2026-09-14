// Runs after `vite build`. dist/react already contains the new React app's
// index.html + bundled assets. This step copies everything else the site
// still needs at the same root-relative paths it used before the publish
// target changed from "." to "dist/react", so nothing that already worked
// (PWA install, icons, the acquisition_os sub-app, well-known verification
// file) silently breaks.
import { cpSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist', 'react');

function copyFile(name) {
  const src = join(ROOT, name);
  const dest = join(OUT, name);
  if (existsSync(src)) copyFileSync(src, dest);
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

// The acquisition_os feature is its own static sub-app (own index.html +
// assets) served at /features/acquisition_os/... — keep it reachable as-is.
copyDir('features', 'features');

// Legacy single-file app, kept reachable as a manual fallback/reference at
// /legacy-classic.html (NOT the site root — the React app owns "/").
if (existsSync(join(ROOT, 'index.html'))) {
  mkdirSync(OUT, { recursive: true });
  copyFileSync(join(ROOT, 'index.html'), join(OUT, 'legacy-classic.html'));
}
copyFile('trace-acquisition-os.html');

console.log('copy-static-for-publish: done.');
