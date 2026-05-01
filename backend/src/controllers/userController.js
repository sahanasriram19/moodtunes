const model = require('../models/userModel');

module.exports.checkUsernameOrEmailExist = (req, res, next) => {
    if (!req.body.username || !req.body.email || !req.body.password) {
        return res.status(400).json({ message: 'username, email and password are required' });
    }
    model.checkUsernameOrEmailExist({ username: req.body.username, email: req.body.email }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (results.length > 0) return res.status(409).json({ message: 'Username or email already exists' });
        next();
    });
};

module.exports.register = (req, res, next) => {
    model.insertUser({ username: req.body.username, email: req.body.email, password: res.locals.hash }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.locals.userId = results.insertId;
        res.locals.message = 'User ' + req.body.username + ' created successfully';
        next();
    });
};

module.exports.login = (req, res, next) => {
    if (!req.body.username || !req.body.password) {
        return res.status(400).json({ message: 'username and password are required' });
    }
    model.selectByUsername({ username: req.body.username }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (results.length === 0) return res.status(404).json({ message: 'User not found' });
        res.locals.userId = results[0].id;
        res.locals.hash = results[0].password;
        next();
    });
};

module.exports.getUserById = (req, res, next) => {
    model.selectById({ user_id: res.locals.userId }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        if (results.length === 0) return res.status(404).json({ message: 'User not found' });
        res.status(200).json(results[0]);
    });
};
