module.exports.sendResponse = (req, res, next) => {
    res.status(res.locals.status).json({
        message: res.locals.message,
        result: res.locals.result
    });
};

module.exports.withMessage = (message, status) => {
    return (req, res, next) => {
        res.locals.message = message;
        res.locals.status = status;
        next();
    };
};
