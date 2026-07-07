const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const logger = require('./utils/logger');
const { testConnection, pool } = require('./config/db');
const { initializeDatabase } = require('./config/initDb');
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');

// Initialize configuration
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Standard Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Serve Frontend Static Files
app.use(express.static(path.join(__dirname, '../frontend')));

// Health Check API
app.get('/api/health', async (req, res) => {
    const dbConnected = await testConnection();
    res.status(dbConnected ? 200 : 500).json({
        success: dbConnected,
        status: dbConnected ? 'Healthy' : 'Database Offline',
        timestamp: new Date().toISOString()
    });
});

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/products', require('./routes/productsRoutes'));
app.use('/api/categories', require('./routes/categoriesRoutes'));
app.use('/api/suppliers', require('./routes/suppliersRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

// 404 Route Not Found Handler
app.use(notFoundHandler);

// Global Error Handler Middleware
app.use(errorHandler);

// Listen to port
const startServer = async () => {
    const dbConnected = await testConnection();
    if (dbConnected) {
        try {
            await initializeDatabase(pool);
        } catch (initError) {
            logger.error('Critical: Database initialization failed:', initError.message);
        }
        app.listen(PORT, () => {
            logger.info(`Server initiated on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
        });
    } else {
        logger.error('Failed to establish database connection. Server not started.');
        process.exit(1);
    }
};

startServer();
