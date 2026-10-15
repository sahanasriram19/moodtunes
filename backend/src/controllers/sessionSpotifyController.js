const lists  = require('./spotifyPlaylistController');
const extras = require('./spotifyExtrasController');

const { call, uriOf, query } = lists;

// ── session recommendations → your spotify queue ────────────────────────────
// starting a session picks songs from the genres of that mood's songs (and, if
// "mix in my songs" is on, some of your own songs from it) and adds them all to
// the queue of whatever spotify is playing right now. nothing is created in your
// library. spotify only allows this with premium and an active device, so:
//  - spotify playing (or paused) somewhere → all songs are queued straight away
//  - spotify not open yet → the app keeps retrying until it is, then queues them
//  - free account → the songs stay in the app, ▶ opens them in spotify
// either way, "save as playlist" puts the session's songs in a new private
// playlist in your spotify (free accounts can listen to it on shuffle)
// the now-playing poller then adds whatever you listen to into the session.

const MAX_QUEUE = 25;

async function ownSession(userId, sessionId) {
    const rows = await query('SELECT id, mood FROM Session WHERE id = ? AND user_id = ?', [sessionId, userId]);
    return rows[0] || null;
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
    if (status === 429) return 'rate_limited';
    return 'failed';
}

// the device spotify is playing on right now (null if spotify isn't open anywhere)
async function activeDevice(userId) {
    try {
        const p = await call(userId, 'get', '/me/player');
        return p && p.device && p.device.id ? p.device : null;
    } catch (e) {
        if (reasonOf(e) === 'no_active_device') return null;
        throw e;
    }
}

// add songs to the queue one by one, in order (spotify has no "add many" call).
// stops at the first failure and says which songs are still left
async function queueAll(userId, uris) {
    const device = await activeDevice(userId);
    if (!device) return { queued: 0, left: uris, reason: 'no_active_device' };
    let queued = 0;
    for (const uri of uris) {
        try {
            await call(userId, 'post', '/me/player/queue?uri=' + encodeURIComponent(uri));
            queued++;
        } catch (e) {
            return { queued, left: uris.slice(queued), reason: reasonOf(e), device: device.name };
        }
    }
    return { queued, left: [], device: device.name };
}

// POST /api/sessions/:session_id/spotify/start   body: { mix_mine?: bool }
// → { tracks, genres, source, uris, queued, left, reason?, device? }
module.exports.start = async (req, res) => {
    const userId = res.locals.userId;
    const sessionId = parseInt(req.params.session_id, 10);
    const b = req.body || {};
    try {
        const s = await ownSession(userId, sessionId);
        if (!s) return res.status(404).json({ message: 'session not found' });
        const rec = await extras.buildRecommendations(userId, s.mood, 20);
        const recUris = rec.tracks.map((t) => uriOf(t.spotifyUrl) || uriOf(t.id)).filter(Boolean);
        const mine = b.mix_mine === false ? [] : rec.mine.slice(0, 8);
        const uris = [...new Set(mix(recUris, mine))].slice(0, MAX_QUEUE);
        if (!uris.length) return res.status(400).json({ message: 'log a few ' + s.mood + ' songs first', tracks: [], genres: [] });

        let q;
        try { q = await queueAll(userId, uris); }
        catch (e) { q = { queued: 0, left: uris, reason: reasonOf(e) }; }

        res.json(Object.assign({ tracks: rec.tracks, genres: rec.genres, source: rec.source, uris }, q));
    } catch (e) {
        lists.fail(res, e, 'starting session ' + sessionId + ' in spotify');
    }
};

// POST /api/sessions/:session_id/spotify/queue   body: { uris: [...] }
// queue (the rest of) the songs: used to retry once spotify is open, and for "add to queue" on a new batch
module.exports.queue = async (req, res) => {
    const userId = res.locals.userId;
    const sessionId = parseInt(req.params.session_id, 10);
    const uris = [...new Set((Array.isArray(req.body && req.body.uris) ? req.body.uris : []).map(uriOf).filter(Boolean))].slice(0, MAX_QUEUE);
    if (!uris.length) return res.status(400).json({ message: 'no songs to queue' });
    try {
        if (!(await ownSession(userId, sessionId))) return res.status(404).json({ message: 'session not found' });
        res.json(await queueAll(userId, uris));
    } catch (e) {
        res.json({ queued: 0, left: uris, reason: reasonOf(e) });
    }
};

// POST /api/sessions/:session_id/spotify/play   body: { uri }
// ▶ on a recommendation: plays it now; the songs already in your queue still follow it
module.exports.playTrack = async (req, res) => {
    const userId = res.locals.userId;
    const uri = uriOf(req.body && req.body.uri);
    if (!uri) return res.status(400).json({ message: 'a spotify track is required' });
    try {
        await call(userId, 'put', '/me/player/play', { uris: [uri] });
        res.json({ playing: true });
    } catch (e) {
        res.json({ playing: false, reason: reasonOf(e) });
    }
};

// POST /api/sessions/:session_id/spotify/playlist   body: { uris: [...] }
// saves the session's songs as a new private playlist, e.g. "chill session · 15 oct"
// → { url, uri, songs }
module.exports.savePlaylist = async (req, res) => {
    const userId = res.locals.userId;
    const sessionId = parseInt(req.params.session_id, 10);
    const uris = [...new Set((Array.isArray(req.body && req.body.uris) ? req.body.uris : []).map(uriOf).filter(Boolean))].slice(0, 100);
    if (!uris.length) return res.status(400).json({ message: 'no songs to save' });
    try {
        const s = await ownSession(userId, sessionId);
        if (!s) return res.status(404).json({ message: 'session not found' });
        const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLowerCase();
        const made = await call(userId, 'post', '/me/playlists', {
            name: s.mood + ' session · ' + day, public: false,
            description: 'made with moodtunes from the genres of your ' + s.mood + ' songs'
        });
        await lists.replaceAll(userId, made.id, uris);
        res.json({ url: lists.playlistUrl(made.id), uri: 'spotify:playlist:' + made.id, songs: uris.length });
    } catch (e) {
        lists.fail(res, e, 'saving session ' + sessionId + ' as a playlist');
    }
};