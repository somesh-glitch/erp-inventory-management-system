const { pool } = require('../config/db');

// GET all suppliers
const getAllSuppliers = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY name ASC');
        res.status(200).json({ success: true, suppliers: rows });
    } catch (error) {
        next(error);
    }
};

// GET single supplier
const getSupplierById = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Supplier not found.' });
        res.status(200).json({ success: true, supplier: rows[0] });
    } catch (error) {
        next(error);
    }
};

// CREATE supplier
const createSupplier = async (req, res, next) => {
    const { name, contact_person, email, phone, address } = req.body;
    try {
        if (!name) return res.status(400).json({ success: false, message: 'Supplier name is required.' });

        const [result] = await pool.query(
            'INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)',
            [name, contact_person || null, email || null, phone || null, address || null]
        );

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, target_table, target_id, details) VALUES (?, 'SUPPLIER_CREATE', 'suppliers', ?, ?)`,
            [req.user.id, result.insertId, `Supplier '${name}' created.`]
        );

        res.status(201).json({ success: true, message: 'Supplier created.', id: result.insertId });
    } catch (error) {
        next(error);
    }
};

// UPDATE supplier
const updateSupplier = async (req, res, next) => {
    const { name, contact_person, email, phone, address } = req.body;
    try {
        const [existing] = await pool.query('SELECT id FROM suppliers WHERE id = ?', [req.params.id]);
        if (existing.length === 0) return res.status(404).json({ success: false, message: 'Supplier not found.' });

        await pool.query(
            'UPDATE suppliers SET name=?, contact_person=?, email=?, phone=?, address=? WHERE id=?',
            [name, contact_person || null, email || null, phone || null, address || null, req.params.id]
        );

        res.status(200).json({ success: true, message: 'Supplier updated.' });
    } catch (error) {
        next(error);
    }
};

// DELETE supplier
const deleteSupplier = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT id FROM suppliers WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Supplier not found.' });

        await pool.query('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
        res.status(200).json({ success: true, message: 'Supplier deleted.' });
    } catch (error) {
        next(error);
    }
};

module.exports = { getAllSuppliers, getSupplierById, createSupplier, updateSupplier, deleteSupplier };
