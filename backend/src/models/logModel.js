const pool = require('../services/db');

// ── grouped: one row per unique song+mood, total plays summed ───────────────
// used by: journal recently played, playlists, discover, session recs

module.exports.selectAllByUser = (data, callback) => {
    pool.query(
        'SELECT song_id, user_id, title, artist, album_art, spotify_url, mood,' +
        ' SUM(play_count) as play_count, MAX(last_logged) as last_logged,' +
        ' MIN(id) as id, MAX(note) as note' +
        ' FROM Log WHERE user_id = ?' +
        ' GROUP BY song_id, user_id, title, artist, album_art, spotify_url, mood' +
        ' ORDER BY MAX(last_logged) DESC',
        [data.user_id], callback
    );
};

module.exports.selectByMood = (data, callback) => {
    pool.query(
        'SELECT song_id, user_id, title, artist, album_art, spotify_url, mood,' +
        ' SUM(play_count) as play_count, MAX(last_logged) as last_logged,' +
        ' MIN(id) as id, MAX(note) as note' +
        ' FROM Log WHERE user_id = ? AND mood = ?' +
        ' GROUP BY song_id, user_id, title, artist, album_art, spotify_url, mood' +
        ' ORDER BY SUM(play_count) DESC',
        [data.user_id, data.mood], callback
    );
};

// ── per day: all raw rows ────────────────────────────────────────────────────
// used by: history timeline, song search

module.exports.selectAllByUserPerDay = (data, callback) => {
    pool.query(
        'SELECT * FROM Log WHERE user_id = ? ORDER BY last_logged DESC',
        [data.user_id], callback
    );
};

// ── today and yesterday only — for journal recently played ───────────────────
module.exports.selectRecentTwoDays = (data, callback) => {
    pool.query(
        'SELECT * FROM Log WHERE user_id = ? AND DATE(last_logged) >= DATE(NOW()) - INTERVAL 1 DAY ORDER BY last_logged DESC',
        [data.user_id], callback
    );
};

// ── check if logged today ────────────────────────────────────────────────────

module.exports.selectTodayLog = (data, callback) => {
    pool.query(
        'SELECT * FROM Log WHERE user_id = ? AND song_id = ? AND mood = ? AND DATE(last_logged) = CURDATE() LIMIT 1',
        [data.user_id, data.song_id, data.mood], callback
    );
};

// ── insert ───────────────────────────────────────────────────────────────────

module.exports.insertLog = (data, callback) => {
    pool.query(
        'INSERT INTO Log (user_id, song_id, title, artist, album_art, spotify_url, mood, play_count, note) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
        [data.user_id, data.song_id, data.title, data.artist, data.album_art, data.spotify_url, data.mood, data.note || ''],
        callback
    );
};

// ── increment today's count ──────────────────────────────────────────────────

module.exports.incrementPlayCount = (data, callback) => {
    pool.query(
        'UPDATE Log SET play_count = play_count + 1, last_logged = CURRENT_TIMESTAMP WHERE user_id = ? AND song_id = ? AND mood = ? AND DATE(last_logged) = CURDATE()',
        [data.user_id, data.song_id, data.mood], callback
    );
};

// ── update note ──────────────────────────────────────────────────────────────

module.exports.updateNote = (data, callback) => {
    pool.query(
        'UPDATE Log SET note = ? WHERE user_id = ? AND song_id = ? AND mood = ?',
        [data.note, data.user_id, data.song_id, data.mood], callback
    );
};

// ── delete ───────────────────────────────────────────────────────────────────

module.exports.deleteLog = (data, callback) => {
    pool.query(
        'DELETE FROM Log WHERE user_id = ? AND song_id = ? AND mood = ?',
        [data.user_id, data.song_id, data.mood], callback
    );
};