'use strict';
// Aurora Bande — service worker. Serve a due cose: far installare l'app (Chrome) e mostrare l'ultima versione anche senza rete.
// Strategia: rete prima, cache come ripiego. Così un aggiornamento pubblicato arriva subito, e senza rete resta il guscio dell'app.
// Non mette mai in cache i dati: meteo, NOAA, magnetometri, webcam e tutto ciò che non è di questo sito passano sempre dalla rete.
// Quando si aggiunge o si toglie un file dell'app, aggiorna SHELL e cambia VERSION.
const VERSION = 'aurora-bande-2026-09-28-4';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/tokens.css', 'css/app.css',
  'js/core.js', 'js/l1.js', 'js/ground.js', 'js/sky.js', 'js/noaa.js', 'js/alerts.js', 'js/field.js', 'js/minicharts.js', 'js/hypo.js', 'js/credits.js', 'js/ui.js', 'js/main.js', 'js/pwa.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                                            // dati e immagini di altri siti: sempre rete
  if (/\/(data|_aurora|versione-precedente)\//.test(url.pathname)) return;                    // magnetometri, server locale, pagine precedenti: sempre rete
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
