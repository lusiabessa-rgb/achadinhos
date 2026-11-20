// Guarda o app no celular para abrir sem internet. O montar.js troca b291274e05 a cada mudança.
const CACHE = "helena-b291274e05";
const ARQUIVOS = ["./", "index.html", "assinatura.js", "manifest.webmanifest", "icone-192.png", "icone-512.png", "icone-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS.map(a => new Request(a, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(nomes => Promise.all(nomes.filter(n => n.startsWith("helena-") && n !== CACHE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // Lista de assinantes: sempre a mais nova; sem internet, o app usa o que já conferiu.
  if (e.request.url.includes("assinantes.json")) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
