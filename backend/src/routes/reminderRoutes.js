const express  = require('express');
const router   = express.Router();
const reminder = require('../controllers/reminderController');
const jwt      = require('../middlewares/jwtMiddleware');

// the scheduled check (GitHub Action), protected by CRON_SECRET instead of a login
router.post('/tick', reminder.tick);
router.get('/tick',  reminder.tick);

router.get('/key',   jwt.verifyToken, reminder.getKey);
router.post('/',     jwt.verifyToken, reminder.save);
router.delete('/',   jwt.verifyToken, reminder.remove);

module.exports = router;