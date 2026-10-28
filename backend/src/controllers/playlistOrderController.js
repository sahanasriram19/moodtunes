const pool = require('../services/db');

// ── playlist song order (synced across devices) ────────────────────────────
// when you drag songs around in a playlist, the order is saved here per user and
// mood, so every device shows the same arrangement. the table is created
// automatically on startup, so no manual migration is needed.
pool.query(
    `CREATE TABLE IF NOT EXISTS PlaylistOrder (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        mood       VARCHAR(50) NOT NULL,
        song_ids   TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES User(id),
        UNIQUE KEY unique_user_playlist_order (user_id, mood)
    )`,
    (err) => { if (err) console.error('PlaylistOrder table setup failed:', err.message); }
);

// GET /api/playlists/order  ->  { "hype": ["songId1", "songId2", ...], "chill": [...] }
module.exports.getOrders = (req, res) => {
    pool.query('SELECT mood, song_ids FROM PlaylistOrder WHERE user_id = ?',
        [res.locals.userId], (err, results) => {
            if (err) return res.status(500).json({ message: 'Internal server error' });
            const orders = {};
            results.forEach((r) => {
                try { orders[r.mood] = JSON.parse(r.song_ids); } catch (e) { /* skip a bad row */ }
            });
            res.status(200).json(orders);
        });
};

// PUT /api/playlists/order/:mood   body: { "song_ids": ["songId1", "songId2", ...] }
module.exports.saveOrder = (req, res) => {
    const mood = (req.params.mood || '').toLowerCase().trim().substring(0, 50);
    const ids  = req.body.song_ids;
    if (!mood) return res.status(400).json({ message: 'mood required' });
    if (!Array.isArray(ids) || ids.length > 1000 ||
        !ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 255)) {
        return res.status(400).json({ message: 'song_ids must be a list of song ids' });
    }
    pool.query(
        'INSERT INTO PlaylistOrder (user_id, mood, song_ids) VALUES (?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE song_ids = VALUES(song_ids)',
        [res.locals.userId, mood, JSON.stringify(ids)],
        (err) => {
            if (err) return res.status(500).json({ message: 'Internal server error' });
            res.status(200).json({ mood: mood, song_ids: ids });
        });
};

// ── songs removed from a playlist ──────────────────────────────────────────
// ✕ on a song in a playlist takes it out of that playlist only. the song's logs
// stay, so it's still in your journal history and stats. logging the song again
// with the same mood puts it back. if every song is removed the playlist stays,
// with the mood's icon in all four squares of its cover.
const savedPlaylists = require('./spotifyPlaylistController');

pool.query(
    `CREATE TABLE IF NOT EXISTS PlaylistRemoved (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        mood       VARCHAR(50) NOT NULL,
        song_id    VARCHAR(255) NOT NULL,
        removed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES User(id),
        UNIQUE KEY unique_user_removed_song (user_id, mood, song_id)
    )`,
    (err) => { if (err) console.error('PlaylistRemoved table setup failed:', err.message); }
);

// GET /api/playlists/removed  ->  { "hype": ["songId1", ...], "chill": [...] }
module.exports.getRemoved = (req, res) => {
    pool.query('SELECT mood, song_id FROM PlaylistRemoved WHERE user_id = ?',
        [res.locals.userId], (err, rows) => {
            if (err) return res.status(500).json({ message: 'Internal server error' });
            const out = {};
            rows.forEach((r) => { (out[r.mood] || (out[r.mood] = [])).push(r.song_id); });
            res.status(200).json(out);
        });
};

// POST /api/playlists/removed   body: { "mood": "chill", "song_id": "..." }
module.exports.removeSong = (req, res) => {
    const userId = res.locals.userId;
    const mood   = String((req.body && req.body.mood) || '').trim().substring(0, 50);
    const songId = String((req.body && req.body.song_id) || '').trim();
    if (!mood || !songId || songId.length > 255) {
        return res.status(400).json({ message: 'mood and song_id are required' });
    }
    pool.query(
        'INSERT IGNORE INTO PlaylistRemoved (user_id, mood, song_id) VALUES (?, ?, ?)',
        [userId, mood, songId],
        (err) => {
            if (err) return res.status(500).json({ message: 'Internal server error' });
            // take it out of the copy saved in spotify too (never holds up the response)
            savedPlaylists.songRemoved(userId, songId, mood);
            res.status(200).json({ mood: mood, song_id: songId });
        });
};

// called whenever a song is logged with a mood: if it had been removed from that
// mood's playlist, it goes back in (and back into the saved spotify playlist)
module.exports.restoreIfRemoved = (userId, songId, mood, spotifyUrl) => {
    if (!userId || !songId || !mood) return;
    pool.query(
        'DELETE FROM PlaylistRemoved WHERE user_id = ? AND mood = ? AND song_id = ?',
        [userId, mood, songId],
        (err, result) => {
            if (err) return console.error('could not restore playlist song:', err.message);
            if (result.affectedRows) savedPlaylists.songRestored(userId, songId, mood, spotifyUrl);
        });
};