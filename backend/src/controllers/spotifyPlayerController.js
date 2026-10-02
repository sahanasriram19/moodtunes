const { call, uriOf } = require('./spotifyPlaylistController');

// ── play next (spotify premium) ─────────────────────────
// "play next" in moodtunes puts a song in your spotify queue, so it plays after
// the current one. spotify only allows this for premium accounts.

function reasonOf(e) {
    const status = e.status || (e.response && e.response.status);
    const r = e.response && e.response.data && e.response.data.error && e.response.data.error.reason;
    if (status === 401) return 'not_connected';
    if (status === 403 || r === 'PREMIUM_REQUIRED') return 'premium_required';
    if (status === 404 || r === 'NO_ACTIVE_DEVICE') return 'no_active_device';
    return 'failed';
}

// POST /api/spotify/play-next   body: { uri } (a track)
module.exports.playNext = async (req, res) => {
    const uri = uriOf(req.body.uri);
    if (!uri) return res.status(400).json({ message: 'a spotify track is required' });
    try {
        await call(res.locals.userId, 'post', '/me/player/queue?uri=' + encodeURIComponent(uri));
        res.json({ ok: true });
    } catch (e) {
        const reason = reasonOf(e);
        if (reason === 'failed') console.error('play next failed:', e.status || '', e.response ? JSON.stringify(e.response.data) : e.message);
        res.status({ not_connected: 401, premium_required: 403, no_active_device: 404 }[reason] || 502).json({ reason });
    }
};