const CACHE_NAME = "trace-os-v18";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Jangan pernah campur tangan request ke domain lain (Supabase, Overpass,
  // Google Places, dsb). Biarkan browser menanganinya langsung seperti biasa
  // tanpa lewat cache/service worker sama sekali.
  if (url.origin !== self.location.origin) return;

  if (event.request.url.includes("supabase.co")) return;

  // HTML/JS app shell must prefer the network so a deployment cannot silently
  // keep an older report generator in the browser cache.
  if (event.request.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/sw.js")) {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
