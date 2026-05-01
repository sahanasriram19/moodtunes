require('dotenv').config();

const jwt = require('jsonwebtoken');

const SECRET     = process.env.JWT_SECRET_KEY;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN;
const ALGORITHM  = process.env.JWT_ALGORITHM;

module.exports.generateToken = (req, res, next) => {
    const payload = { userId: res.locals.userId, timestamp: new Date() };
    const options = { algorithm: ALGORITHM, expiresIn: EXPIRES_IN };

    jwt.sign(payload, SECRET, options, (err, token) => {
        if (err) {
            console.error('JWT sign error:', err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        res.locals.token = token;
        next();
    });
};

module.exports.sendToken = (req, res, next) => {
    res.status(200).json({ message: res.locals.message, token: res.locals.token });
};

module.exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });
        res.locals.userId = decoded.userId;
        next();
    });
};
