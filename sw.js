// Minimal service worker — required for PWA installability.
// This does not cache content offline. It simply allows the browser
// to recognize the app as installable on the home screen.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through — no offline caching for now.
  // This app requires a live connection to Google Sheets to function.
});
