const crypto = require('crypto');
const axios  = require('axios');
const bcrypt = require('bcryptjs');
const pool   = require('../services/db');

// ── forgot password + delete account ─────────────────────────────────────────
//
// forgot password: the app asks for your email, and if an account has it, an
// email with a reset link is sent. the link holds a random one-time code that
// works for 30 minutes. only a hash of the code is saved, so a database leak
// can't be used to reset anyone's password.
//
// emails are sent through brevo's web api (render's free plan blocks normal
// SMTP email). set these in render → environment:
//   BREVO_API_KEY   your brevo api key (brevo.com → SMTP & API → API keys)
//   MAIL_FROM       the sender email you verified in brevo (e.g. your gmail)
//   APP_URL         where the app lives (defaults to the vercel address)
// without BREVO_API_KEY the reset link is printed in the server logs instead,
// which is handy for testing.

const APP_URL   = (process.env.APP_URL || 'https://moodtunes-rust.vercel.app').replace(/\/+$/, '');
const RESET_FOR = 30 * 60 * 1000;     // a reset link works for 30 minutes

pool.query(
    `CREATE TABLE IF NOT EXISTS PasswordReset (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_ms BIGINT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES User(id),
        UNIQUE KEY unique_reset_token (token_hash)
    )`,
    (err) => { if (err) console.error('PasswordReset table setup failed:', err.message); }
);

function query(sql, params) {
    return new Promise((resolve, reject) => pool.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendResetEmail(to, username, link) {
    if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM) {
        console.log('[password reset] email not set up (BREVO_API_KEY / MAIL_FROM). link for ' + username + ': ' + link);
        return;
    }
    await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || 'moodtunes' },
        to: [{ email: to }],
        subject: 'reset your moodtunes password',
        textContent:
            'hi ' + username + ',\n\n' +
            'someone (hopefully you) asked to reset the password for your moodtunes account.\n\n' +
            'set a new password here (the link works for 30 minutes):\n' + link + '\n\n' +
            'if you didn’t ask for this, you can ignore this email. your password stays the same.',
        htmlContent:
            '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:460px">' +
            '<p>hi ' + escHtml(username) + ',</p>' +
            '<p>someone (hopefully you) asked to reset the password for your moodtunes account.</p>' +
            '<p><a href="' + escHtml(link) + '" style="display:inline-block;padding:10px 18px;background:#7f77dd;color:#fff;text-decoration:none;border-radius:8px">set a new password</a></p>' +
            '<p style="color:#666;font-size:13px">the link works for 30 minutes. if you didn’t ask for this, you can ignore this email. your password stays the same.</p>' +
            '</div>'
    }, {
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        timeout: 15000
    });
}

// POST /api/auth/forgot   body: { email }
// always gives the same answer, so nobody can use it to find out who has an account
module.exports.forgotPassword = async (req, res) => {
    const email = String((req.body && req.body.email) || '').trim();
    const reply = () => res.status(200).json({ message: 'if an account uses that email, a reset link is on its way. check your inbox (and spam).' });
    if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'please enter a valid email' });
    }
    try {
        const rows = await query('SELECT id, username, email FROM User WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
        if (!rows.length) return reply();
        const user = rows[0];
        const token = crypto.randomBytes(32).toString('hex');
        // one live link per account: a new request replaces the old one
        await query('DELETE FROM PasswordReset WHERE user_id = ? OR expires_ms < ?', [user.id, Date.now()]);
        await query('INSERT INTO PasswordReset (user_id, token_hash, expires_ms) VALUES (?, ?, ?)',
            [user.id, sha256(token), Date.now() + RESET_FOR]);
        await sendResetEmail(user.email, user.username, APP_URL + '/reset.html?token=' + token);
        reply();
    } catch (e) {
        console.error('forgot password failed:', e.response ? JSON.stringify(e.response.data) : e.message);
        res.status(502).json({ message: 'couldn’t send the email right now, try again in a few minutes' });
    }
};

// POST /api/auth/reset   body: { token, password }
module.exports.resetPassword = async (req, res) => {
    const token = String((req.body && req.body.token) || '');
    const password = String((req.body && req.body.password) || '');
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: 'this reset link isn’t valid. ask for a new one.' });
    if (password.trim().length < 6) return res.status(400).json({ message: 'use at least 6 characters' });
    if (password.length > 200) return res.status(400).json({ message: 'that password is too long' });
    try {
        const rows = await query('SELECT id, user_id, expires_ms FROM PasswordReset WHERE token_hash = ? LIMIT 1', [sha256(token)]);
        if (!rows.length || Number(rows[0].expires_ms) < Date.now()) {
            if (rows.length) await query('DELETE FROM PasswordReset WHERE id = ?', [rows[0].id]);
            return res.status(400).json({ message: 'this reset link has expired or was already used. ask for a new one.' });
        }
        const hash = await bcrypt.hash(password, 10);
        await query('UPDATE User SET password = ? WHERE id = ?', [hash, rows[0].user_id]);
        await query('DELETE FROM PasswordReset WHERE user_id = ?', [rows[0].user_id]);
        res.status(200).json({ message: 'password changed. you can log in with it now.' });
    } catch (e) {
        console.error('reset password failed:', e.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/auth/account   body: { password }
// deletes the account and everything saved with it, in one go: if any step
// fails nothing is deleted. playlists already saved to spotify stay in the
// person's spotify library (they're theirs).
const OWNED_TABLES = [
    'PasswordReset', 'SessionPlaylist', 'PlayLaunch', 'PlaylistOrder', 'PlaylistRemoved',
    'SpotifyPlaylist', 'HiddenMood', 'CustomMood', 'Log'
];

module.exports.deleteAccount = (req, res) => {
    const userId = res.locals.userId;
    const password = String((req.body && req.body.password) || '');
    if (!password) return res.status(400).json({ message: 'enter your password to delete your account' });

    pool.query('SELECT password FROM User WHERE id = ?', [userId], async (err, rows) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (!rows.length) return res.status(404).json({ message: 'account not found' });
        const ok = await bcrypt.compare(password, rows[0].password).catch(() => false);
        if (!ok) return res.status(403).json({ message: 'wrong password' });

        pool.getConnection((err2, conn) => {
            if (err2) return res.status(500).json({ message: 'Internal server error' });
            const q = (sql, p) => new Promise((resolve, reject) => conn.query(sql, p, (e, r) => e ? reject(e) : resolve(r)));
            const tableExists = async (name) => {
                const [r] = await q('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)', [name]);
                return r.n > 0;
            };
            (async () => {
                await q('START TRANSACTION');
                await q('DELETE sl FROM SessionLog sl JOIN Session s ON s.id = sl.session_id WHERE s.user_id = ?', [userId]);
                for (const t of OWNED_TABLES) {
                    if (await tableExists(t)) await q('DELETE FROM `' + t + '` WHERE user_id = ?', [userId]);
                }
                await q('DELETE FROM Session WHERE user_id = ?', [userId]);
                await q('DELETE FROM User WHERE id = ?', [userId]);
                await q('COMMIT');
            })().then(() => {
                conn.release();
                res.status(200).json({ message: 'account deleted' });
            }).catch((e) => {
                console.error('delete account failed:', e.message);
                conn.query('ROLLBACK', () => { conn.release(); });
                res.status(500).json({ message: 'couldn’t delete your account, nothing was removed. try again.' });
            });
        });
    });
};