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
        'SELECT * FROM Log WHERE user_id = ? AND last_logged >= NOW() - INTERVAL 48 HOUR ORDER BY last_logged DESC',
        [data.user_id], callback
    );
};

// ── check if logged today ────────────────────────────────────────────────────

module.exports.selectTodayLog = (data, callback) => {
    pool.query(
        'SELECT * FROM Log WHERE user_id = ? AND song_id = ? AND mood = ? AND last_logged >= NOW() - INTERVAL 24 HOUR LIMIT 1',
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
        'UPDATE Log SET play_count = play_count + 1, last_logged = CURRENT_TIMESTAMP WHERE user_id = ? AND song_id = ? AND mood = ? AND last_logged >= NOW() - INTERVAL 24 HOUR',
        [data.user_id, data.song_id, data.mood], callback
    );
};

// ── update note ──────────────────────────────────────────────────────────────

module.exports.updateNote = (data, callback) => {
    pool.query(
        'UPDATE Log SET note = ? WHERE id = ? AND user_id = ?',
        [data.note, data.id, data.user_id], callback
    );
};

// updates the most recent row for a song+mood — used by playlists
module.exports.updateNoteLatest = (data, callback) => {
    pool.query(
        'UPDATE Log SET note = ? WHERE user_id = ? AND song_id = ? AND mood = ? ORDER BY last_logged DESC LIMIT 1',
        [data.note, data.user_id, data.song_id, data.mood], callback
    );
};

// ── delete ───────────────────────────────────────────────────────────────────

module.exports.deleteLog = (data, callback) => {
    pool.query(
        'DELETE FROM Log WHERE id = ? AND user_id = ?',
        [data.id, data.user_id], callback
    );
};
// ── stats queries ────────────────────────────────────────────────────────────
module.exports.getStats = (data, callback) => {
    pool.query(`
        SELECT
            COUNT(*) as total_logs,
            SUM(play_count) as total_plays,
            COUNT(DISTINCT song_id) as unique_songs,
            COUNT(DISTINCT DATE(last_logged)) as days_active,
            COUNT(DISTINCT mood) as moods_used
        FROM Log WHERE user_id = ?
    `, [data.user_id], callback);
};

module.exports.getMoodBreakdown = (data, callback) => {
    pool.query(`
        SELECT mood, SUM(play_count) as total_plays, COUNT(*) as song_count
        FROM Log WHERE user_id = ?
        GROUP BY mood ORDER BY total_plays DESC
    `, [data.user_id], callback);
};

module.exports.getTopSongs = (data, callback) => {
    pool.query(`
        SELECT title, artist, album_art, spotify_url, SUM(play_count) as total_plays, mood
        FROM Log WHERE user_id = ?
        GROUP BY song_id, title, artist, album_art, spotify_url, mood
        ORDER BY total_plays DESC LIMIT 5
    `, [data.user_id], callback);
};

module.exports.getTimeOfDay = (data, callback) => {
    pool.query(`
        SELECT
            SUM(CASE WHEN HOUR(last_logged) BETWEEN 5 AND 11 THEN play_count ELSE 0 END) as morning,
            SUM(CASE WHEN HOUR(last_logged) BETWEEN 12 AND 17 THEN play_count ELSE 0 END) as afternoon,
            SUM(CASE WHEN HOUR(last_logged) BETWEEN 18 AND 21 THEN play_count ELSE 0 END) as evening,
            SUM(CASE WHEN HOUR(last_logged) >= 22 OR HOUR(last_logged) < 5 THEN play_count ELSE 0 END) as late_night
        FROM Log WHERE user_id = ?
    `, [data.user_id], callback);
};

module.exports.getFlashback = (data, callback) => {
    pool.query(`
        SELECT title, artist, album_art, spotify_url, mood, SUM(play_count) as total_plays,
               MIN(last_logged) as played_at
        FROM Log
        WHERE user_id = ?
          AND last_logged BETWEEN DATE_SUB(NOW(), INTERVAL 37 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY song_id, title, artist, album_art, spotify_url, mood
        ORDER BY total_plays DESC LIMIT 5
    `, [data.user_id], callback);
};