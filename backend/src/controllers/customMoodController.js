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

// ── every custom mood gets its own colour ──────────────
// picked once, when the mood is made, to be as far as possible from the colour of
// every other mood the user has (the 7 built-in ones included, even hidden ones),
// then saved so it never changes. moods made before this get one the first time
// they're loaded.
pool.query('ALTER TABLE CustomMood ADD COLUMN color VARCHAR(7) NULL', (err) => {
    if (err && !/duplicate column/i.test(err.message)) console.error('CustomMood.color setup failed:', err.message);
});

// must match COLORS in the app's mood.js
const BUILT_IN_COLORS = ['#f2c84b', '#378add', '#b07a50', '#d4537e', '#7f77dd', '#1D9E75', '#888780'];

function hexToHsl(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
// how different two colours look: hue difference matters most, then lightness;
// greys (like chill) only clash with other greys
function colourDistance(a, b) {
    const grey = (c) => c.s < 18;
    if (grey(a) || grey(b)) return grey(a) && grey(b) ? Math.abs(a.l - b.l) : 60 + Math.abs(a.l - b.l);
    let dh = Math.abs(a.h - b.h); dh = Math.min(dh, 360 - dh);
    return dh + Math.abs(a.l - b.l) * 1.5;
}
// the candidate colour furthest from all the ones already in use
function pickColour(used) {
    const taken = used.map(hexToHsl);
    let best = null, bestScore = -1;
    for (let h = 0; h < 360; h += 4) {
        for (const l of [62, 48, 74]) {
            const c = { h, s: 62, l };
            const score = taken.length ? Math.min(...taken.map((t) => colourDistance(c, t))) : 999;
            // small tie-break towards the middle lightness so colours stay readable
            const adj = score - (l === 62 ? 0 : 0.5);
            if (adj > bestScore) { bestScore = adj; best = c; }
        }
    }
    return hslToHex(best.h, best.s, best.l);
}

function q(sql, params) {
    return new Promise((ok, no) => pool.query(sql, params, (e, r) => e ? no(e) : ok(r)));
}

module.exports.getCustomMoods = async (req, res) => {
    const userId = res.locals.userId;
    try {
        const rows = await q('SELECT * FROM CustomMood WHERE user_id = ? ORDER BY created_at ASC, id ASC', [userId]);
        // older moods without a colour: give each one, in the order they were made
        const used = BUILT_IN_COLORS.concat(rows.filter((r) => r.color).map((r) => r.color));
        for (const r of rows) {
            if (r.color) continue;
            r.color = pickColour(used);
            used.push(r.color);
            try { await q('UPDATE CustomMood SET color = ? WHERE id = ? AND user_id = ?', [r.color, r.id, userId]); } catch (e) { /* still shown this time */ }
        }
        res.status(200).json(rows);
    } catch (e) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports.createCustomMood = async (req, res) => {
    const userId = res.locals.userId;
    const { name, emoji } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const clean = name.toLowerCase().trim().substring(0, 30);
    try {
        const rows = await q('SELECT color FROM CustomMood WHERE user_id = ? AND color IS NOT NULL', [userId]);
        const color = pickColour(BUILT_IN_COLORS.concat(rows.map((r) => r.color)));
        let result;
        try {
            result = await q('INSERT INTO CustomMood (user_id, name, emoji, color) VALUES (?, ?, ?, ?)', [userId, clean, emoji || '🎵', color]);
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'mood already exists' });
            if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
            // the colour column isn't there yet (first start after the update): save without it
            result = await q('INSERT INTO CustomMood (user_id, name, emoji) VALUES (?, ?, ?)', [userId, clean, emoji || '🎵']);
        }
        res.status(201).json({ id: result.insertId, name: clean, emoji: emoji || '🎵', color });
    } catch (e) {
        res.status(500).json({ message: 'Internal server error' });
    }
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
module.exports._pickColour = pickColour;   // for tests