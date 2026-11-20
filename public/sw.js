/* Kabanata XXI Bingo: small offline cache. API calls are never cached. */
const V = "kxxi-v2";
const SHELL = ["/", "/logo-512.png", "/site.webmanifest", "/favicon-32x32.png", "/apple-touch-icon.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  if (u.origin === location.origin && u.pathname.startsWith("/api/")) return; // live data: always the network
  // the page itself: network first (so updates arrive), cached copy when the signal is bad
  if (r.mode === "navigate" || (u.origin === location.origin && (u.pathname === "/" || u.pathname === "/index.html"))) {
    e.respondWith(timeout(fetch(r), 6000).then((res) => { const c = res.clone(); caches.open(V).then((ch) => ch.put("/", c)); return res; })
      .catch(() => caches.match("/").then((m) => m || Response.error())));
    return;
  }
  // images, icons, fonts: cache first, refresh in the background
  if (u.origin === location.origin || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(r).then((m) => {
      const net = fetch(r).then((res) => { if (res && (res.ok || res.type === "opaque")) { const c = res.clone(); caches.open(V).then((ch) => ch.put(r, c)); } return res; }).catch(() => m);
      return m || net;
    }));
  }
});
