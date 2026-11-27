"use strict";

var CACHE_NAME = "kirajam-v4";
var ASSETS = [
  "./",
  "./index.html",
  "./logic.js",
  "./app.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) {
            return k !== CACHE_NAME;
          })
          .map(function (k) {
            return caches.delete(k);
          })
      );
    })
  );
  self.clients.claim();
});

// Network-first so iPhone Home Screen pulls updates immediately when online, with offline cache fallback.
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        });
        return res;
      })
      .catch(function () {
        return caches.match(event.request);
      })
  );
});
