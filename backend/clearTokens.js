require('dotenv').config();
const pool = require('./src/services/db');

pool.query('UPDATE User SET spotify_access_token = NULL, spotify_refresh_token = NULL', function(err, results) {
    if (err) {
        console.error('Error clearing tokens:', err);
    } else {
        console.log('Cleared Spotify tokens for', results.affectedRows, 'user(s)');
        console.log('Now log out of moodtunes, go to https://www.spotify.com/account/apps and remove moodtunes access, then log back in.');
    }
    process.exit();
});