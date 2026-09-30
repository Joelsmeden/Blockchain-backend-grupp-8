function authMiddleware(req, res, next) {

    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Du måste vara inloggad."
        });
    }

    req.user = req.session.user;

    next();
}

module.exports = authMiddleware;
