
function roleMiddleware(...allowedRoles) {

    return (req, res, next) => {

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Du måste vara inloggad."
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Åtkomst nekad."
            });
        }

        next();
    };
}

module.exports = roleMiddleware;
