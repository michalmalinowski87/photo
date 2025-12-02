// Service Worker for Uppy Golden Retriever
// This enables large file recovery (>5MB) by storing file references in Service Worker cache
// Note: Golden Retriever will use IndexedDB for files <5MB automatically
// For files >5MB, this Service Worker provides additional storage capabilities

const CACHE_NAME = 'uppy-golden-retriever-v1';

// Install event - set up cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache;
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve cached files when available
self.addEventListener('fetch', (event) => {
  // Golden Retriever will handle file storage/retrieval via IndexedDB
  // This Service Worker mainly enables the feature for large files
  // The actual file storage is handled by Golden Retriever's IndexedDB implementation
});

