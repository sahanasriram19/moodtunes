const pool = require('../services/db');

// ── hidden built-in moods ──────────────────────────────
// users can remove any of the 7 built-in moods from their page. The table is
// created automatically on startup, so no manual migration is needed.
const DEFAULT_MOODS = ['happy', 'sad', 'hype', 'heartbreak', 'nostalgic', 'focused', 'chill'];

pool.query(
    `CREATE TABLE IF NOT EXISTS HiddenMood (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        user_id   INT NOT NULL,
        mood      VARCHAR(50) NOT NULL,
        hidden_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES User(id),
        UNIQUE KEY unique_user_hidden_mood (user_id, mood)
    )`,
    (err) => { if (err) console.error('HiddenMood table setup failed:', err.message); }
);

module.exports.getCustomMoods = (req, res) => {
    pool.query('SELECT * FROM CustomMood WHERE user_id = ? ORDER BY created_at ASC',
        [res.locals.userId], (err, results) => {
            if (err) return res.status(500).json({ message: 'Internal server error' });
            res.status(200).json(results);
        });
};

module.exports.createCustomMood = (req, res) => {
    const { name, emoji } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const clean = name.toLowerCase().trim().substring(0, 30);
    pool.query('INSERT INTO CustomMood (user_id, name, emoji) VALUES (?, ?, ?)',
        [res.locals.userId, clean, emoji || '🎵'], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'mood already exists' });
                return res.status(500).json({ message: 'Internal server error' });
            }
            res.status(201).json({ id: result.insertId, name: clean, emoji: emoji || '🎵' });
        });
};

module.exports.deleteCustomMood = (req, res) => {
    pool.query('DELETE FROM CustomMood WHERE user_id = ? AND id = ?',
        [res.locals.userId, req.params.id], (err) => {
            if (err) return res.status(500).json({ message: 'Internal server error' });
            res.status(200).json({ message: 'deleted' });
        });
};

module.exports.getHiddenMoods = (req, res) => {
    pool.query('SELECT mood FROM HiddenMood WHERE user_id = ? ORDER BY hidden_at ASC',
        [res.locals.userId], (err, results) => {
            if (err) return res.status(500).json({ message: 'Internal server error' });
            res.status(200).json(results.map((r) => r.mood));
        });
};

module.exports.hideMood = (req, res) => {
    const mood = (req.body.mood || '').toLowerCase().trim();
    if (DEFAULT_MOODS.indexOf(mood) === -1) return res.status(400).json({ message: 'not a built-in mood' });
    pool.query('INSERT IGNORE INTO HiddenMood (user_id, mood) VALUES (?, ?)',
        [res.locals.userId, mood], (err) => {
            if (err) return res.status(500).json({ message: 'Internal server error' });
            res.status(201).json({ mood: mood, hidden: true });
        });
};

module.exports.unhideMood = (req, res) => {
    const mood = (req.params.mood || '').toLowerCase().trim();
    pool.query('DELETE FROM HiddenMood WHERE user_id = ? AND mood = ?',
        [res.locals.userId, mood], (err) => {
            if (err) return res.status(500).json({ message: 'Internal server error' });
            res.status(200).json({ mood: mood, hidden: false });
        });
};