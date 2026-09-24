const express  = require('express');
const router   = express.Router();
const playlist = require('../controllers/playlistOrderController');
const jwt      = require('../middlewares/jwtMiddleware');

router.get('/order',       jwt.verifyToken, playlist.getOrders);
router.put('/order/:mood', jwt.verifyToken, playlist.saveOrder);

module.exports = router;