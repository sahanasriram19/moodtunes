const axios = require('axios');
const spotify = require('./spotifyController');

// ── song tempo (BPM) for the background sound waves ─────
// Spotify no longer gives tempo data to new apps, so this looks the song up on
// Deezer's public catalogue (no key needed) and returns its BPM.
//  1. exact match: every released recording has an ISRC code. we get it from
//     spotify and ask deezer for that exact recording.
//  2. if that fails, search deezer by artist + title.
// Deezer doesn't know the BPM of every song (it answers 0) — then bpm comes
// back as null and the waves drift slowly instead of kicking on a beat.

const cache = new Map();            // spotify id (or "title|artist") → { bpm, at }
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_CACHE_MS = 24 * 60 * 60 * 1000;     // try songs without a tempo again the next day
const MAX_CACHE = 2000;

function clean(s) {
    return String(s || '')
        .replace(/\s*[\(\[].*?(feat|ft\.|with|remaster|version|edit|mix|live).*?[\)\]]/ig, '')
        .replace(/\s+-\s+.*(remaster|version|edit|mix|live).*$/i, '')
        .replace(/"/g, '')
        .trim();
}

function validBpm(v) {
    const bpm = Number(v);
    return bpm >= 40 && bpm <= 240 ? Math.round(bpm * 10) / 10 : null;
}

// the song's ISRC from spotify (null if spotify isn't connected or doesn't say)
function spotifyIsrc(userId, trackId) {
    return new Promise((resolve) => {
        if (!userId || !/^[A-Za-z0-9]{10,40}$/.test(trackId || '')) return resolve(null);
        spotify.getUserToken(userId, (err, token) => {
            if (err) return resolve(null);
            const get = (t, retried) => axios.get('https://api.spotify.com/v1/tracks/' + trackId, {
                headers: { 'Authorization': 'Bearer ' + t }, timeout: 6000
            })
                .then((r) => resolve((r.data && r.data.external_ids && r.data.external_ids.isrc) || null))
                .catch((e) => {
                    if (!retried && e.response && e.response.status === 401) {
                        return spotify.refreshToken(userId, (e2, fresh) => e2 ? resolve(null) : get(fresh, true));
                    }
                    resolve(null);
                });
            get(token, false);
        });
    });
}

async function byIsrc(isrc) {
    const r = await axios.get('https://api.deezer.com/track/isrc:' + encodeURIComponent(isrc), { timeout: 6000 });
    if (!r.data || r.data.error) return { bpm: null, track: null };
    return { bpm: validBpm(r.data.bpm), track: r.data };
}

async function bySearch(title, artist) {
    const firstArtist = clean(artist.split(',')[0]);
    const song = clean(title);
    const bare = song.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();     // "Song (Live at X)" → "Song"
    const queries = [
        'artist:"' + firstArtist + '" track:"' + song + '"',
        firstArtist + ' ' + song
    ];
    if (bare && bare !== song) queries.push('artist:"' + firstArtist + '" track:"' + bare + '"');
    for (const q of queries) {
        const search = await axios.get('https://api.deezer.com/search', {
            params: { q, limit: 5 }, timeout: 6000
        });
        const hits = (search.data && search.data.data) || [];
        for (const hit of hits.slice(0, 3)) {
            const track = await axios.get('https://api.deezer.com/track/' + hit.id, { timeout: 6000 });
            const bpm = validBpm(track.data && track.data.bpm);
            if (bpm) return bpm;
        }
    }
    return null;
}

async function lookup(userId, trackId, title, artist) {
    const isrc = await spotifyIsrc(userId, trackId);
    if (isrc) {
        try {
            const hit = await byIsrc(isrc);
            if (hit.bpm) return { bpm: hit.bpm, via: 'isrc' };
            // deezer knows the recording but has no tempo for it: search with deezer's own names
            if (hit.track && hit.track.title && hit.track.artist) {
                const bpm = await bySearch(hit.track.title, hit.track.artist.name || artist);
                if (bpm) return { bpm, via: 'search' };
            }
        } catch (e) { /* fall through to the plain search */ }
    }
    const bpm = await bySearch(title, artist);
    return { bpm, via: bpm ? 'search' : null };
}

// GET /api/tempo?id=<spotify track id>&title=…&artist=…  →  { bpm: 118 } or { bpm: null }
module.exports.getTempo = async (req, res) => {
    const id = String(req.query.id || '').slice(0, 40);
    const title = String(req.query.title || '').slice(0, 200);
    const artist = String(req.query.artist || '').slice(0, 200);
    if (!title || !artist) return res.status(400).json({ message: 'title and artist required' });

    const key = id || (title.toLowerCase() + '|' + artist.toLowerCase());
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < (hit.bpm ? CACHE_MS : MISS_CACHE_MS)) return res.json({ bpm: hit.bpm, via: hit.via, cached: true });

    try {
        const found = await lookup(res.locals.userId, id, title, artist);
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(key, { bpm: found.bpm, via: found.via, at: Date.now() });
        res.json({ bpm: found.bpm, via: found.via });
    } catch (err) {
        // deezer down or slow — not worth an error in the app, the waves just swell
        console.error('tempo lookup failed for "' + title + '":', err.message);
        res.json({ bpm: null });
    }
};