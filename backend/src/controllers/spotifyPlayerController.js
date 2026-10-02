const { call, uriOf } = require('./spotifyPlaylistController');

// ── playing straight from moodtunes (spotify premium) ───
// ▶ in moodtunes starts the song (or playlist) right away on the device you
// already have spotify open on — no pop-up, no switching apps. "play next" puts
// a song in your spotify queue. spotify only allows both for premium accounts;
// for free accounts the app falls back to opening the song in spotify.

function reasonOf(e) {
    const status = e.status || (e.response && e.response.status);
    const r = e.response && e.response.data && e.response.data.error && e.response.data.error.reason;
    if (status === 401) return 'not_connected';
    if (status === 403 || r === 'PREMIUM_REQUIRED') return 'premium_required';
    if (status === 404 || r === 'NO_ACTIVE_DEVICE') return 'no_active_device';
    return 'failed';
}

function failed(res, e) {
    const reason = reasonOf(e);
    const code = { not_connected: 401, premium_required: 403, no_active_device: 404 }[reason] || 502;
    if (reason === 'failed') console.error('spotify player call failed:', e.status || '', e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(code).json({ reason });
}

// a device to play on when none is active: the one spotify marks active,
// otherwise the first one that accepts commands (your laptop app, phone, speaker…)
async function pickDevice(userId) {
    const d = await call(userId, 'get', '/me/player/devices');
    const list = (d && d.devices) || [];
    return list.find((x) => x.is_active && !x.is_restricted) || list.find((x) => !x.is_restricted) || null;
}

// POST /api/spotify/play   body: { uri } — spotify:track:…, spotify:playlist:… or spotify:album:… (or an open.spotify.com link)
module.exports.play = async (req, res) => {
    const userId = res.locals.userId;
    const raw = String(req.body.uri || '');
    const m = raw.match(/(track|playlist|album)[/:]([A-Za-z0-9]{10,40})/);
    if (!m) return res.status(400).json({ message: 'a spotify track, playlist or album is required' });
    const uri = 'spotify:' + m[1] + ':' + m[2];
    const body = m[1] === 'track' ? { uris: [uri] } : { context_uri: uri };

    try {
        await call(userId, 'put', '/me/player/play', body);
        let device = null;
        try { const st = await call(userId, 'get', '/me/player'); device = st && st.device && st.device.name; } catch (e) {}
        return res.json({ ok: true, device });
    } catch (e) {
        if (reasonOf(e) !== 'no_active_device') return failed(res, e);
    }
    // nothing playing right now: wake the spotify app you have open
    try {
        const dev = await pickDevice(userId);
        if (!dev) return res.status(404).json({ reason: 'no_active_device' });
        await call(userId, 'put', '/me/player/play?device_id=' + encodeURIComponent(dev.id), body);
        res.json({ ok: true, device: dev.name });
    } catch (e) {
        failed(res, e);
    }
};

// POST /api/spotify/play-next   body: { uri } (a track)
module.exports.playNext = async (req, res) => {
    const uri = uriOf(req.body.uri);
    if (!uri) return res.status(400).json({ message: 'a spotify track is required' });
    try {
        await call(res.locals.userId, 'post', '/me/player/queue?uri=' + encodeURIComponent(uri));
        res.json({ ok: true });
    } catch (e) {
        failed(res, e);
    }
};