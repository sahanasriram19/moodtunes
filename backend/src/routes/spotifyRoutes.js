const express  = require('express');
const router   = express.Router();
const spotify  = require('../controllers/spotifyController');
const jwt      = require('../middlewares/jwtMiddleware');

router.get('/login',            spotify.redirectToSpotify);
router.get('/callback',         spotify.handleCallback);
router.get('/check',            jwt.verifyToken, spotify.checkConnection);
router.get('/refresh',          jwt.verifyToken, spotify.refreshUserToken);
router.get('/recently-played',  jwt.verifyToken, spotify.getRecentlyPlayed);
router.get('/recommendations',  jwt.verifyToken, spotify.getRecommendations);
router.get('/search',           jwt.verifyToken, spotify.searchTrack);
router.get('/premium',          jwt.verifyToken, spotify.checkPremium);
router.post('/sync-playlist',   jwt.verifyToken, spotify.syncPlaylist);
router.post('/queue',           jwt.verifyToken, spotify.addToQueue);

module.exports = router;