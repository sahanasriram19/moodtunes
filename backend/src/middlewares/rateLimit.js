// rateLimit.js — stops anyone hammering the login / sign-up forms to guess passwords
//
// a tiny in-memory limiter (no extra packages to install). it counts requests per
// key inside a time window, and once a key goes over `max` it answers 429 with a
// friendly message until the window is up. counts reset when the server restarts,
// which is fine for this — it's only there to slow guessing down.
//
// options:
//   windowMs        how long a window lasts
//   max             requests allowed per key in one window
//   key(req)        what to count by (default: the visitor's IP)
//   onlyFailures    true = successful requests don't count (e.g. a correct login)
//   message         what the app shows when someone hits the limit

function rateLimit(opts) {
    const windowMs = opts.windowMs;
    const max = opts.max;
    const keyOf = opts.key || ((req) => req.ip);
    const hits = new Map();

    // forget windows that have ended so the map doesn't keep growing
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    }, windowMs).unref();

    return (req, res, next) => {
        const key = keyOf(req);
        const now = Date.now();
        let entry = hits.get(key);
        if (!entry || entry.reset <= now) {
            entry = { count: 0, reset: now + windowMs };
            hits.set(key, entry);
        }

        if (entry.count >= max) {
            const wait = Math.ceil((entry.reset - now) / 1000);
            res.set('Retry-After', String(wait));
            const mins = Math.max(1, Math.ceil(wait / 60));
            return res.status(429).json({
                message: (opts.message || 'too many attempts') + ' — try again in ' + mins + (mins === 1 ? ' minute' : ' minutes')
            });
        }

        entry.count++;
        if (opts.onlyFailures) {
            // a request that worked gives its attempt back
            res.on('finish', () => {
                if (res.statusCode < 400 && entry.count > 0) entry.count--;
            });
        }
        next();
    };
}

module.exports = rateLimit;