const express  = require('express');
const router   = express.Router();
const session  = require('../controllers/sessionController');
const jwt      = require('../middlewares/jwtMiddleware');

router.post('/',                          jwt.verifyToken, session.startSession);
router.get('/active',                     jwt.verifyToken, session.getActiveSession);
router.get('/',                           jwt.verifyToken, session.getAllSessions);
router.get('/:session_id/songs',          jwt.verifyToken, session.getSessionSongs);
router.put('/:session_id/end',            jwt.verifyToken, session.endSession);
router.put('/:session_id/spotify',        jwt.verifyToken, require('../controllers/spotifyExtrasController').saveSession);
router.post('/:session_id/spotify/start',  jwt.verifyToken, require('../controllers/sessionSpotifyController').start);
router.post('/:session_id/spotify/queue',  jwt.verifyToken, require('../controllers/sessionSpotifyController').queue);
router.post('/:session_id/spotify/play',   jwt.verifyToken, require('../controllers/sessionSpotifyController').playTrack);
router.post('/songs',                     jwt.verifyToken, session.addSongToSession);
router.delete('/:session_id',             jwt.verifyToken, session.deleteSession);
router.delete('/:session_id/songs/:song_id', jwt.verifyToken, session.deleteSongFromSession);

module.exports = router;