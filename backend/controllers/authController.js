const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const logger = require('../utils/logger');

// Password complexity check helper
const isPasswordSecure = (password) => {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    if (!/[^A-Za-z0-9]/.test(password)) return false;
    return true;
};

// Register a new user
const register = async (req, res, next) => {
    const { username, password, role_id } = req.body;

    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required.' });
        }

        if (username.length < 3) {
            return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
        }

        if (!isPasswordSecure(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters and include at least one uppercase letter, one lowercase letter, one number, and one special character.'
            });
        }

        // Default to Employee role (id = 3) if none provided or invalid
        let targetRoleId = parseInt(role_id) || 3;
        if (targetRoleId < 1 || targetRoleId > 3) {
            targetRoleId = 3;
        }

        // Check if user already exists
        const [existingUsers] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: 'Username is already taken.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert user
        const [result] = await pool.query(
            'INSERT INTO users (username, password_hash, role_id) VALUES (?, ?, ?)',
            [username, passwordHash, targetRoleId]
        );

        const newUserId = result.insertId;

        // Log the audit event
        await pool.query(
            'INSERT INTO audit_logs (user_id, action, target_table, target_id, details) VALUES (?, ?, ?, ?, ?)',
            [newUserId, 'REGISTER', 'users', newUserId, `User '${username}' registered with role_id ${targetRoleId}.`]
        );

        logger.info(`User registered successfully: ${username}`);
        res.status(201).json({
            success: true,
            message: 'Account created successfully.'
        });
    } catch (error) {
        next(error);
    }
};

// Log in user
const login = async (req, res, next) => {
    const { username, password } = req.body;

    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required.' });
        }

        // Retrieve user and their role name
        const [users] = await pool.query(
            `SELECT u.id, u.username, u.password_hash, r.name AS role_name 
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.username = ?`,
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }

        const user = users[0];

        // Check password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role_name },
            process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production',
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Log audit event
        await pool.query(
            'INSERT INTO audit_logs (user_id, action, target_table, target_id, details) VALUES (?, ?, ?, ?, ?)',
            [user.id, 'LOGIN', 'users', user.id, `User '${username}' logged in successfully.`]
        );

        logger.info(`User logged in: ${username}`);
        res.status(200).json({
            success: true,
            message: 'Login successful.',
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role_name
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    login
};
