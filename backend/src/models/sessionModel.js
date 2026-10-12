const pool = require('../services/db');

module.exports.insertSession = (data, callback) => {
    pool.query(
        "INSERT INTO Session (user_id, mood, status) VALUES (?, ?, 'active')",
        [data.user_id, data.mood],
        callback
    );
};

module.exports.selectActiveSession = (data, callback) => {
    pool.query(
        "SELECT * FROM Session WHERE user_id = ? AND status = 'active' ORDER BY start_time DESC LIMIT 1",
        [data.user_id],
        callback
    );
};

module.exports.endSession = (data, callback) => {
    pool.query(
        "UPDATE Session SET status = 'ended', end_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        [data.session_id, data.user_id],
        callback
    );
};

module.exports.selectAllByUser = (data, callback) => {
    pool.query(
        'SELECT * FROM Session WHERE user_id = ? ORDER BY start_time DESC',
        [data.user_id],
        callback
    );
};

// only into one of your own sessions (affectedRows is 0 otherwise)
module.exports.insertSessionLog = (data, callback) => {
    pool.query(
        'INSERT INTO SessionLog (session_id, song_id, title, artist, album_art, spotify_url)' +
        ' SELECT id, ?, ?, ?, ?, ? FROM Session WHERE id = ? AND user_id = ?',
        [data.song_id, data.title, data.artist, data.album_art, data.spotify_url, data.session_id, data.user_id],
        callback
    );
};

// a session's songs — only your own sessions (endSession checks ownership itself)
module.exports.selectSessionLogs = (data, callback) => {
    pool.query(
        'SELECT sl.* FROM SessionLog sl JOIN Session s ON s.id = sl.session_id' +
        ' WHERE sl.session_id = ? AND s.user_id = ? ORDER BY sl.played_at ASC, sl.id ASC',
        [data.session_id, data.user_id],
        callback
    );
};

module.exports.deleteSession = (data, callback) => {
    pool.query(
        'DELETE FROM SessionLog WHERE session_id = ?; DELETE FROM Session WHERE id = ? AND user_id = ?',
        [data.session_id, data.session_id, data.user_id],
        callback
    );
};

module.exports.deleteSongFromSession = (data, callback) => {
    pool.query(
        'DELETE sl FROM SessionLog sl JOIN Session s ON s.id = sl.session_id WHERE sl.session_id = ? AND sl.id = ? AND s.user_id = ?',
        [data.session_id, data.song_id, data.user_id],
        callback
    );
};