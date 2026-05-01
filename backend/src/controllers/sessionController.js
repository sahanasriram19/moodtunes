const sessionModel = require('../models/sessionModel');

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
    sessionModel.endSession(data, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (results.affectedRows === 0) return res.status(404).json({ message: 'Session not found' });
        sessionModel.selectSessionLogs(data, (err2, logs) => {
            if (err2) return res.status(500).json({ message: 'Internal server error' });
            res.status(200).json({ message: 'Session ended', songs: logs });
        });
    });
};

module.exports.getAllSessions = (req, res, next) => {
    sessionModel.selectAllByUser({ user_id: res.locals.userId }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json(results);
    });
};

module.exports.addSongToSession = (req, res, next) => {
    if (!req.body.song_id || !req.body.session_id) {
        return res.status(400).json({ message: 'song_id and session_id are required' });
    }
    sessionModel.insertSessionLog({
        session_id:  req.body.session_id,
        song_id:     req.body.song_id,
        title:       req.body.title,
        artist:      req.body.artist,
        album_art:   req.body.album_art,
        spotify_url: req.body.spotify_url
    }, (err) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(201).json({ message: 'Song added to session' });
    });
};

module.exports.getSessionSongs = (req, res, next) => {
    sessionModel.selectSessionLogs({ session_id: req.params.session_id }, (err, results) => {
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
    sessionModel.deleteSongFromSession({ session_id: req.params.session_id, song_id: req.params.song_id }, (err) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(200).json({ message: 'Song removed from session' });
    });
};
