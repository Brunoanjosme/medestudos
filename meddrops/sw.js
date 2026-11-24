/* MedDrops — service worker. Shell em cache; dados: rede primeiro, cache como reserva. Áudios ficam no IndexedDB. */
const CACHE = 'meddrops-v3';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './dados/manifesto.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/audios/')) return; // áudio: tratado pelo app (blob no IndexedDB)
  const isData = u.pathname.includes('/dados/');
  if (isData) { // rede primeiro (conteúdo novo), cache se offline
    e.respondWith(fetch(r, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || new Response('[]', { status: 503, headers: { 'Content-Type': 'application/json' } }))));
    return;
  }
  // shell: cache primeiro + atualização em segundo plano
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => {
    const net = fetch(r).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); }
      return res;
    }).catch(() => hit || (r.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    return hit || net;
  }));
});
