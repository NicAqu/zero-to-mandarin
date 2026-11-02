const CORE = 'ztm-core-v1', WALK = 'ztm-walk', FONTS = 'ztm-fonts';
const pad = n => String(n).padStart(2, '0');
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'vendor/hanzi-writer.min.js', 'strokes.json', 'audio/extra.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
for (let l = 1; l <= 20; l++) FILES.push('audio/L' + pad(l) + '.json');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ztm-core') && k !== CORE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function mp3(req) {
  const url = new URL(req.url); const key = url.pathname.slice(url.pathname.indexOf('walk/'));
  const cache = await caches.open(WALK);
  let res = await cache.match(key);
  if (!res) {
    const net = await fetch(url.href, { cache: 'no-store' });
    if (!net.ok) return net;
    await cache.put(key, net.clone());
    res = net;
  }
  const buf = await res.arrayBuffer();
  const range = req.headers.get('range');
  const base = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' };
  if (!range) return new Response(buf, { status: 200, headers: { ...base, 'Content-Length': String(buf.byteLength) } });
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = buf.byteLength - +m[2]; end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + buf.byteLength } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`, 'Content-Length': String(end - start + 1) } });
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('.mp3')) { e.respondWith(mp3(req).catch(() => new Response(null, { status: 504 }))); return; }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CORE).then(c => c.put('index.html', copy)); } return r; })
      .catch(() => caches.match('index.html', { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
