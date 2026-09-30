const axios = require('axios');

// ── song tempo (BPM) for the background sound waves ─────
// Spotify no longer gives tempo data to new apps, so this looks the song up on
// Deezer's public catalogue (no key needed) and returns its BPM. Deezer doesn't
// know the BPM of every song (it answers 0) — then bpm comes back as null and
// the app falls back to a gentle swell instead of a beat.

const cache = new Map();            // "title|artist" → { bpm, at }
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE = 2000;

function clean(s) {
    return String(s || '')
        .replace(/\s*[\(\[].*?(feat|ft\.|with|remaster|version|edit|mix|live).*?[\)\]]/ig, '')
        .replace(/\s+-\s+.*(remaster|version|edit|mix|live).*$/i, '')
        .replace(/"/g, '')
        .trim();
}

async function lookup(title, artist) {
    const firstArtist = clean(artist.split(',')[0]);
    const song = clean(title);
    const queries = [
        'artist:"' + firstArtist + '" track:"' + song + '"',
        firstArtist + ' ' + song
    ];
    for (const q of queries) {
        const search = await axios.get('https://api.deezer.com/search', {
            params: { q, limit: 5 }, timeout: 6000
        });
        const hits = (search.data && search.data.data) || [];
        for (const hit of hits.slice(0, 3)) {
            const track = await axios.get('https://api.deezer.com/track/' + hit.id, { timeout: 6000 });
            const bpm = Number(track.data && track.data.bpm);
            if (bpm >= 40 && bpm <= 240) return Math.round(bpm * 10) / 10;
        }
    }
    return null;
}

// GET /api/tempo?title=…&artist=…  →  { bpm: 118 } or { bpm: null }
module.exports.getTempo = async (req, res) => {
    const title = String(req.query.title || '').slice(0, 200);
    const artist = String(req.query.artist || '').slice(0, 200);
    if (!title || !artist) return res.status(400).json({ message: 'title and artist required' });

    const key = title.toLowerCase() + '|' + artist.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return res.json({ bpm: hit.bpm, cached: true });

    try {
        const bpm = await lookup(title, artist);
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(key, { bpm, at: Date.now() });
        res.json({ bpm });
    } catch (err) {
        // deezer down or slow — not worth an error in the app, the waves just swell
        console.error('tempo lookup failed for "' + title + '":', err.message);
        res.json({ bpm: null });
    }
};