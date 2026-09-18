// make-test-module-dom.js
//
// setupModule() (index.html) expects specific element ids to already exist:
// `${prefix}_list`, `${prefix}Form`, and a submit button with class
// "submit" inside the form. The real page has these for Timeline/Kontak/
// Klien/etc, but reusing those would mean two competing setupModule()
// instances fight over the same DOM nodes (the real one boots automatically
// when app-inline.js loads). Instead we inject a brand-new, uniquely
// prefixed set of nodes -- same shape a real module's HTML takes -- so
// setupModule() runs exactly as it does in production, just scoped to a
// throwaway storage key.

function makeTestModuleDom(win, prefix) {
  const doc = win.document;
  const list = doc.createElement("div");
  list.id = `${prefix}_list`;
  doc.body.appendChild(list);

  const form = doc.createElement("form");
  form.id = `${prefix}Form`;
  const submitBtn = doc.createElement("button");
  submitBtn.className = "submit";
  submitBtn.type = "submit";
  form.appendChild(submitBtn);
  doc.body.appendChild(form);

  const status = doc.createElement("div");
  status.id = `${prefix}_status_msg`;
  doc.body.appendChild(status);

  return { list, form, status, submitBtn };
}

module.exports = { makeTestModuleDom };
