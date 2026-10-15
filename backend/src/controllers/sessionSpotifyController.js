const pool   = require('../services/db');
const lists  = require('./spotifyPlaylistController');
const extras = require('./spotifyExtrasController');

const { call, uriOf, query } = lists;

// ── "start in spotify" for a listening session ──────────────────────────────
// starting a session fills ONE reusable private playlist in your spotify
// ("<mood> session · moodtunes") with genre-based picks (and, if you like,
// your own songs from that mood), then:
//  - premium + spotify open somewhere → it starts playing right away
//  - otherwise → the app opens the playlist in spotify, where it plays straight
//    through, instead of opening songs one by one
// the now-playing poller then adds whatever you listen to into the session.

pool.query(
    `CREATE TABLE IF NOT EXISTS SessionQueue (
        user_id     INT PRIMARY KEY,
        playlist_id VARCHAR(255) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES User(id)
    )`,
    (err) => { if (err) console.error('SessionQueue table setup failed:', err.message); }
);

async function ownSession(userId, sessionId) {
    const rows = await query('SELECT id, mood, end_time FROM Session WHERE id = ? AND user_id = ?', [sessionId, userId]);
    return rows[0] || null;
}

async function queuePlaylist(userId, name) {
    const rows = await query('SELECT playlist_id FROM SessionQueue WHERE user_id = ?', [userId]);
    if (rows.length) return { id: rows[0].playlist_id, fresh: false };
    const made = await call(userId, 'post', '/me/playlists', {
        name, public: false, description: 'your live moodtunes session, refilled each time you start one'
    });
    await query(
        'INSERT INTO SessionQueue (user_id, playlist_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE playlist_id = VALUES(playlist_id)',
        [userId, made.id]
    );
    return { id: made.id, fresh: true };
}

async function forgetQueue(userId) {
    await query('DELETE FROM SessionQueue WHERE user_id = ?', [userId]);
}

// fill the playlist; if it was deleted in spotify, make a new one
async function fillQueue(userId, name, uris) {
    let q = await queuePlaylist(userId, name);
    try {
        await lists.replaceAll(userId, q.id, uris);
    } catch (e) {
        if (q.fresh || (e.status !== 404 && e.status !== 403)) throw e;
        await forgetQueue(userId);
        q = await queuePlaylist(userId, name);
        await lists.replaceAll(userId, q.id, uris);
    }
    if (!q.fresh) {
        await lists.renameTo(userId, q.id, name);
        await lists.follow(userId, q.id);
    }
    return q.id;
}

// interleave: two new picks, then one of yours
function mix(recs, mine) {
    const out = [];
    let r = 0, m = 0;
    while (r < recs.length || m < mine.length) {
        if (r < recs.length) out.push(recs[r++]);
        if (r < recs.length) out.push(recs[r++]);
        if (m < mine.length) out.push(mine[m++]);
    }
    return out;
}

function reasonOf(e) {
    const status = e.status || (e.response && e.response.status);
    const r = e.response && e.response.data && e.response.data.error && e.response.data.error.reason;
    if (status === 401) return 'not_connected';
    if (lists.needsReconnect(e)) return 'reconnect';
    if (status === 403 || r === 'PREMIUM_REQUIRED') return 'premium_required';
    if (status === 404 || r === 'NO_ACTIVE_DEVICE') return 'no_active_device';
    return 'failed';
}

// start playback: on the active device, or the first spotify device that's open
async function play(userId, body) {
    try {
        await call(userId, 'put', '/me/player/play', body);
        return { playing: true };
    } catch (e) {
        const reason = reasonOf(e);
        if (reason !== 'no_active_device') return { playing: false, reason };
    }
    try {
        const d = await call(userId, 'get', '/me/player/devices');
        const devices = ((d && d.devices) || []).filter((x) => x.id && !x.is_restricted);
        if (!devices.length) return { playing: false, reason: 'no_active_device' };
        const pick = devices.find((x) => x.type === 'Computer') || devices.find((x) => x.type === 'Smartphone') || devices[0];
        await call(userId, 'put', '/me/player/play?device_id=' + encodeURIComponent(pick.id), body);
        return { playing: true, device: pick.name };
    } catch (e) {
        return { playing: false, reason: reasonOf(e) };
    }
}

// POST /api/sessions/:session_id/spotify/start   body: { mix_mine?: bool }
// → { playlist_url, playlist_uri, playing, reason?, device?, tracks, genres, source }
module.exports.start = async (req, res) => {
    const userId = res.locals.userId;
    const sessionId = parseInt(req.params.session_id, 10);
    const b = req.body || {};
    try {
        const s = await ownSession(userId, sessionId);
        if (!s) return res.status(404).json({ message: 'session not found' });
        const rec = await extras.buildRecommendations(userId, s.mood, 30);
        const recUris = rec.tracks.map((t) => uriOf(t.spotifyUrl) || uriOf(t.id)).filter(Boolean);
        const mine = b.mix_mine === false ? [] : rec.mine.slice(0, 15);
        const uris = [...new Set(mix(recUris, mine))];
        if (!uris.length) return res.status(400).json({ message: 'log a few ' + s.mood + ' songs first', tracks: [], genres: [] });

        const id = await fillQueue(userId, s.mood + ' session · moodtunes', uris);
        const contextUri = 'spotify:playlist:' + id;
        const p = await play(userId, { context_uri: contextUri, offset: { position: 0 } });

        res.json(Object.assign({
            playlist_url: lists.playlistUrl(id), playlist_uri: contextUri, songs: uris.length,
            tracks: rec.tracks, genres: rec.genres, source: rec.source
        }, p));
    } catch (e) {
        lists.fail(res, e, 'starting session ' + sessionId + ' in spotify');
    }
};

// POST /api/sessions/:session_id/spotify/resume
// try playback again (used after the app opened spotify, which only then shows up as a device)
module.exports.resume = async (req, res) => {
    const userId = res.locals.userId;
    try {
        const rows = await query('SELECT playlist_id FROM SessionQueue WHERE user_id = ?', [userId]);
        if (!rows.length) return res.status(404).json({ playing: false, reason: 'no_queue' });
        // already playing something from it? leave it alone
        try {
            const now = await call(userId, 'get', '/me/player');
            if (now && now.is_playing && now.context && now.context.uri === 'spotify:playlist:' + rows[0].playlist_id) {
                return res.json({ playing: true, already: true });
            }
        } catch (e) { /* nothing playing */ }
        res.json(await play(userId, { context_uri: 'spotify:playlist:' + rows[0].playlist_id }));
    } catch (e) {
        res.json({ playing: false, reason: reasonOf(e) });
    }
};

// POST /api/sessions/:session_id/spotify/play   body: { uri }
// ▶ on a recommendation: plays it inside the session playlist (adding it if it
// isn't there), so spotify carries on through the rest of the session after it
module.exports.playTrack = async (req, res) => {
    const userId = res.locals.userId;
    const uri = uriOf(req.body && req.body.uri);
    if (!uri) return res.status(400).json({ message: 'a spotify track is required' });
    try {
        const rows = await query('SELECT playlist_id FROM SessionQueue WHERE user_id = ?', [userId]);
        if (!rows.length) return res.json(Object.assign({ in_session: false }, await play(userId, { uris: [uri] })));
        const id = rows[0].playlist_id;
        let inList = false;
        try {
            const d = await call(userId, 'get', '/playlists/' + id + '/items?limit=100&fields=items(item(uri),track(uri))');
            inList = ((d && d.items) || []).some((x) => ((x.item || x.track || {}).uri) === uri);
        } catch (e) { /* treat as not in it */ }
        if (!inList) await lists.items(userId, 'post', id, { uris: [uri] });
        const p = await play(userId, { context_uri: 'spotify:playlist:' + id, offset: { uri } });
        res.json(Object.assign({ in_session: true }, p));
    } catch (e) {
        res.json({ playing: false, reason: reasonOf(e) });
    }
};