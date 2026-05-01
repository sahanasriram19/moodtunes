const express = require('express');
const router  = express.Router();

router.use('/auth',     require('./authRoutes'));
router.use('/logs',     require('./logRoutes'));
router.use('/sessions', require('./sessionRoutes'));
router.use('/spotify',  require('./spotifyRoutes'));

module.exports = router;
