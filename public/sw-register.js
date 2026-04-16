// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/assets/serviceWorker.js', {
      scope: '/',
    }).then((registration) => {
      console.log('Service Worker registered:', registration);
    }).catch((error) => {
      console.warn('Service Worker registration failed:', error);
    });
  });
}
