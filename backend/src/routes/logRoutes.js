const express = require('express');
const router  = express.Router();
const log     = require('../controllers/logController');
const jwt     = require('../middlewares/jwtMiddleware');

router.get('/',                  jwt.verifyToken, log.getAllLogs);
router.get('/perday',            jwt.verifyToken, log.getAllLogsPerDay);
router.get('/recent',            jwt.verifyToken, log.getRecentTwoDays);
router.get('/mood/:mood',        jwt.verifyToken, log.getLogsByMood);
router.post('/',                 jwt.verifyToken, log.logSong);
router.put('/:song_id/:mood',    jwt.verifyToken, log.updateNote);
router.delete('/:song_id/:mood', jwt.verifyToken, log.deleteLog);

module.exports = router;