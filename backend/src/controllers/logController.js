const model = require('../models/logModel');

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
    model.selectRecentTwoDays({ user_id: res.locals.userId }, (err, results) => {
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

module.exports.logSong = (req, res, next) => {
    if (!req.body.song_id || !req.body.mood) {
        return res.status(400).json({ message: 'song_id and mood are required' });
    }

    const data = {
        user_id:     res.locals.userId,
        song_id:     req.body.song_id,
        mood:        req.body.mood,
        title:       req.body.title,
        artist:      req.body.artist,
        album_art:   req.body.album_art,
        spotify_url: req.body.spotify_url,
        note:        req.body.note || ''
    };

    // check if already logged today
    model.selectTodayLog(data, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (results.length > 0) {
            // already logged today — just increment today's count
            model.incrementPlayCount(data, (err2) => {
                if (err2) return res.status(500).json({ message: 'Internal server error' });
                res.status(200).json({ message: 'Play count updated' });
            });
        } else {
            // not logged today — create a new row for today
            model.insertLog(data, (err2) => {
                if (err2) return res.status(500).json({ message: 'Internal server error' });
                res.status(201).json({ message: 'Song logged successfully' });
            });
        }
    });
};

module.exports.updateNote = (req, res, next) => {
    model.updateNote({
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
        song_id: req.params.song_id,
        mood:    req.params.mood
    }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (results.affectedRows === 0) return res.status(404).json({ message: 'Log not found' });
        res.status(200).json({ message: 'Log deleted successfully' });
    });
};