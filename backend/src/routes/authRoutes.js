const express  = require('express');
const router   = express.Router();
const user     = require('../controllers/userController');
const bcrypt   = require('../middlewares/bcryptMiddleware');
const jwt      = require('../middlewares/jwtMiddleware');
const limit    = require('../middlewares/rateLimit');

// wrong passwords: 10 tries per 15 minutes for each account from each network
// (a correct login doesn't use one up)
const loginLimit = limit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    onlyFailures: true,
    key: (req) => req.ip + '|' + String((req.body && req.body.username) || '').trim().toLowerCase(),
    message: 'too many login attempts'
});

// new accounts: 5 per hour from each network
const registerLimit = limit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'too many sign-ups from this network'
});

// POST /api/auth/register
router.post('/register',
    registerLimit,
    user.checkUsernameOrEmailExist,
    bcrypt.hashPassword,
    user.register,
    jwt.generateToken,
    jwt.sendToken
);

// POST /api/auth/login
router.post('/login',
    loginLimit,
    user.login,
    bcrypt.comparePassword,
    jwt.generateToken,
    jwt.sendToken
);

module.exports = router;