const { pool } = require('../config/db');

// GET all categories
const getAllCategories = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM categories ORDER BY name ASC');
        res.status(200).json({ success: true, categories: rows });
    } catch (error) {
        next(error);
    }
};

// CREATE category
const createCategory = async (req, res, next) => {
    const { name, description } = req.body;
    try {
        if (!name) return res.status(400).json({ success: false, message: 'Category name is required.' });

        const [result] = await pool.query(
            'INSERT INTO categories (name, description) VALUES (?, ?)',
            [name, description || null]
        );

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, target_table, target_id, details) VALUES (?, 'CATEGORY_CREATE', 'categories', ?, ?)`,
            [req.user.id, result.insertId, `Category '${name}' created.`]
        );

        res.status(201).json({ success: true, message: 'Category created.', id: result.insertId });
    } catch (error) {
        next(error);
    }
};

// UPDATE category
const updateCategory = async (req, res, next) => {
    const { name, description } = req.body;
    try {
        const [existing] = await pool.query('SELECT id FROM categories WHERE id = ?', [req.params.id]);
        if (existing.length === 0) return res.status(404).json({ success: false, message: 'Category not found.' });

        await pool.query('UPDATE categories SET name=?, description=? WHERE id=?', [name, description || null, req.params.id]);

        res.status(200).json({ success: true, message: 'Category updated.' });
    } catch (error) {
        next(error);
    }
};

// DELETE category
const deleteCategory = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT id FROM categories WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Category not found.' });

        await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
        res.status(200).json({ success: true, message: 'Category deleted.' });
    } catch (error) {
        next(error);
    }
};

module.exports = { getAllCategories, createCategory, updateCategory, deleteCategory };
