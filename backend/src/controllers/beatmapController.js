const axios = require('axios');
const spotify = require('./spotifyController');

// ── spotify beat map for the background sound waves ─────
// Spotify's audio analysis lists the exact time of every beat in a song and
// how loud each moment is. With it the waves hit on the real beats and follow
// the volume, lined up with where Spotify says you are in the song.
// Spotify only gives this to apps created before late November 2024 — for
// newer apps it answers 403, and the app says { available: false, reason: 'blocked' }
// (then "sync to sound" in the app is the way to follow the drums).

const cache = new Map();                 // spotify track id → response
const MAX_CACHE = 300;
let blockedUntil = 0;                    // after a 403, don't keep asking spotify for a while
const BLOCK_RETRY_MS = 6 * 60 * 60 * 1000;

function analysis(userId, trackId) {
    return new Promise((resolve, reject) => {
        spotify.getUserToken(userId, (err, token) => {
            if (err) return reject(err);
            const get = (t, retried) => axios.get('https://api.spotify.com/v1/audio-analysis/' + trackId, {
                headers: { 'Authorization': 'Bearer ' + t }, timeout: 10000
            })
                .then((r) => resolve(r.data))
                .catch((e) => {
                    if (!retried && e.response && e.response.status === 401) {
                        return spotify.refreshToken(userId, (e2, fresh) => e2 ? reject(e2) : get(fresh, true));
                    }
                    reject(e);
                });
            get(token, false);
        });
    });
}

// keep only what the waves need: beat times, which beats start a bar, and loudness over time
function compact(a) {
    const beats = (a.beats || []).map((b) => Math.round(b.start * 1000));
    const bars = (a.bars || []).map((b) => Math.round(b.start * 1000));
    const down = [];
    let j = 0;
    beats.forEach((t, i) => {
        while (j < bars.length && bars[j] < t - 60) j++;
        if (j < bars.length && Math.abs(bars[j] - t) <= 60) down.push(i);
    });
    const loud = (a.segments || []).map((s) => [
        Math.round((s.start + (s.loudness_max_time || 0)) * 1000),
        Math.round((s.loudness_max || -60) * 10) / 10
    ]);
    return { available: true, beats, down, loud };
}

// GET /api/beatmap?id=<spotify track id>
module.exports.getBeatmap = async (req, res) => {
    const id = String(req.query.id || '');
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return res.status(400).json({ message: 'spotify track id required' });

    if (cache.has(id)) return res.json(cache.get(id));
    if (Date.now() < blockedUntil) return res.json({ available: false, reason: 'blocked' });

    try {
        const out = compact(await analysis(res.locals.userId, id));
        if (!out.beats.length) return res.json({ available: false, reason: 'no_beats' });
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(id, out);
        res.json(out);
    } catch (err) {
        const status = err.response && err.response.status;
        if (status === 403) {
            blockedUntil = Date.now() + BLOCK_RETRY_MS;
            console.log('spotify beat maps are not available for this app (403) — the waves use live sound instead');
            return res.json({ available: false, reason: 'blocked' });
        }
        if (status === 404) return res.json({ available: false, reason: 'not_found' });
        console.error('beat map failed for ' + id + ':', status || err.message);
        res.json({ available: false, reason: 'error' });
    }
};