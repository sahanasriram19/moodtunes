require('dotenv').config();

const axios = require('axios');
const app   = require('./src/app');
const pool  = require('./src/services/db');

const PORT = process.env.PORT || 3000;

// log unexpected async errors instead of letting them take the whole server down
process.on('unhandledRejection', (err) => {
    console.error('Unhandled promise rejection:', err);
});

app.listen(PORT, () => {
    console.log(`moodtunes server running on port ${PORT}`);
    // open a database connection straight away, so the first real request
    // doesn't also have to wait for the TLS handshake with the database
    pool.query('SELECT 1', (err) => { if (err) console.error('DB warm-up failed:', err.message); });
    keepAwake();
});

// ── keep the server awake ────────────────────────────────────────────────────
// render's free plan puts the server to sleep after 15 minutes without any
// visitors, and the next visitor then waits up to a minute while it starts up
// again. so the server visits its own public address every 10 minutes, which
// counts as a visitor and stops it from ever falling asleep. it also runs a tiny
// database query each time so the database connection stays open and quick.
//
// RENDER_EXTERNAL_URL is set by render automatically. set KEEP_AWAKE_URL to use
// another address, or KEEP_AWAKE=false to turn this off.
// (a free render service running all month uses ~744 of the 750 free hours, so
// this is fine as long as it's your only free service that's always on)
function keepAwake() {
    if (process.env.KEEP_AWAKE === 'false') return;
    const base = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL;
    if (!base) return;                                  // running locally: nothing to do
    const url = base.replace(/\/+$/, '') + (/\/api\/health$/.test(base) ? '' : '/api/health');
    const EVERY = 10 * 60 * 1000;
    setInterval(() => {
        axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'moodtunes-keep-awake' } })
            .catch((e) => console.error('keep-awake ping failed:', e.message));
        pool.query('SELECT 1', () => {});
    }, EVERY);
    console.log('keep-awake: pinging ' + url + ' every 10 minutes');
}