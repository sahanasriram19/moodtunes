const express  = require('express');
const router   = express.Router();
const spotify  = require('../controllers/spotifyController');
const jwt      = require('../middlewares/jwtMiddleware');
const extras   = require('../controllers/spotifyExtrasController');

router.get('/login',            spotify.redirectToSpotify);
router.get('/callback',         spotify.handleCallback);
router.get('/check',            jwt.verifyToken, spotify.checkConnection);
router.get('/refresh',          jwt.verifyToken, spotify.refreshUserToken);
router.get('/recently-played',  jwt.verifyToken, spotify.getRecentlyPlayed);
router.get('/recommendations',  jwt.verifyToken, extras.recommendations);   // from the genres of your logged songs
router.get('/search',           jwt.verifyToken, spotify.searchTrack);
router.get('/premium',          jwt.verifyToken, spotify.checkPremium);
router.get('/now-playing',      jwt.verifyToken, spotify.getNowPlaying);
router.get('/search-tracks',    jwt.verifyToken, spotify.searchTracks);
router.post('/player/:action',  jwt.verifyToken, spotify.controlPlayback);
router.post('/sync-playlist',   jwt.verifyToken, spotify.syncPlaylist);
router.get('/playlists',        jwt.verifyToken, require('../controllers/spotifyPlaylistController').listSaved);
router.put('/playlists/:mood',  jwt.verifyToken, require('../controllers/spotifyPlaylistController').savePlaylist);
router.post('/play-next',       jwt.verifyToken, require('../controllers/spotifyPlayerController').playNext);
router.post('/queue',           jwt.verifyToken, spotify.addToQueue);
router.put('/playlists/:mood/cover', jwt.verifyToken, require('../controllers/spotifyPlaylistController').saveCover);
router.get('/liked',            jwt.verifyToken, extras.likedState);
router.put('/liked/:id',        jwt.verifyToken, extras.setLiked);
router.delete('/liked/:id',     jwt.verifyToken, extras.setLiked);
router.get('/queue',            jwt.verifyToken, extras.upNext);
router.get('/unlogged',         jwt.verifyToken, extras.unlogged);

module.exports = router;