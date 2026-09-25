const model   = require('../models/logModel');
const spotify = require('./spotifyController');
const axios   = require('axios');

// the browser sends its timezone with every request (X-Timezone-Offset header);
// older app versions sent tz_offset in the body or query instead
function tzFrom(req) {
    const h = req.get('X-Timezone-Offset');
    if (h !== undefined && h !== '') return h;
    if (req.body && req.body.tz_offset !== undefined) return req.body.tz_offset;
    return req.query ? req.query.tz_offset : undefined;
}

// the user's local calendar date (YYYY-MM-DD), `daysAgo` days back.
// the offset is the browser's getTimezoneOffset(): minutes BEHIND utc,
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
    model.selectRecentTwoDays({ user_id: res.locals.userId, since_date: localDate(tzFrom(req), 1) }, (err, results) => {
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
        log_date:    localDate(tzFrom(req))
    }, (err, result) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (req.body.played !== false) startLaunch(res.locals.userId, req, req.body.song_id, req.body.mood);
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
            note: '', plays: 1, log_date: localDate(tzFrom(req))
        }), (err2) => {
            if (err2) return res.status(500).json({ message: 'Internal server error' });
            startLaunch(res.locals.userId, req, key.song_id, key.mood);
            res.status(200).json({ message: 'Play counted' });
        });
    });
};

// ── loops ─────────────────────────────────────────────────────────────────
// a song opened from moodtunes keeps counting while spotify repeats it
function startLaunch(userId, req, songId, mood) {
    let tz = parseInt(tzFrom(req), 10);
    if (isNaN(tz) || Math.abs(tz) > 14 * 60) tz = -model.DEFAULT_OFFSET_SECONDS / 60;
    model.startLaunch({ user_id: userId, song_id: songId, mood: mood, tz_offset: tz, launched_ms: Date.now() }, (err) => {
        if (err) console.error('could not record launch:', err.message);
    });
}

// spotify's listening history after `afterMs` (up to 50 plays), oldest first
function recentPlays(userId, afterMs, callback) {
    const url = 'https://api.spotify.com/v1/me/player/recently-played?limit=50&after=' + Math.floor(afterMs);
    spotify.getUserToken(userId, (err, token) => {
        if (err) return callback(err);
        const get = (t, retried) => axios.get(url, { headers: { 'Authorization': 'Bearer ' + t } })
            .then((r) => {
                const items = (r.data && r.data.items) || [];
                items.sort((a, b) => Date.parse(a.played_at) - Date.parse(b.played_at));
                callback(null, items);
            })
            .catch((e) => {
                if (!retried && e.response && e.response.status === 401) {
                    return spotify.refreshToken(userId, (e2, fresh) => e2 ? callback(e2) : get(fresh, true));
                }
                callback(e);
            });
        get(token, false);
    });
}

const STARTS_WITHIN_MS = 15 * 60000;       // the song you opened should start playing within 15 min
const LOOP_EXPIRES_MS  = 12 * 3600000;     // stop watching a loop after 12 quiet hours

// works out how many repeats spotify played since the last check.
// the first play of the song after you opened it is the play the app already
// counted; every play of the same song after that, with nothing else in between,
// is one more play. the first different song ends the run.
function walkLoop(launch, items, now) {
    const songId = launch.song_id;
    const launched = Number(launch.launched_ms);
    let until = Number(launch.counted_until_ms);
    let started = !!launch.started;
    let open = true;
    let firstListenEnd = null;          // when the listen started from the app finished
    const repeats = [];                 // [{ start, end }] of each counted repeat
    for (const it of items) {
        const t = Date.parse(it.played_at);             // spotify's played_at = when the listen finished
        if (!(t > until) || !it.track) continue;
        const same = it.track.id === songId || (it.track.linked_from && it.track.linked_from.id === songId);
        until = t;
        if (!started) {
            if (same) { started = true; firstListenEnd = t; continue; }   // the listen the app already counted
            if (t - launched > STARTS_WITHIN_MS) { open = false; break; }
            continue;                                           // the song that was playing before you switched
        }
        if (same) repeats.push({ start: t - (Number(it.track.duration_ms) || 0), end: t });
        else { open = false; break; }
    }
    if (open && !started && now - launched > STARTS_WITHIN_MS) open = false;
    if (open && now - Math.max(until, launched) > LOOP_EXPIRES_MS) open = false;
    return { until, started, open, repeats, firstListenEnd };
}
module.exports._walkLoop = walkLoop;   // exported for tests

// POST /logs/sync-loops — called by the app when it opens / comes back into view
module.exports.syncLoops = (req, res, next) => {
    const userId = res.locals.userId;
    model.getOpenLaunch({ user_id: userId }, (err, rows) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (!rows.length) return res.status(200).json({ added: 0 });
        const launch = rows[0];
        const now = Date.now();
        recentPlays(userId, Number(launch.counted_until_ms), (err2, items) => {
            // spotify not connected or unavailable: try again next time
            if (err2) return res.status(200).json({ added: 0 });
            const w = walkLoop(launch, items, now);
            const changed = w.until !== Number(launch.counted_until_ms) || w.started !== !!launch.started || !w.open;
            if (!changed) return res.status(200).json({ added: 0 });
            model.advanceLaunch({
                id: launch.id, old_until_ms: Number(launch.counted_until_ms), old_started: !!launch.started,
                until_ms: w.until, started: w.started, is_open: w.open
            }, (err3, r) => {
                // another check already handled these
                if (err3 || r.affectedRows !== 1) return res.status(200).json({ added: 0 });
                if (!w.repeats.length && !w.firstListenEnd) return res.status(200).json({ added: 0 });
                const key = { user_id: userId, song_id: launch.song_id, mood: launch.mood };
                const dayOf = (ms) => new Date(ms - Number(launch.tz_offset) * 60000).toISOString().slice(0, 10);
                const tasks = [];
                // the listen started from the app finished: that day's time now runs to its end
                if (w.firstListenEnd) {
                    tasks.push((done) => model.extendLastPlayed(Object.assign({}, key, {
                        log_date: dayOf(Number(launch.launched_ms)), end_ms: w.firstListenEnd }), done));
                }
                if (w.repeats.length) {
                    tasks.push((done) => model.selectLatestForSong(key, (err4, songRows) => {
                        if (err4 || !songRows.length) return done();
                        // group repeats by the calendar day they finished on
                        const byDay = {};
                        w.repeats.forEach((p) => {
                            const day = dayOf(p.end);
                            const d = byDay[day] || (byDay[day] = { plays: 0, first: p.start, last: p.end });
                            d.plays++; d.first = Math.min(d.first, p.start); d.last = Math.max(d.last, p.end);
                        });
                        const days = Object.keys(byDay);
                        let left = days.length;
                        days.forEach((day) => model.recordPlay(Object.assign({}, key, songRows[0], {
                            note: '', plays: byDay[day].plays, log_date: day, first_ms: byDay[day].first, last_ms: byDay[day].last
                        }), () => { if (--left === 0) done(songRows[0].title); }));
                    }));
                }
                let left = tasks.length, title = null;
                tasks.forEach((task) => task((t) => {
                    if (t) title = t;
                    if (--left === 0) {
                        // updated: listening times changed, so the app refreshes even with no new plays
                        res.status(200).json({ added: w.repeats.length, updated: true, song_id: launch.song_id, mood: launch.mood, title: title });
                    }
                }));
            });
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