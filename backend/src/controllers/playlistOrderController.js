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