const axios   = require('axios');
const spotify = require('./spotifyController');
const lists   = require('./spotifyPlaylistController');
const logs    = require('../models/logModel');

const { call, uriOf, query } = lists;
const API = 'https://api.spotify.com/v1';

// ── shared helpers ───────────────────────────────────────────────────────────

// why a spotify call failed, in words the app understands
function reasonOf(e) {
    const status = e.status || (e.response && e.response.status);
    const r = e.response && e.response.data && e.response.data.error && e.response.data.error.reason;
    if (status === 401) return 'not_connected';
    if (lists.needsReconnect(e)) return 'reconnect';
    if (status === 403 || r === 'PREMIUM_REQUIRED') return 'premium_required';
    if (status === 404 || r === 'NO_ACTIVE_DEVICE') return 'no_active_device';
    return 'failed';
}
const STATUS_FOR = { not_connected: 401, reconnect: 403, premium_required: 403, no_active_device: 404 };
function sendFailure(res, e, what) {
    const reason = reasonOf(e);
    if (reason === 'failed') console.error(what + ' failed:', e.status || '', e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(STATUS_FOR[reason] || 502).json({ reason });
}

// the browser's timezone (minutes behind UTC, like getTimezoneOffset)
function tzOf(req) {
    let tz = parseInt(req.get('X-Timezone-Offset'), 10);
    if (isNaN(tz) || Math.abs(tz) > 14 * 60) tz = -logs.DEFAULT_OFFSET_SECONDS / 60;
    return tz;
}
const dayOf = (ms, tz) => new Date(ms - tz * 60000).toISOString().slice(0, 10);

const trackIdOf = (s) => { const u = uriOf(s); return u ? u.split(':')[2] : null; };

// spotify catalogue lookups (tracks, artists, search) with the app's own token,
// so they don't count against the user's connection
function catalog(path, params, retried) {
    return new Promise((resolve, reject) => {
        spotify.getAppToken((err, token) => {
            if (err) return reject(err);
            axios.get(API + path, { params, headers: { 'Authorization': 'Bearer ' + token }, timeout: 12000 })
                .then((r) => resolve(r.data))
                .catch((e) => {
                    if (!retried && e.response && e.response.status === 401) {
                        spotify.resetAppToken();
                        return catalog(path, params, true).then(resolve, reject);
                    }
                    reject(e);
                });
        });
    });
}

// small memory caches (a song's artists and an artist's genres rarely change)
function lru(max) {
    const m = new Map();
    return {
        get: (k) => m.get(k),
        set: (k, v) => { m.set(k, v); if (m.size > max) m.delete(m.keys().next().value); }
    };
}
const trackArtists = lru(3000);       // track id  → [artist id, …]
const artistInfo   = lru(3000);       // artist id → { name, genres }

// ── the heart: save to / remove from your spotify liked songs ───────────────
// (spotify's february 2026 /me/library endpoints, falling back to the older ones)

// GET /api/spotify/liked?ids=a,b,c   → { a: true, b: false, … }
module.exports.likedState = async (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(trackIdOf).filter(Boolean).slice(0, 40);
    if (!ids.length) return res.json({});
    const uris = ids.map((id) => 'spotify:track:' + id);
    try {
        let flags;
        try {
            flags = await call(res.locals.userId, 'get', '/me/library/contains?uris=' + encodeURIComponent(uris.join(',')));
        } catch (e) {
            if (e.status !== 404 && e.status !== 410) throw e;
            flags = await call(res.locals.userId, 'get', '/me/tracks/contains?ids=' + ids.join(','));
        }
        const out = {};
        ids.forEach((id, i) => { out[id] = !!(flags && flags[i]); });
        res.json(out);
    } catch (e) {
        sendFailure(res, e, 'checking liked songs');
    }
};

// PUT /api/spotify/liked/:id  (like)   DELETE /api/spotify/liked/:id  (unlike)
module.exports.setLiked = async (req, res) => {
    const id = trackIdOf(req.params.id);
    if (!id) return res.status(400).json({ message: 'a spotify track is required' });
    const method = req.method === 'DELETE' ? 'delete' : 'put';
    try {
        try {
            await call(res.locals.userId, method, '/me/library?uris=' + encodeURIComponent('spotify:track:' + id));
        } catch (e) {
            if (e.status !== 404 && e.status !== 410) throw e;
            await call(res.locals.userId, method, '/me/tracks?ids=' + id);
        }
        res.json({ ok: true, liked: method === 'put' });
    } catch (e) {
        sendFailure(res, e, 'updating liked songs');
    }
};

// ── up next: the next few songs in your spotify queue ───────────────────────
// GET /api/spotify/queue → { next: [track, …] }
module.exports.upNext = async (req, res) => {
    try {
        const data = await call(res.locals.userId, 'get', '/me/player/queue');
        const seen = new Set();
        const next = ((data && data.queue) || [])
            .filter((t) => t && t.type === 'track' && t.album)
            .filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })   // spotify repeats songs when autoplay fills the queue
            .slice(0, 3)
            .map(spotify.trackToObj);
        res.json({ next });
    } catch (e) {
        sendFailure(res, e, 'reading the queue');
    }
};

// ── "not logged yet": what you played in spotify that isn't in your journal ──
// spotify's listening history (last 50 plays), one entry per song per day,
// minus anything that already has a log that day. each comes with how many
// times you played it and the mood you usually give it (if any)
function playsByDay(items, tz) {
    const groups = new Map();
    items.forEach((it) => {
        const t = it.track;
        if (!t || !t.id || t.type !== 'track') return;
        const end = Date.parse(it.played_at);              // spotify's played_at = when the listen finished
        const start = end - (Number(t.duration_ms) || 0);
        const day = dayOf(end, tz);
        const key = t.id + '|' + day;
        let g = groups.get(key);
        if (!g) { g = { track: t, day, plays: 0, first_ms: start, last_ms: end }; groups.set(key, g); }
        g.plays++;
        g.first_ms = Math.min(g.first_ms, start);
        g.last_ms = Math.max(g.last_ms, end);
    });
    return groups;
}

async function recentlyPlayed(userId) {
    const data = await call(userId, 'get', '/me/player/recently-played?limit=50');
    return (data && data.items) || [];
}

// GET /api/spotify/unlogged
module.exports.unlogged = async (req, res) => {
    const userId = res.locals.userId;
    const tz = tzOf(req);
    try {
        const groups = [...playsByDay(await recentlyPlayed(userId), tz).values()];
        if (!groups.length) return res.json([]);
        const ids = [...new Set(groups.map((g) => g.track.id))];
        const rows = await query(
            "SELECT song_id, mood, DATE_FORMAT(log_date, '%Y-%m-%d') AS day, play_count FROM Log WHERE user_id = ? AND song_id IN (?)",
            [userId, ids]
        );
        const loggedOn = new Set(rows.map((r) => r.song_id + '|' + r.day));
        const moodPlays = {};                                // song → { mood: plays }
        rows.forEach((r) => {
            const m = moodPlays[r.song_id] || (moodPlays[r.song_id] = {});
            m[r.mood] = (m[r.mood] || 0) + Number(r.play_count || 0) + 1;
        });
        const out = groups
            .filter((g) => !loggedOn.has(g.track.id + '|' + g.day))
            .sort((a, b) => b.last_ms - a.last_ms)
            .slice(0, 20)
            .map((g) => {
                const m = moodPlays[g.track.id];
                const usual = m ? Object.keys(m).sort((a, b) => m[b] - m[a])[0] : null;
                return Object.assign(spotify.trackToObj(g.track), {
                    day: g.day, plays: g.plays, last_ms: g.last_ms, usual_mood: usual
                });
            });
        res.json(out);
    } catch (e) {
        sendFailure(res, e, 'reading recently played');
    }
};

// POST /api/logs/from-spotify   body: { song_id, mood, day, title, artist, album_art, spotify_url, plays }
// logs a song from the "not logged yet" list on the day you played it, with the
// number of times spotify says you played it that day
module.exports.logFromSpotify = async (req, res) => {
    const userId = res.locals.userId;
    const b = req.body || {};
    const songId = trackIdOf(b.song_id);
    const mood = String(b.mood || '').slice(0, 50);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(b.day || '') ? b.day : null;
    if (!songId || !mood || !day) return res.status(400).json({ message: 'song_id, mood and day are required' });

    // count the plays from spotify's own history (the app's number is only a fallback)
    let g = null;
    try {
        const tz = tzOf(req);
        g = playsByDay(await recentlyPlayed(userId), tz).get(songId + '|' + day) || null;
    } catch (e) { /* spotify unavailable: use what the app sent */ }
    const t = g ? spotify.trackToObj(g.track) : null;
    const plays = g ? g.plays : Math.min(Math.max(parseInt(b.plays, 10) || 1, 1), 50);
    const now = Date.now();

    logs.recordPlay({
        user_id: userId, song_id: songId, mood,
        title:       t ? t.title : String(b.title || '').slice(0, 255),
        artist:      t ? t.artist : String(b.artist || '').slice(0, 255),
        album_art:   t ? t.albumArt : b.album_art,
        spotify_url: t ? t.spotifyUrl : b.spotify_url,
        note: '', plays, log_date: day,
        first_ms: g ? g.first_ms : now, last_ms: g ? g.last_ms : now
    }, (err, result) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (result.affectedRows === 1) lists.songAdded(userId, songId, mood, t ? t.spotifyUrl : b.spotify_url);
        res.status(201).json({ ok: true, plays });
    });
};

// ── recommendations from the genres of the songs you logged in a mood ───────
// 1. your most-played songs in the mood → their artists → each artist's genres
// 2. the genres that come up most (weighted by plays) → spotify search by genre
// 3. songs you've already logged in the mood are left out, max 2 per artist
// if spotify has no genres for those artists, it falls back to searching the
// artists themselves (the old way)

async function artistsOfTrack(id) {
    const hit = trackArtists.get(id);
    if (hit) return hit;
    const t = await catalog('/tracks/' + id);
    const ids = (t.artists || []).map((a) => a.id).filter(Boolean).slice(0, 2);
    trackArtists.set(id, ids);
    return ids;
}

async function infoOfArtist(id) {
    const hit = artistInfo.get(id);
    if (hit) return hit;
    const a = await catalog('/artists/' + id);
    const info = { name: a.name, genres: Array.isArray(a.genres) ? a.genres : [] };
    artistInfo.set(id, info);
    return info;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function searchTracks(q, offset) {
    try {
        const d = await catalog('/search', { q, type: 'track', limit: 10, offset });
        return (d.tracks && d.tracks.items) || [];
    } catch (e) { return []; }
}

// GET /api/spotify/recommendations?mood=chill
module.exports.recommendations = async (req, res) => {
    const userId = res.locals.userId;
    const mood = String(req.query.mood || '').slice(0, 50);
    if (!mood) return res.status(400).json({ message: 'mood required' });
    try {
        const rows = await query(
            'SELECT song_id, artist, SUM(play_count) AS plays FROM Log WHERE user_id = ? AND mood = ? GROUP BY song_id, artist ORDER BY plays DESC',
            [userId, mood]
        );
        if (!rows.length) return res.json({ tracks: [], genres: [], source: 'none' });
        const logged = new Set(rows.map((r) => trackIdOf(r.song_id)).filter(Boolean));

        // 1. artists of your top songs in this mood (and how much you play them)
        const top = rows.slice(0, 10);
        const artistWeight = new Map();
        await Promise.all(top.map(async (r) => {
            const id = trackIdOf(r.song_id);
            if (!id) return;
            try {
                (await artistsOfTrack(id)).forEach((a) => artistWeight.set(a, (artistWeight.get(a) || 0) + 1 + Number(r.plays || 0)));
            } catch (e) { /* skip songs spotify can't find */ }
        }));

        // 2. their genres, scored by how much you play those artists
        const artistIds = [...artistWeight.keys()].sort((a, b) => artistWeight.get(b) - artistWeight.get(a)).slice(0, 8);
        const genreScore = new Map();
        const artistNames = [];
        await Promise.all(artistIds.map(async (a) => {
            try {
                const info = await infoOfArtist(a);
                artistNames.push(info.name);
                info.genres.forEach((g) => genreScore.set(g, (genreScore.get(g) || 0) + artistWeight.get(a)));
            } catch (e) { /* skip */ }
        }));
        const genres = [...genreScore.keys()].sort((a, b) => genreScore.get(b) - genreScore.get(a)).slice(0, 4);

        // 3. search spotify by those genres (two pages each, from a random spot so refresh gives new songs)
        let found = [];
        let source = 'genre';
        if (genres.length) {
            const pages = await Promise.all(genres.flatMap((g) => {
                const start = Math.floor(Math.random() * 6) * 10;
                return [searchTracks('genre:"' + g + '"', start), searchTracks('genre:"' + g + '"', start + 10)];
            }));
            found = pages.flat();
        }
        // not enough from genres: the artists you play, plus the mood's artists' other songs
        if (found.length < 12) {
            source = genres.length ? 'mixed' : 'artist';
            const names = artistNames.length ? artistNames : [...new Set(rows.map((r) => String(r.artist || '').split(',')[0].trim()).filter(Boolean))];
            const pages = await Promise.all(names.slice(0, 4).map((n) => searchTracks('artist:"' + n + '"', Math.floor(Math.random() * 3) * 10)));
            found = found.concat(pages.flat());
        }

        const seen = new Set();
        const perArtist = new Map();
        const tracks = shuffle(found).filter((t) => {
            if (!t || !t.id || seen.has(t.id) || logged.has(t.id) || !t.album) return false;
            seen.add(t.id);
            const a = t.artists && t.artists[0] && t.artists[0].id;
            const n = perArtist.get(a) || 0;
            if (n >= 2) return false;
            perArtist.set(a, n + 1);
            return true;
        }).slice(0, 24).map(spotify.trackToObj);

        res.json({ tracks, genres: source === 'artist' ? [] : genres.slice(0, 3), source });
    } catch (e) {
        console.error('recommendations failed:', e.response ? JSON.stringify(e.response.data) : e.message);
        res.status(502).json({ message: 'couldn’t get recommendations' });
    }
};

// ── sessions saved to spotify as "session 1", "session 2", … ────────────────
const pool = require('../services/db');
pool.query(
    `CREATE TABLE IF NOT EXISTS SessionPlaylist (
        session_id  INT PRIMARY KEY,
        user_id     INT NOT NULL,
        number      INT NOT NULL,
        playlist_id VARCHAR(255) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES User(id)
    )`,
    (err) => { if (err) console.error('SessionPlaylist table setup failed:', err.message); }
);

// { session_id: { number, url } } for the history page
module.exports.sessionPlaylists = async (userId) => {
    try {
        const rows = await query('SELECT session_id, number, playlist_id FROM SessionPlaylist WHERE user_id = ?', [userId]);
        const out = {};
        rows.forEach((r) => { out[r.session_id] = { number: r.number, url: lists.playlistUrl(r.playlist_id) }; });
        return out;
    } catch (e) { return {}; }
};

async function makeSessionPlaylist(userId, name) {
    try {
        return (await call(userId, 'post', '/me/playlists', { name, public: false })).id;
    } catch (e) {
        if (e.status !== 404 && e.status !== 405) throw e;
        const me = await call(userId, 'get', '/me');
        return (await call(userId, 'post', '/users/' + encodeURIComponent(me.id) + '/playlists', { name, public: false })).id;
    }
}

// PUT /api/sessions/:session_id/spotify   body: { image?: base64 jpeg }
module.exports.saveSession = async (req, res) => {
    const userId = res.locals.userId;
    const sessionId = parseInt(req.params.session_id, 10);
    if (!sessionId) return res.status(400).json({ message: 'session required' });
    try {
        const own = await query('SELECT id FROM Session WHERE id = ? AND user_id = ?', [sessionId, userId]);
        if (!own.length) return res.status(404).json({ message: 'session not found' });
        const songs = await query('SELECT song_id, spotify_url FROM SessionLog WHERE session_id = ? ORDER BY played_at ASC, id ASC', [sessionId]);
        const uris = [...new Set(songs.map((s) => uriOf(s.spotify_url) || uriOf(s.song_id)).filter(Boolean))];
        if (!uris.length) return res.status(400).json({ message: 'this session has no songs to save' });

        const existing = await query('SELECT number, playlist_id FROM SessionPlaylist WHERE session_id = ? AND user_id = ?', [sessionId, userId]);
        let number, id;
        if (existing.length) {
            number = existing[0].number;
            id = existing[0].playlist_id;
            try { await lists.replaceAll(userId, id, uris); }
            catch (e) {
                if (e.status !== 404 && e.status !== 403) throw e;
                id = null;                                   // deleted in spotify: make it again
            }
        } else {
            const n = await query('SELECT COALESCE(MAX(number), 0) + 1 AS next FROM SessionPlaylist WHERE user_id = ?', [userId]);
            number = Number(n[0].next) || 1;
        }
        if (!id) {
            id = await makeSessionPlaylist(userId, 'session ' + number);
            await query(
                'INSERT INTO SessionPlaylist (session_id, user_id, number, playlist_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE playlist_id = VALUES(playlist_id)',
                [sessionId, userId, number, id]
            );
            await lists.replaceAll(userId, id, uris);
        }
        let cover = false;
        if (req.body && req.body.image) {
            try { await lists.uploadCover(userId, id, req.body.image); cover = true; }
            catch (e) { if (lists.needsReconnect(e)) cover = 'reconnect'; }
        }
        res.json({ number, url: lists.playlistUrl(id), songs: uris.length, cover });
    } catch (e) {
        lists.fail(res, e, 'saving session ' + sessionId + ' to spotify');
    }
};