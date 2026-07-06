const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Checks if the users table exists. If not, reads schema.sql and runs all queries in sequence.
 * @param {object} pool - MySQL connection pool
 */
const initializeDatabase = async (pool) => {
    try {
        // Query to check if the 'users' table exists
        const [rows] = await pool.query(
            "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'"
        );

        if (rows[0] && rows[0].count > 0) {
            logger.info('Database table "users" already exists. Skipping auto-initialization.');
            return;
        }

        logger.info('Database key tables not found. Automatically initializing schema from schema.sql...');

        const schemaPath = path.join(__dirname, '../database/schema.sql');
        if (!fs.existsSync(schemaPath)) {
            logger.error(`Database schema file not found at: ${schemaPath}`);
            return;
        }

        const sql = fs.readFileSync(schemaPath, 'utf8');

        // Parse commands cleanly: strip comments and segment by statement termination semicolon
        const lines = sql.split('\n');
        const cleanedLines = [];

        for (let line of lines) {
            // Remove single-line comments
            const commentIndex = line.indexOf('--');
            if (commentIndex !== -1) {
                line = line.substring(0, commentIndex);
            }
            cleanedLines.push(line);
        }

        const statements = cleanedLines
            .join('\n')
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

        for (const statement of statements) {
            await pool.query(statement);
        }

        logger.info('Database schema successfully initialized and seeded.');
    } catch (error) {
        logger.error('Database auto-initialization failed:', error);
        throw error;
    }
};

module.exports = {
    initializeDatabase
};
