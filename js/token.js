// ============================================
// token.js
// Handles fetching the Spotify access token.
// This runs once when the page loads and stores
// the token so app.js can use it for searches.
// ============================================

var spotifyToken = null; // stored here, accessible by app.js too

async function getSpotifyToken() {
  // encode credentials to base64 — required by Spotify
  var credentials = btoa(CONFIG.SPOTIFY_CLIENT_ID + ':' + CONFIG.SPOTIFY_CLIENT_SECRET);

  // request a token from Spotify
  var response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + credentials,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  // convert to usable data and save the token
  var data = await response.json();
  console.log('spotify response:', data);
  spotifyToken = data.access_token;
}