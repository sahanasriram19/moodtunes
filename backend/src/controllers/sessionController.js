const sessionModel = require('../models/sessionModel');
const pool = require('../services/db');

// how long a session was paused (nothing playing on spotify), so its length is listening time
pool.query('ALTER TABLE Session ADD COLUMN paused_seconds INT NOT NULL DEFAULT 0', (err) => {
    if (err && !/duplicate column/i.test(err.message)) console.error('Session.paused_seconds setup failed:', err.message);
});

module.exports.startSession = (req, res, next) => {
    if (!req.body.mood) return res.status(400).json({ message: 'mood is required' });
    sessionModel.insertSession({ user_id: res.locals.userId, mood: req.body.mood }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(201).json({ message: 'Session started', session_id: results.insertId, mood: req.body.mood });
    });
};

module.exports.getActiveSession = (req, res, next) => {
    sessionModel.selectActiveSession({ user_id: res.locals.userId }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (results.length === 0) return res.status(404).json({ message: 'No active session' });
        res.status(200).json(results[0]);
    });
};

module.exports.endSession = (req, res, next) => {
    const data = { session_id: req.params.session_id, user_id: res.locals.userId };
    const body = req.body || {};
    sessionModel.endSession(data, async (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (results.affectedRows === 0) return res.status(404).json({ message: 'Session not found' });

        // paused time sent by the app (never more than the session's own length)
        const pausedSec = Math.max(0, Math.round(Number(body.paused_ms) / 1000) || 0);
        if (pausedSec) {
            await new Promise((ok) => pool.query(
                'UPDATE Session SET paused_seconds = LEAST(?, GREATEST(0, TIMESTAMPDIFF(SECOND, start_time, end_time))) WHERE id = ? AND user_id = ?',
                [pausedSec, data.session_id, data.user_id], () => ok()));
        }

        // catch up on spotify: songs played during the session, and "+ add"-ed songs that got played
        let sync = { added: 0, logged: [] };
        try {
            const rows = await new Promise((ok, no) => pool.query(
                'SELECT mood, start_time FROM Session WHERE id = ? AND user_id = ?', [data.session_id, data.user_id],
                (e, r) => e ? no(e) : ok(r)));
            if (rows.length) {
                let since = Date.parse(body.since);
                const dbStart = new Date(rows[0].start_time).getTime();
                if (isNaN(since) || Math.abs(since - dbStart) > 6 * 3600 * 1000) since = dbStart;   // trust the client's clock unless it's way off
                let tz = parseInt(req.get('X-Timezone-Offset'), 10);
                if (isNaN(tz) || Math.abs(tz) > 14 * 60) tz = 0;
                if (!isNaN(since)) {
                    sync = await require('./spotifyExtrasController').syncSessionPlays(
                        data.user_id, data.session_id, rows[0].mood, since, body.pending, tz);
                }
            }
        } catch (e) { /* spotify unavailable: end the session anyway */ }

        sessionModel.selectSessionLogs(data, (err2, logs) => {
            if (err2) return res.status(500).json({ message: 'Internal server error' });
            res.status(200).json({ message: 'Session ended', songs: logs, logged: sync.logged, caught_up: sync.added });
        });
    });
};

module.exports.getAllSessions = (req, res, next) => {
    sessionModel.selectAllByUser({ user_id: res.locals.userId }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        // sessions saved to spotify ("session 3") come with their playlist
        require('./spotifyExtrasController').sessionPlaylists(res.locals.userId).then((saved) => {
            results.forEach((s) => { if (saved[s.id]) s.spotify = saved[s.id]; });
            res.status(200).json(results);
        });
    });
};

module.exports.addSongToSession = (req, res, next) => {
    if (!req.body.song_id || !req.body.session_id) {
        return res.status(400).json({ message: 'song_id and session_id are required' });
    }
    sessionModel.insertSessionLog({
        user_id:     res.locals.userId,
        session_id:  req.body.session_id,
        song_id:     req.body.song_id,
        title:       req.body.title,
        artist:      req.body.artist,
        album_art:   req.body.album_art,
        spotify_url: req.body.spotify_url
    }, (err, result) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (!result.affectedRows) return res.status(404).json({ message: 'Session not found' });
        res.status(201).json({ message: 'Song added to session' });
    });
};

module.exports.getSessionSongs = (req, res, next) => {
    sessionModel.selectSessionLogs({ session_id: req.params.session_id, user_id: res.locals.userId }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json(results);
    });
};

module.exports.deleteSession = (req, res, next) => {
    sessionModel.deleteSession({ session_id: req.params.session_id, user_id: res.locals.userId }, (err) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json({ message: 'Session deleted successfully' });
    });
};

module.exports.deleteSongFromSession = (req, res, next) => {
    sessionModel.deleteSongFromSession({ session_id: req.params.session_id, song_id: req.params.song_id, user_id: res.locals.userId }, (err) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json({ message: 'Song removed from session' });
    });
};