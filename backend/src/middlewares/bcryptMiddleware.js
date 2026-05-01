const bcrypt = require('bcryptjs');

module.exports.hashPassword = (req, res, next) => {
    bcrypt.hash(req.body.password, 10, (err, hash) => {
        if (err) {
            console.error('bcrypt hash error:', err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        res.locals.hash = hash;
        next();
    });
};

module.exports.comparePassword = (req, res, next) => {
    bcrypt.compare(req.body.password, res.locals.hash, (err, isMatch) => {
        if (err) {
            console.error('bcrypt compare error:', err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        if (!isMatch) return res.status(401).json({ message: 'Wrong password' });
        next();
    });
};
