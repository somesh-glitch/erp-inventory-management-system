const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Create connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erp_inventory',
    port: parseInt(process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verify connection wrapper
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('Successfully connected to the MySQL database.');
        connection.release();
        return true;
    } catch (error) {
        console.error('Database connection failed:', error.message);
        return false;
    }
};

module.exports = {
    pool,
    testConnection
};
