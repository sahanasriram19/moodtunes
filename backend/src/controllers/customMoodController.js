const pool = require('../services/db');

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