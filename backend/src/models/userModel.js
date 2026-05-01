const pool = require('../services/db');

module.exports.checkUsernameOrEmailExist = (data, callback) => {
    pool.query(
        'SELECT id FROM User WHERE username = ? OR email = ?',
        [data.username, data.email],
        callback
    );
};

module.exports.insertUser = (data, callback) => {
    pool.query(
        'INSERT INTO User (username, email, password) VALUES (?, ?, ?)',
        [data.username, data.email, data.password],
        callback
    );
};

module.exports.selectByUsername = (data, callback) => {
    pool.query(
        'SELECT * FROM User WHERE username = ? LIMIT 1',
        [data.username],
        callback
    );
};

module.exports.selectById = (data, callback) => {
    pool.query(
        'SELECT id, username, email, created_at FROM User WHERE id = ?',
        [data.user_id],
        callback
    );
};

module.exports.saveSpotifyTokens = (data, callback) => {
    pool.query(
        'UPDATE User SET spotify_access_token = ?, spotify_refresh_token = ? WHERE id = ?',
        [data.spotify_access_token, data.spotify_refresh_token, data.user_id],
        callback
    );
};

module.exports.getSpotifyTokens = (data, callback) => {
    pool.query(
        'SELECT spotify_access_token, spotify_refresh_token FROM User WHERE id = ?',
        [data.user_id],
        callback
    );
};

module.exports.saveSpotifyPlaylistId = (data, callback) => {
    pool.query(
        'INSERT INTO SpotifyPlaylist (user_id, mood, playlist_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE playlist_id = ?',
        [data.user_id, data.mood, data.playlist_id, data.playlist_id],
        callback
    );
};

module.exports.getSpotifyPlaylistId = (data, callback) => {
    pool.query(
        'SELECT playlist_id FROM SpotifyPlaylist WHERE user_id = ? AND mood = ?',
        [data.user_id, data.mood],
        callback
    );
};
