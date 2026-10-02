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
// otherwise a computer (the spotify app on your laptop), otherwise anything
// that accepts commands (phone, speaker…)
async function pickDevice(userId) {
    const d = await call(userId, 'get', '/me/player/devices');
    const list = ((d && d.devices) || []).filter((x) => !x.is_restricted);
    return list.find((x) => x.is_active) || list.find((x) => x.type === 'Computer') || list[0] || null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// did spotify really start it? (it sometimes says yes to a sleeping app and then
// does nothing). spotify may swap in another copy of the same song (a different
// release with its own id), so a new song from the start counts too.
async function started(userId, uri, isTrack, before) {
    let st = null;
    for (let i = 0; i < 5; i++) {
        await wait(600);
        try { st = await call(userId, 'get', '/me/player'); } catch (e) { return { ok: true }; }   // can't check: trust it
        if (!st || !st.is_playing) continue;
        const now = isTrack ? (st.item && st.item.uri) : (st.context && st.context.uri);
        const changed = !before || !before.uri || (st.item && st.item.uri) !== before.uri;
        const fromStart = (st.progress_ms || 0) < 8000;
        if (!now || now === uri || changed || fromStart) {
            return { ok: true, device: st.device && st.device.name };
        }
    }
    return { ok: false, device: st && st.device && st.device.name };
}

async function stateNow(userId) {
    try {
        const st = await call(userId, 'get', '/me/player');
        return st ? { uri: st.item && st.item.uri, deviceId: st.device && st.device.id } : null;
    } catch (e) { return null; }
}

// POST /api/spotify/play   body: { uri } — spotify:track:…, spotify:playlist:… or spotify:album:… (or an open.spotify.com link)
module.exports.play = async (req, res) => {
    const userId = res.locals.userId;
    const raw = String(req.body.uri || '');
    const m = raw.match(/(track|playlist|album)[/:]([A-Za-z0-9]{10,40})/);
    if (!m) return res.status(400).json({ message: 'a spotify track, playlist or album is required' });
    const uri = 'spotify:' + m[1] + ':' + m[2];
    const isTrack = m[1] === 'track';
    const body = isTrack ? { uris: [uri] } : { context_uri: uri };

    try {
        const before = await stateNow(userId);

        // 1. on whatever is playing now
        let ok = false;
        try {
            await call(userId, 'put', '/me/player/play', body);
            ok = true;
        } catch (e) {
            if (reasonOf(e) !== 'no_active_device') return failed(res, e);
        }
        if (ok) {
            const check = await started(userId, uri, isTrack, before);
            if (check.ok) return res.json({ ok: true, device: check.device || null });
        }

        // 2. nothing active (or it didn't start): play on a specific device,
        //    waking it up first if it isn't the active one
        const dev = await pickDevice(userId);
        if (!dev) return res.status(404).json({ reason: 'no_active_device' });
        if (!dev.is_active) {
            try { await call(userId, 'put', '/me/player', { device_ids: [dev.id], play: true }); } catch (e) {
                if (reasonOf(e) === 'premium_required') throw e;
            }
            await wait(800);
        }
        await call(userId, 'put', '/me/player/play?device_id=' + encodeURIComponent(dev.id), body);
        const check2 = await started(userId, uri, isTrack, before);
        if (check2.ok) return res.json({ ok: true, device: check2.device || dev.name });
        res.status(409).json({ reason: 'didnt_start', device: dev.name });
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