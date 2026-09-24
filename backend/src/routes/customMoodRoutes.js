const express = require('express');
const router  = express.Router();
const mood    = require('../controllers/customMoodController');
const jwt     = require('../middlewares/jwtMiddleware');

// hidden built-in moods (declared before '/:id' so they match first)
router.get('/hidden',          jwt.verifyToken, mood.getHiddenMoods);
router.post('/hidden',         jwt.verifyToken, mood.hideMood);
router.delete('/hidden/:mood', jwt.verifyToken, mood.unhideMood);

router.get('/',       jwt.verifyToken, mood.getCustomMoods);
router.post('/',      jwt.verifyToken, mood.createCustomMood);
router.delete('/:id', jwt.verifyToken, mood.deleteCustomMood);

module.exports = router;