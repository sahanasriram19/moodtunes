const express = require('express');
const router  = express.Router();
const mood    = require('../controllers/customMoodController');
const jwt     = require('../middlewares/jwtMiddleware');

router.get('/',       jwt.verifyToken, mood.getCustomMoods);
router.post('/',      jwt.verifyToken, mood.createCustomMood);
router.delete('/:id', jwt.verifyToken, mood.deleteCustomMood);

module.exports = router;