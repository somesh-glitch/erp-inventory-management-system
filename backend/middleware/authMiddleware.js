const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const logger = require('../utils/logger');

// Protect route middleware (Verify JWT Token)
const protect = async (req, res, next) => {
    let token;

    // Retrieve token from Authorization header (Bearer token)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production');

        // Fetch user details from database to ensure user still exists and get latest values
        const [users] = await pool.query(
            `SELECT u.id, u.username, r.name AS role 
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'User belonging to this token no longer exists.' });
        }

        // Attach user to local request context
        req.user = users[0];
        next();
    } catch (error) {
        logger.error('Authentication check failed:', error.message);
        return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }
};

// Restrict access based on standard whitelist of roles
const restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(500).json({ success: false, message: 'User context missing inside authorization middleware.' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden. You do not have permissions to perform this action.'
            });
        }

        next();
    };
};

module.exports = {
    protect,
    restrictTo
};
