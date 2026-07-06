const logger = require('../utils/logger');

// Global Centralized Error Handling Middleware
const errorHandler = (err, req, res, next) => {
    logger.error(`${err.name || 'Error'}: ${err.message}`, err.stack);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
};

// Route Page Not Found (404) Handler
const notFoundHandler = (req, res, next) => {
    const error = new Error(`Route Not Found - ${req.originalUrl}`);
    error.statusCode = 404;
    next(error);
};

module.exports = {
    errorHandler,
    notFoundHandler
};
