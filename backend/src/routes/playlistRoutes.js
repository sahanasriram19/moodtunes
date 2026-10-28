const express  = require('express');
const router   = express.Router();
const playlist = require('../controllers/playlistOrderController');
const jwt      = require('../middlewares/jwtMiddleware');

router.get('/order',       jwt.verifyToken, playlist.getOrders);
router.put('/order/:mood', jwt.verifyToken, playlist.saveOrder);

// songs taken out of a playlist (their logs and history are kept)
router.get('/removed',     jwt.verifyToken, playlist.getRemoved);
router.post('/removed',    jwt.verifyToken, playlist.removeSong);

module.exports = router;