// load-app.js
//
// Loads the ACTUAL index.html into a jsdom window/document and runs its
// real inline <script> content, so tests call the real window.loadData,
// window.saveData, window.setupModule, etc. -- not a hand-copied
// reimplementation (that was the flaw in the old test_*.js files, and the
// exact flaw that let a stale, unreferenced script_1.js ship in this
// package undetected).
//
// Deliberately reads index.html fresh on every loadApp() call, instead of
// keeping a separately-maintained copy of the script -- so these tests can
// never drift out of sync with the file that actually ships to users.
//
// Usage:
//   const { loadApp } = require("./load-app");
//   const { win } = loadApp({ supabase: makeSupaMock(...) });
//   await win.loadData("someKey");

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const vm = require("vm");

// index.html lives one directory up from tests_real/ in this package.
const INDEX_HTML_PATH = path.join(__dirname, "..", "index.html");

// index.html relies on browser semantics for unhandled promise rejections:
// a rejected promise with no local catch just logs to the console (caught
// by index.html's OWN `window.addEventListener("unhandledrejection")`
// safety net from Tahap 11B). Node, unlike a browser tab, terminates the
// whole process on an unhandled rejection by default. Several real modules
// (Timeline, Kontak, Klien, Akuntansi, dst) call loadData() at top-level
// script boot with no local try/catch BY DESIGN -- so a network failure
// simulated during boot makes those unrelated background loads reject too.
// That is expected app behavior, not a test bug; without this guard Node
// would crash before any assertion runs.
process.on("unhandledRejection", () => { /* mirrors browser tab behavior */ });

/**
 * @param {object} opts
 * @param {object|undefined} opts.supabase - a fake `window.supabase` with a
 *   `.createClient()` method matching the real @supabase/supabase-js
 *   surface used by index.html (see make-supa-mock.js). Omit/undefined to
 *   force local-storage-only mode.
 */
function loadApp(opts = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, "utf8");

  // Production contains the main app script plus a smaller Acquisition bridge.
  // Never assume there is exactly one non-empty inline script.
  const scriptMatches = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter(m => m[1].trim().length > 0);
  const appMatch = scriptMatches
    .filter(m => m[1].includes('function todayISO') && m[1].length > 100000)
    .sort((a,b) => b[1].length - a[1].length)[0];
  if (!appMatch) {
    throw new Error(`Could not locate production app inline script; found ${scriptMatches.length} non-empty blocks.`);
  }
  const code = appMatch[1];

  // Use the real page markup (full index.html, minus its own <script>
  // blocks) as the jsdom document. index.html makes several unguarded
  // document.getElementById("x").addEventListener(...) calls at top-level
  // load time, assuming those ids exist -- which they do in the real page.
  // A blank/synthetic shell would throw and abort the whole script before
  // any function is even defined.
  const shellHtml = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, "");
  const dom = new JSDOM(shellHtml, {
    url: "https://trace-os.test/",
    runScripts: "outside-only"
  });
  const win = dom.window;

  // window.supabase must exist BEFORE the script runs, because
  // detectStorageMode() checks `window.supabase` synchronously at module
  // load time (see index.html, "Storage engine" section).
  win.supabase = opts.supabase || undefined;

  vm.runInContext(code, dom.getInternalVMContext(), { filename: "index.html (inline script, live)" });

  return { dom, win };
}

module.exports = { loadApp };
