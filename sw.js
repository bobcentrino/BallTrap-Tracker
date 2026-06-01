/**
 * Ball-Trap Tracker — Service Worker V1.5
 * Cache-first pour les assets, network-first pour les données
 */

const CACHE_NAME = 'balltrap-v1.5.2';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/main.js',
    './js/saisie.js',
    './js/stats.js',
    './js/storage.js',
    './js/params.js',
    './js/meteo.js',
    './js/stands.js',
    './js/ratelier.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png',
    './bpdev-logo.svg'
];

// Installation — mettre en cache les assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activation — nettoyer les anciens caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — cache-first pour les assets statiques
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((response) => {
                // Mettre en cache les nouvelles requêtes réussies
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        }).catch(() => {
            // Fallback hors ligne pour la page principale
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});
