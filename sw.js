'use strict';

/* =========================================================
 * PWA Ultimate Template - sw.js
 * オフライン対応: アプリシェルをキャッシュし、ネット無しでも起動。
 * app.config.js の APP_CONFIG.version を上げたら CACHE_VERSION も必ず上げること。
 * ========================================================= */

const CACHE_VERSION = 'v1.2.0';
const CACHE_NAME = `pwa-ultimate-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './ui-components.css',
  './page-layouts.css',
  './utils.js',
  './ui-components.js',
  './core.js',
  './app.views.js',
  './app.actions.js',
  './app.config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

/* 同一オリジンのGETのみ: キャッシュ優先＋裏でネットワーク更新（stale-while-revalidate） */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  /* 画面遷移（アドレス直叩き・リロード）は index.html を返す */
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
