const axios   = require('axios');
const spotify = require('./spotifyController');
const lists   = require('./spotifyPlaylistController');
const logs    = require('../models/logModel');
const playlists = require('./playlistOrderController');

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
        playlists.restoreIfRemoved(userId, songId, mood, t ? t.spotifyUrl : b.spotify_url);
        res.status(201).json({ ok: true, plays });
    });
};

// ── when a session ends: catch up on what spotify played during it ──────────
// - songs played while the session ran but missed by the app (tab closed, phone
//   asleep) are added to the session
// - songs you "+ add"-ed from the recommendations are only logged to your journal
//   if spotify says they were actually played during the session
// returns { added: n, logged: [song ids] }
module.exports.syncSessionPlays = async (userId, sessionId, mood, sinceMs, pending, tz) => {
    const out = { added: 0, logged: [] };
    let items;
    try { items = await recentlyPlayed(userId); } catch (e) { return out; }
    const during = items.filter((it) => it.track && it.track.id && it.track.type === 'track' && Date.parse(it.played_at) >= sinceMs);
    if (!during.length) return out;

    // 1. missing session songs
    try {
        const have = new Set((await query('SELECT song_id FROM SessionLog WHERE session_id = ?', [sessionId])).map((r) => r.song_id));
        const seen = new Set();
        for (const it of during.slice().sort((a, b) => Date.parse(a.played_at) - Date.parse(b.played_at))) {
            const t = it.track;
            if (have.has(t.id) || seen.has(t.id)) continue;
            seen.add(t.id);
            const o = spotify.trackToObj(t);
            const startSec = (Date.parse(it.played_at) - (Number(t.duration_ms) || 0)) / 1000;
            await query(
                'INSERT INTO SessionLog (session_id, song_id, title, artist, album_art, spotify_url, played_at)' +
                ' SELECT id, ?, ?, ?, ?, ?, FROM_UNIXTIME(?) FROM Session WHERE id = ? AND user_id = ?',
                [o.id, o.title, o.artist, o.albumArt, o.spotifyUrl, Math.max(startSec, sinceMs / 1000), sessionId, userId]
            );
            out.added++;
        }
    } catch (e) { console.error('session catch-up failed:', e.message); }

    // 2. "+ add"-ed songs that really were played → journal, with spotify's play count
    const wanted = new Map((Array.isArray(pending) ? pending : []).map((p) => [trackIdOf(p.song_id), p]).filter((x) => x[0]));
    if (!wanted.size) return out;
    const groups = playsByDay(during.filter((it) => wanted.has(it.track.id)), tz);
    for (const g of groups.values()) {
        const p = wanted.get(g.track.id);
        const t = spotify.trackToObj(g.track);
        const m = String(p.mood || mood || '').slice(0, 50);
        if (!m) continue;
        await new Promise((resolve) => logs.recordPlay({
            user_id: userId, song_id: t.id, mood: m, title: t.title, artist: t.artist,
            album_art: t.albumArt, spotify_url: t.spotifyUrl, note: '', plays: g.plays,
            log_date: g.day, first_ms: g.first_ms, last_ms: g.last_ms
        }, (err, result) => {
            if (!err) {
                out.logged.push(t.id);
                if (result && result.affectedRows === 1) lists.songAdded(userId, t.id, m, t.spotifyUrl);
                playlists.restoreIfRemoved(userId, t.id, m, t.spotifyUrl);
            }
            resolve();
        }));
    }
    return out;
};

// ── recommendations from the GENRES of the songs you logged in a mood ───────
// 1. your most-played songs in the mood → their artists → each artist's genres
//    (spotify's genres first; many artists have none on spotify, so last.fm's
//    genre tags fill the gap when LASTFM_API_KEY is set)
// 2. the genres that come up most (weighted by plays) → songs in those genres
//    (spotify search by genre, then last.fm's top songs for the genre)
// 3. songs you've already logged in the mood are left out, max 2 per artist
// only if no genre can be found at all does it fall back to your artists

const LASTFM_KEY = process.env.LASTFM_API_KEY || '';
const LASTFM = 'https://ws.audioscrobbler.com/2.0/';
// last.fm tags that aren't genres
const NOT_GENRE = /^(seen live|favou?rites?|my |love|awesome|beautiful|best|cool|amazing|good|great|albums? i own|under \d|spotify|[0-9]{2,4}s?$|male vocalists?|female vocalists?|singer-songwriter$|american|british|uk|usa|english|korean|japanese|canadian|australian|swedish|german|french)/i;

const lastfmTags = lru(3000);          // artist name → [genre, …]

async function lastfm(params) {
    if (!LASTFM_KEY) return null;
    try {
        const r = await axios.get(LASTFM, { params: Object.assign({ api_key: LASTFM_KEY, format: 'json' }, params), timeout: 10000 });
        return r.data;
    } catch (e) { return null; }
}

async function lastfmGenresOf(name) {
    const key = String(name || '').toLowerCase();
    if (!key || !LASTFM_KEY) return [];
    const hit = lastfmTags.get(key);
    if (hit) return hit;
    const d = await lastfm({ method: 'artist.gettoptags', artist: name, autocorrect: 1 });
    const tags = ((d && d.toptags && d.toptags.tag) || [])
        .filter((t) => Number(t.count) >= 10)
        .map((t) => String(t.name || '').toLowerCase().trim())
        .filter((t) => t && t.length <= 30 && !NOT_GENRE.test(t))
        .slice(0, 4);
    lastfmTags.set(key, tags);
    return tags;
}

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

async function searchTracks(q, offset, limit) {
    try {
        const d = await catalog('/search', { q, type: 'track', limit: limit || 10, offset: offset || 0 });
        return (d.tracks && d.tracks.items) || [];
    } catch (e) { return []; }
}

// what each built-in mood sounds like: spotify genre names (for genre: search)
// and last.fm mood tags (for "songs tagged chill/sad/..."). custom moods use their own name as the tag
const MOOD_PROFILE = {
    happy:      { genres: ['dance pop', 'funk', 'indie pop', 'disco', 'afrobeats'],        tags: ['happy', 'feel good', 'upbeat'] },
    sad:        { genres: ['indie folk', 'acoustic', 'singer-songwriter', 'sad', 'piano'],  tags: ['sad', 'melancholy', 'melancholic'] },
    hype:       { genres: ['trap', 'hip hop', 'edm', 'drill', 'phonk'],                    tags: ['energetic', 'hype', 'party'] },
    heartbreak: { genres: ['r&b', 'soul', 'sad', 'pop', 'alt r&b'],                         tags: ['heartbreak', 'breakup', 'sad'] },
    nostalgic:  { genres: ['2000s', '90s', 'classic rock', 'motown', 'synthpop'],            tags: ['nostalgic', 'nostalgia', '00s'] },
    focused:    { genres: ['lo-fi', 'ambient', 'classical', 'post-rock', 'chillhop'],         tags: ['instrumental', 'study', 'focus'] },
    chill:      { genres: ['lo-fi', 'chillhop', 'bedroom pop', 'neo soul', 'chillwave'],      tags: ['chill', 'mellow', 'chillout'] }
};
function moodProfile(mood) {
    const m = String(mood || '').toLowerCase();
    return MOOD_PROFILE[m] || { genres: [], tags: [m] };
}

// does an artist's genre list overlap with yours? ("indie pop" matches "indie")
function genreMatch(artistGenres, yours) {
    return artistGenres.some((g) => yours.some((y) => g === y || g.includes(y) || y.includes(g)));
}

// last.fm's top songs for a mood tag, kept only when the artist is in one of your genres,
// then looked up on spotify. this is the "your genre AND this mood" bucket
async function moodInYourGenres(tags, yourGenres, howMany) {
    if (!LASTFM_KEY || !tags.length || !yourGenres.length) return [];
    const pages = await Promise.all(tags.slice(0, 2).map((tag) =>
        lastfm({ method: 'tag.gettoptracks', tag, limit: 100, page: 1 + Math.floor(Math.random() * 3) })));
    const candidates = shuffle(pages.flatMap((d) => (d && d.tracks && d.tracks.track) || [])
        .map((t) => ({ name: t.name, artist: t.artist && (t.artist.name || t.artist['#text']) }))
        .filter((t) => t.name && t.artist));
    const artists = [...new Set(candidates.map((c) => c.artist))].slice(0, 45);
    const ok = new Set();
    await Promise.all(artists.map(async (a) => { if (genreMatch(await lastfmGenresOf(a), yourGenres)) ok.add(a); }));
    const picked = [];
    const perArtist = new Map();
    for (const c of candidates) {
        if (!ok.has(c.artist) || (perArtist.get(c.artist) || 0) >= 1) continue;
        perArtist.set(c.artist, 1);
        picked.push(c);
        if (picked.length >= howMany) break;
    }
    const found = await Promise.all(picked.map(async (c) =>
        (await searchTracks('track:"' + c.name + '" artist:"' + c.artist + '"', 0, 1))[0] || null));
    return found.filter(Boolean);
}

// the recommendation list itself, used by the session page and by "start in spotify".
// a blend of three kinds of picks, each tagged with why it's there:
//   mood  — songs that fit the mood and your genres (last.fm), or the mood's own genres
//   genre — songs from the genres of the artists you log in this mood
//   artist — other songs by the artists you log in this mood
async function buildRecommendations(userId, mood, max) {
    max = max || 24;
    const rows = await query(
        'SELECT song_id, artist, SUM(play_count) AS plays FROM Log WHERE user_id = ? AND mood = ? GROUP BY song_id, artist ORDER BY plays DESC',
        [userId, mood]
    );
    if (!rows.length) return { tracks: [], genres: [], source: 'none', mine: [] };
    const logged = new Set(rows.map((r) => trackIdOf(r.song_id)).filter(Boolean));
    const profile = moodProfile(mood);

    // 1. artists of your top songs in this mood (and how much you play them)
    const top = rows.slice(0, 12);
    const artistWeight = new Map();
    await Promise.all(top.map(async (r) => {
        const id = trackIdOf(r.song_id);
        if (!id) return;
        try {
            (await artistsOfTrack(id)).forEach((a) => artistWeight.set(a, (artistWeight.get(a) || 0) + 1 + Number(r.plays || 0)));
        } catch (e) { /* skip songs spotify can't find */ }
    }));

    // 2. their genres (spotify, else last.fm), scored by how much you play those artists
    const artistIds = [...artistWeight.keys()].sort((a, b) => artistWeight.get(b) - artistWeight.get(a)).slice(0, 10);
    const genreScore = new Map();
    const artistNames = [];
    await Promise.all(artistIds.map(async (a) => {
        try {
            const info = await infoOfArtist(a);
            artistNames.push(info.name);
            let genres = info.genres;
            if (!genres.length) genres = await lastfmGenresOf(info.name);
            genres.forEach((g, i) => genreScore.set(g, (genreScore.get(g) || 0) + artistWeight.get(a) / (1 + i * 0.5)));
        } catch (e) { /* skip */ }
    }));
    let genres = [...genreScore.keys()].sort((a, b) => genreScore.get(b) - genreScore.get(a)).slice(0, 4);
    if (!artistNames.length) artistNames.push(...new Set(rows.map((r) => String(r.artist || '').split(',')[0].trim()).filter(Boolean)));

    // 3. the three buckets, fetched together
    const genrePage = (g) => searchTracks('genre:"' + g + '"', Math.floor(Math.random() * 6) * 10);
    const [moodHits, genreHits, moodGenreHits, artistHits] = await Promise.all([
        moodInYourGenres(profile.tags, genres, 10),
        Promise.all(genres.flatMap((g) => [genrePage(g), genrePage(g)])).then((p) => p.flat()),
        // the mood's own genres: always available, even with no last.fm key and no genres on your artists
        Promise.all(shuffle(profile.genres.slice()).slice(0, 3).map(genrePage)).then((p) => p.flat()),
        Promise.all(shuffle(artistNames.slice()).slice(0, 4).map((n) => searchTracks('artist:"' + n + '"', Math.floor(Math.random() * 3) * 10))).then((p) => p.flat())
    ]);

    // 4. blend: about 40% mood, 35% genre, 25% artist; any bucket that comes up short is filled from the others
    const seen = new Set();
    const perArtist = new Map();
    const take = (list, why, n) => {
        const out = [];
        for (const t of shuffle(list.slice())) {
            if (out.length >= n) break;
            if (!t || !t.id || seen.has(t.id) || logged.has(t.id) || !t.album) continue;
            const a = t.artists && t.artists[0] && t.artists[0].id;
            if ((perArtist.get(a) || 0) >= 2) continue;
            seen.add(t.id);
            perArtist.set(a, (perArtist.get(a) || 0) + 1);
            out.push(Object.assign(spotify.trackToObj(t), { why }));
        }
        return out;
    };
    const moodWhy  = mood;
    const moodPool = moodHits.concat(moodGenreHits);
    let picks = [
        ...take(moodPool, 'mood', Math.round(max * 0.4)),
        ...take(genreHits, 'genre', Math.round(max * 0.35)),
        ...take(artistHits, 'artist', Math.round(max * 0.25))
    ];
    if (picks.length < max) picks = picks.concat(take(moodPool.concat(genreHits, artistHits), 'mix', max - picks.length));

    // interleave so the kinds are spread through the list (and the queue)
    const byKind = { mood: [], genre: [], artist: [], mix: [] };
    picks.forEach((p) => byKind[p.why].push(p));
    const tracks = [];
    while (tracks.length < picks.length) {
        ['mood', 'genre', 'mood', 'artist', 'genre', 'mix'].forEach((k) => { if (byKind[k].length) tracks.push(byKind[k].shift()); });
    }
    tracks.forEach((t) => { t.why = t.why === 'mood' ? moodWhy : t.why === 'genre' ? 'your genres' : t.why === 'artist' ? 'your artists' : ''; });

    const source = genreHits.length ? 'genre' : moodPool.length ? 'mood' : 'artist';
    const mine = rows.map((r) => uriOf(r.song_id)).filter(Boolean);
    // genres shown on the page: yours first, then the mood's
    const shown = genres.slice(0, 3);
    if (shown.length < 3) profile.genres.forEach((g) => { if (shown.length < 3 && shown.indexOf(g) === -1) shown.push(g); });
    return { tracks: tracks.slice(0, max), genres: shown, yourGenres: genres.slice(0, 3), mood, source, mine };
}
module.exports.buildRecommendations = buildRecommendations;

// GET /api/spotify/recommendations?mood=chill
module.exports.recommendations = async (req, res) => {
    const mood = String(req.query.mood || '').slice(0, 50);
    if (!mood) return res.status(400).json({ message: 'mood required' });
    try {
        const r = await buildRecommendations(res.locals.userId, mood);
        res.json({ tracks: r.tracks, genres: r.genres, yourGenres: r.yourGenres, source: r.source });
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
        let rows = await query('SELECT session_id, number, playlist_id FROM SessionPlaylist WHERE user_id = ?', [userId]);
        // deleted in spotify: forget it, so "save to spotify" shows again
        const still = await lists.inLibrary(userId, rows.map((r) => r.playlist_id));
        if (still) {
            const gone = rows.filter((r) => !still.has(r.playlist_id));
            if (gone.length) {
                await query('DELETE FROM SessionPlaylist WHERE user_id = ? AND playlist_id IN (?)', [userId, gone.map((r) => r.playlist_id)]);
                rows = rows.filter((r) => still.has(r.playlist_id));
            }
        }
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
            try { await lists.replaceAll(userId, id, uris); await lists.follow(userId, id); }
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