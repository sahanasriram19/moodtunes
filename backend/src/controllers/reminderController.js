// reminderController.js — the daily check-in reminder
//
// people pick a time ("remind me at 9pm") in the profile menu. their browser gives
// us a push subscription (an address to send a notification to, one per device),
// saved here with the time and their timezone. sendDue() sends "how are you
// feeling?" to everyone whose time has come today, once a day (if you've already
// logged songs that day, it mentions how many). it runs every 5 minutes while the server is awake,
// and whenever /api/reminders/tick is called (the GitHub Action in
// .github/workflows/keep-awake.yml calls it, and that also wakes the server).
//
// the push keys (VAPID): if VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are set on render
// they're used. if not, the server makes a pair itself the first time and keeps it
// in the database (AppSetting table), so reminders work with no setup and the keys
// stay the same after restarts. optional settings:
//   VAPID_SUBJECT   mailto:you@example.com (defaults to the app's address)
//   CRON_SECRET     lets the GitHub Action call /tick (the server also checks every
//                   5 minutes by itself while it's awake, and that Action keeps it awake)

const pool = require('../services/db');
let webpush = null;
try { webpush = require('web-push'); } catch (e) { console.error('web-push is not installed: run npm install'); }

let PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY || '';
let PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT   = process.env.VAPID_SUBJECT ||
    (process.env.APP_URL || 'https://moodtunes-main.vercel.app').replace(/\/+$/, '');
let enabled = false;

function turnOn() {
    try {
        webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
        enabled = true;
        // every 5 minutes while the server is up
        setInterval(() => { sendDue(); }, 5 * 60 * 1000).unref();
    } catch (e) {
        console.error('reminder keys are not valid:', e.message);
    }
}

const sql = (text, params) => new Promise((resolve, reject) => pool.query(text, params || [], (e, r) => e ? reject(e) : resolve(r)));

// resolves once the keys are known (from the settings, or the database, or made now)
const keysReady = (async () => {
    if (!webpush) return;
    if (PUBLIC_KEY && PRIVATE_KEY) return turnOn();
    try {
        await sql('CREATE TABLE IF NOT EXISTS AppSetting (k VARCHAR(64) PRIMARY KEY, v TEXT NOT NULL)');
        const read = async () => {
            const rows = await sql("SELECT k, v FROM AppSetting WHERE k IN ('vapid_public', 'vapid_private')");
            const m = {};
            rows.forEach((r) => { m[r.k] = r.v; });
            return m;
        };
        let m = await read();
        if (!m.vapid_public || !m.vapid_private) {
            const made = webpush.generateVAPIDKeys();
            // INSERT IGNORE: if two servers start at once, both end up with the same pair
            await sql("INSERT IGNORE INTO AppSetting (k, v) VALUES ('vapid_public', ?), ('vapid_private', ?)", [made.publicKey, made.privateKey]);
            m = await read();
            console.log('reminders: made new push keys and saved them in the database');
        }
        if (m.vapid_public && m.vapid_private) {
            PUBLIC_KEY = m.vapid_public;
            PRIVATE_KEY = m.vapid_private;
            turnOn();
        }
    } catch (e) {
        console.error('reminder key setup failed:', e.message);
    }
})();

const SEND_WINDOW_MIN = 180;   // a reminder still goes out up to 3 hours late (sleepy server, late cron)

pool.query(
    `CREATE TABLE IF NOT EXISTS ReminderSub (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        user_id       INT NOT NULL,
        endpoint      VARCHAR(700) NOT NULL,
        p256dh        VARCHAR(255) NOT NULL,
        auth          VARCHAR(255) NOT NULL,
        remind_at     CHAR(5) NOT NULL,
        tz_offset     INT NOT NULL DEFAULT 0,
        last_sent_day CHAR(10) NULL,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES User(id),
        UNIQUE KEY reminder_endpoint (endpoint(255))
    )`,
    (err) => { if (err) console.error('ReminderSub table setup failed:', err.message); }
);

// the user's own clock: tz is the browser's getTimezoneOffset() (minutes; -480 = UTC+8)
function localNow(tz, now) {
    const d = new Date(now - Number(tz || 0) * 60000);
    return { day: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function validTime(t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || '')); }
function validTz(tz) { const n = Number(tz); return Number.isFinite(n) && Math.abs(n) <= 14 * 60; }

// GET /api/reminders/key — the public key the browser needs to subscribe
module.exports.getKey = async (req, res) => {
    await keysReady;
    if (!enabled) return res.status(503).json({ message: 'reminders are not set up on the server yet', reason: 'not_configured' });
    res.status(200).json({ publicKey: PUBLIC_KEY });
};

// a notification straight away when reminders are switched on, so you can see they
// reach this device. resolves to '' (it arrived at the push service), 'resubscribe'
// (this device's subscription is old or made with other keys) or 'failed'
async function sendWelcome(sub, time) {
    const h = Number(time.slice(0, 2)), m = time.slice(3, 5);
    const label = ((h % 12) || 12) + ':' + m + (h < 12 ? ' am' : ' pm');
    try {
        await webpush.sendNotification(sub, JSON.stringify({
            title: 'reminders are on',
            body: 'you’ll get a nudge at ' + label + ' every day',
            url: '/index.html',
            tag: 'moodtunes-welcome'
        }), { TTL: 600 });
        return '';
    } catch (e) {
        if ([400, 401, 403, 404, 410].includes(e.statusCode)) return 'resubscribe';
        console.error('welcome push failed:', e.statusCode || '', e.message);
        return 'failed';
    }
}

// POST /api/reminders { subscription, time: "21:00", tz_offset, test? } — turn on / change the time for this device
module.exports.save = async (req, res) => {
    await keysReady;
    if (!enabled) return res.status(503).json({ message: 'reminders are not set up on the server yet', reason: 'not_configured' });
    const sub = req.body && req.body.subscription;
    const time = req.body && req.body.time;
    const tz = req.body && req.body.tz_offset;
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 700 ||
        !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return res.status(400).json({ message: 'invalid subscription' });
    if (!validTime(time)) return res.status(400).json({ message: 'pick a time like 21:00' });
    if (!validTz(tz)) return res.status(400).json({ message: 'invalid timezone' });
    // if the chosen time has already passed today, the first reminder is tomorrow.
    // and if today's was already sent, changing the time doesn't send a second one
    const today = localNow(tz, Date.now());
    const skipToday = today.minutes >= toMinutes(time) ? today.day : null;
    pool.query(
        'INSERT INTO ReminderSub (user_id, endpoint, p256dh, auth, remind_at, tz_offset, last_sent_day) VALUES (?, ?, ?, ?, ?, ?, ?)' +
        ' ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth),' +
        ' remind_at = VALUES(remind_at), tz_offset = VALUES(tz_offset),' +
        ' last_sent_day = IF(last_sent_day = ?, last_sent_day, VALUES(last_sent_day))',
        [res.locals.userId, sub.endpoint, String(sub.keys.p256dh), String(sub.keys.auth), time, Number(tz), skipToday, today.day],
        async (err) => {
            if (err) { console.error('save reminder failed:', err.message); return res.status(500).json({ message: 'Internal server error' }); }
            // when the next one comes: today, unless the time has passed or today's was already sent
            const row = await q('SELECT last_sent_day FROM ReminderSub WHERE endpoint = ?', [sub.endpoint]).catch(() => []);
            const first = row[0] && row[0].last_sent_day === today.day ? 'tomorrow' : 'today';
            kick();
            if (!req.body.test) return res.status(200).json({ message: 'reminder saved', time: time, first: first });
            const result = await sendWelcome({ endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }, time);
            if (result === 'resubscribe') {
                pool.query('DELETE FROM ReminderSub WHERE endpoint = ?', [sub.endpoint], () => {});
                return res.status(409).json({ message: 'this device needs to sign up for notifications again', reason: 'resubscribe' });
            }
            res.status(200).json({ message: 'reminder saved', time: time, first: first, test: result || 'sent' });
        }
    );
};

// DELETE /api/reminders { endpoint } — turn off for this device
module.exports.remove = (req, res) => {
    const endpoint = req.body && req.body.endpoint;
    if (!endpoint) return res.status(400).json({ message: 'endpoint required' });
    pool.query('DELETE FROM ReminderSub WHERE user_id = ? AND endpoint = ?', [res.locals.userId, endpoint], (err) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json({ message: 'reminder off' });
    });
};

function toMinutes(t) { return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)); }

const q = sql;

// sends every reminder that's due now. returns how many were sent
let running = false;
async function sendDue() {
    if (!enabled || running) return 0;
    running = true;
    let sent = 0;
    try {
        const now = Date.now();
        const subs = await q('SELECT * FROM ReminderSub', []);
        for (const s of subs) {
            const local = localNow(s.tz_offset, now);
            const late = local.minutes - toMinutes(s.remind_at);
            if (late < 0 || late > SEND_WINDOW_MIN || s.last_sent_day === local.day) continue;
            // claim it first, so two checks at once can't both send
            const claim = await q('UPDATE ReminderSub SET last_sent_day = ? WHERE id = ? AND (last_sent_day IS NULL OR last_sent_day <> ?)', [local.day, s.id, local.day]);
            if (claim.affectedRows !== 1) continue;
            // sent every day at your time. if you've already logged songs today it says so
            // (plays counted automatically count as logged too, so skipping those days meant
            // the reminder almost never came)
            const logged = await q('SELECT COUNT(*) AS n FROM Log WHERE user_id = ? AND log_date = ?', [s.user_id, local.day]).catch(() => [{ n: 0 }]);
            const n = Number(logged[0] && logged[0].n) || 0;
            const payload = JSON.stringify({
                title: 'how are you feeling?',
                body: n ? 'you’ve logged ' + n + ' song' + (n === 1 ? '' : 's') + ' today. listening to anything else? log it with a mood'
                        : 'pick a mood and log what you’re listening to today',
                url: '/index.html',
                tag: 'moodtunes-checkin'
            });
            try {
                await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 4 * 3600 });
                sent++;
            } catch (e) {
                // the device unsubscribed or the app was removed: forget it
                if (e.statusCode === 404 || e.statusCode === 410) await q('DELETE FROM ReminderSub WHERE id = ?', [s.id]).catch(() => {});
                else {
                    console.error('reminder send failed:', e.statusCode || '', e.message);
                    // let the next check (a few minutes later) try again
                    await q('UPDATE ReminderSub SET last_sent_day = ? WHERE id = ?', [s.last_sent_day || null, s.id]).catch(() => {});
                }
            }
        }
    } catch (e) {
        console.error('reminder check failed:', e.message);
    }
    running = false;
    return sent;
}

// POST or GET /api/reminders/tick — header X-Cron-Secret must match CRON_SECRET
module.exports.tick = async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.get('X-Cron-Secret') !== secret) return res.status(403).json({ message: 'forbidden' });
    const sent = await sendDue();
    res.status(200).json({ ok: true, sent: sent });
};


// a check soon after any visit (app.js calls this on /api/health, which the GitHub
// Action opens every 10 minutes), at most once a minute. so a reminder goes out
// within a few minutes of its time even with no CRON_SECRET, and right after a
// sleeping server wakes up
let lastKick = 0;
function kick() {
    if (Date.now() - lastKick < 60 * 1000) return;
    lastKick = Date.now();
    keysReady.then(() => setTimeout(() => { sendDue(); }, 2000));
}
module.exports.kick = kick;
// and once when the server starts
kick();

module.exports._localNow = localNow;   // for tests