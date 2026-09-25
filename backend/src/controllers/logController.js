const model = require('../models/logModel');

// the user's local calendar date (YYYY-MM-DD), `daysAgo` days back.
// tz_offset comes from the browser's getTimezoneOffset(): minutes BEHIND utc,
// so Singapore (UTC+8) sends -480
function localDate(tzOffset, daysAgo) {
    let offsetMin = parseInt(tzOffset, 10);
    if (isNaN(offsetMin) || Math.abs(offsetMin) > 14 * 60) offsetMin = -model.DEFAULT_OFFSET_SECONDS / 60;
    const local = new Date(Date.now() - offsetMin * 60000 - (daysAgo || 0) * 86400000);
    return local.toISOString().slice(0, 10);
}

module.exports.getAllLogs = (req, res, next) => {
    model.selectAllByUser({ user_id: res.locals.userId }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json(results);
    });
};

// Per-day version for history timeline
module.exports.getAllLogsPerDay = (req, res, next) => {
    model.selectAllByUserPerDay({ user_id: res.locals.userId }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json(results);
    });
};

// Today + yesterday — for journal recently played
module.exports.getRecentTwoDays = (req, res, next) => {
    model.selectRecentTwoDays({ user_id: res.locals.userId, since_date: localDate(req.query.tz_offset, 1) }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json(results);
    });
};

module.exports.getLogsByMood = (req, res, next) => {
    model.selectByMood({ user_id: res.locals.userId, mood: req.params.mood }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json(results);
    });
};

// POST /logs — a song played (or just added) from moodtunes.
// body: song_id, mood, title, artist, album_art, spotify_url, note,
//       tz_offset, played (false = add to the journal without counting a play)
module.exports.logSong = (req, res, next) => {
    if (!req.body.song_id || !req.body.mood) {
        return res.status(400).json({ message: 'song_id and mood are required' });
    }
    model.recordPlay({
        user_id:     res.locals.userId,
        song_id:     req.body.song_id,
        mood:        req.body.mood,
        title:       req.body.title,
        artist:      req.body.artist,
        album_art:   req.body.album_art,
        spotify_url: req.body.spotify_url,
        note:        req.body.note || '',
        plays:       req.body.played === false ? 0 : 1,
        log_date:    localDate(req.body.tz_offset)
    }, (err, result) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        // affectedRows: 1 = new row for today, 2 = today's row updated
        if (result.affectedRows === 1) return res.status(201).json({ message: 'Song logged successfully' });
        res.status(200).json({ message: 'Play count updated' });
    });
};

// POST /logs/play — replaying a song that's already in the journal.
// body: song_id, mood, tz_offset. adds one play to TODAY's log for that song,
// starting a new log if the song was last played on an earlier day
module.exports.playSong = (req, res, next) => {
    if (!req.body.song_id || !req.body.mood) {
        return res.status(400).json({ message: 'song_id and mood are required' });
    }
    const key = { user_id: res.locals.userId, song_id: req.body.song_id, mood: req.body.mood };
    model.selectLatestForSong(key, (err, rows) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (!rows.length) return res.status(404).json({ message: 'Song not found in your journal' });
        model.recordPlay(Object.assign({}, key, rows[0], {
            note: '', plays: 1, log_date: localDate(req.body.tz_offset)
        }), (err2) => {
            if (err2) return res.status(500).json({ message: 'Internal server error' });
            res.status(200).json({ message: 'Play counted' });
        });
    });
};

module.exports.updateNote = (req, res, next) => {
    model.updateNote({
        user_id: res.locals.userId,
        id:      req.params.id,
        note:    req.body.note
    }, (err) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json({ message: 'Note updated successfully' });
    });
};

module.exports.updateNoteLatest = (req, res, next) => {
    model.updateNoteLatest({
        user_id: res.locals.userId,
        song_id: req.params.song_id,
        mood:    req.params.mood,
        note:    req.body.note
    }, (err) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json({ message: 'Note updated successfully' });
    });
};

module.exports.deleteLog = (req, res, next) => {
    model.deleteLog({
        user_id: res.locals.userId,
        id:      req.params.id
    }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (results.affectedRows === 0) return res.status(404).json({ message: 'Log not found' });
        res.status(200).json({ message: 'Log deleted successfully' });
    });
};
// ── stats endpoint ────────────────────────────────────────────────────────────
module.exports.getStats = (req, res, next) => {
    const userId = res.locals.userId;
    Promise.all([
        new Promise((resolve) => model.getStats({ user_id: userId }, (err, r) => resolve(err ? [] : r))),
        new Promise((resolve) => model.getMoodBreakdown({ user_id: userId }, (err, r) => resolve(err ? [] : r))),
        new Promise((resolve) => model.getTopSongs({ user_id: userId }, (err, r) => resolve(err ? [] : r))),
        new Promise((resolve) => model.getTimeOfDay({ user_id: userId }, (err, r) => resolve(err ? [] : r))),
        new Promise((resolve) => model.getFlashback({ user_id: userId }, (err, r) => resolve(err ? [] : r)))
    ]).then(([stats, moods, topSongs, timeOfDay, flashback]) => {
        res.status(200).json({ stats: stats[0] || {}, moods, topSongs, timeOfDay: timeOfDay[0] || {}, flashback });
    }).catch(() => res.status(500).json({ message: 'Internal server error' }));
};