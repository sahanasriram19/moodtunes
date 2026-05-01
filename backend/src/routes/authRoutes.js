const express  = require('express');
const router   = express.Router();
const user     = require('../controllers/userController');
const bcrypt   = require('../middlewares/bcryptMiddleware');
const jwt      = require('../middlewares/jwtMiddleware');

// POST /api/auth/register
router.post('/register',
    user.checkUsernameOrEmailExist,
    bcrypt.hashPassword,
    user.register,
    jwt.generateToken,
    jwt.sendToken
);

// POST /api/auth/login
router.post('/login',
    user.login,
    bcrypt.comparePassword,
    jwt.generateToken,
    jwt.sendToken
);

module.exports = router;
