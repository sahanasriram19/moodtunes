// config.js
// ============================================
// No API keys or secrets are needed in the frontend any more.
// Spotify search now goes through the backend (/api/spotify/search-tracks),
// so SPOTIFY_CLIENT_SECRET only lives in backend/.env.
// ============================================
const CONFIG = {};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}