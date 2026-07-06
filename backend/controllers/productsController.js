const { pool } = require('../config/db');
const logger = require('../utils/logger');

// GET all products with category/supplier info
const getAllProducts = async (req, res, next) => {
    try {
        const [rows] = await pool.query(`
      SELECT p.id, p.name, p.current_stock, p.min_stock, p.safety_stock,
             p.daily_consumption, p.lead_time, p.planned_rate, p.actual_rate,
             c.name AS category_name, s.name AS supplier_name,
             p.created_at, p.updated_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ORDER BY p.name ASC
    `);
        res.status(200).json({ success: true, products: rows });
    } catch (error) {
        next(error);
    }
};

// GET single product by ID
const getProductById = async (req, res, next) => {
    try {
        const [rows] = await pool.query(`
      SELECT p.*, c.name AS category_name, s.name AS supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = ?
    `, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        res.status(200).json({ success: true, product: rows[0] });
    } catch (error) {
        next(error);
    }
};

// CREATE product
const createProduct = async (req, res, next) => {
    const { name, category_id, supplier_id, current_stock, min_stock, safety_stock,
        daily_consumption, lead_time, planned_rate, actual_rate } = req.body;

    try {
        if (!name) return res.status(400).json({ success: false, message: 'Product name is required.' });

        const [result] = await pool.query(
            `INSERT INTO products 
       (name, category_id, supplier_id, current_stock, min_stock, safety_stock, daily_consumption, lead_time, planned_rate, actual_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, category_id || null, supplier_id || null,
                current_stock || 0, min_stock || 0, safety_stock || 0,
                daily_consumption || 0, lead_time || 0, planned_rate || 0, actual_rate || 0]
        );

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, target_table, target_id, details) VALUES (?, 'PRODUCT_CREATE', 'products', ?, ?)`,
            [req.user.id, result.insertId, `Product '${name}' created.`]
        );

        logger.info(`Product created: ${name} by user ${req.user.username}`);
        res.status(201).json({ success: true, message: 'Product created.', id: result.insertId });
    } catch (error) {
        next(error);
    }
};

// UPDATE product
const updateProduct = async (req, res, next) => {
    const { name, category_id, supplier_id, current_stock, min_stock, safety_stock,
        daily_consumption, lead_time, planned_rate, actual_rate } = req.body;

    try {
        const [existing] = await pool.query('SELECT id FROM products WHERE id = ?', [req.params.id]);
        if (existing.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });

        await pool.query(
            `UPDATE products SET name=?, category_id=?, supplier_id=?, current_stock=?, min_stock=?, safety_stock=?,
       daily_consumption=?, lead_time=?, planned_rate=?, actual_rate=? WHERE id=?`,
            [name, category_id || null, supplier_id || null,
                current_stock || 0, min_stock || 0, safety_stock || 0,
                daily_consumption || 0, lead_time || 0, planned_rate || 0, actual_rate || 0, req.params.id]
        );

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, target_table, target_id, details) VALUES (?, 'PRODUCT_UPDATE', 'products', ?, ?)`,
            [req.user.id, req.params.id, `Product '${name}' updated.`]
        );

        res.status(200).json({ success: true, message: 'Product updated.' });
    } catch (error) {
        next(error);
    }
};

// ADJUST stock (manual increment/decrement)
const adjustStock = async (req, res, next) => {
    const { quantity, notes } = req.body;
    const productId = req.params.id;

    try {
        const [rows] = await pool.query('SELECT id, current_stock FROM products WHERE id = ?', [productId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });

        const prev = parseFloat(rows[0].current_stock);
        const newStock = prev + parseFloat(quantity);

        await pool.query('UPDATE products SET current_stock = ? WHERE id = ?', [newStock, productId]);

        await pool.query(
            `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, previous_stock, new_stock, user_id, notes)
       VALUES (?, 'Adjustment', ?, ?, ?, ?, ?)`,
            [productId, quantity, prev, newStock, req.user.id, notes || 'Manual adjustment']
        );

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, target_table, target_id, details) VALUES (?, 'STOCK_ADJUST', 'products', ?, ?)`,
            [req.user.id, productId, `Stock adjusted by ${quantity}. New stock: ${newStock}.`]
        );

        res.status(200).json({ success: true, message: 'Stock adjusted.', newStock });
    } catch (error) {
        next(error);
    }
};

// DELETE product (admin only)
const deleteProduct = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT id, name FROM products WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });

        await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, target_table, target_id, details) VALUES (?, 'PRODUCT_DELETE', 'products', ?, ?)`,
            [req.user.id, req.params.id, `Product '${rows[0].name}' deleted.`]
        );

        res.status(200).json({ success: true, message: 'Product deleted.' });
    } catch (error) {
        next(error);
    }
};

// GET reorder alerts — products where stock <= reorder level
const getReorderAlerts = async (req, res, next) => {
    try {
        const [rows] = await pool.query(`
      SELECT id, name, current_stock, min_stock, safety_stock, daily_consumption, lead_time
      FROM products
    `);

        const alerts = rows.map(p => {
            const reorderLevel = (p.daily_consumption * p.lead_time) + p.safety_stock;
            const reorderQty = reorderLevel - p.current_stock;
            const needsReorder = reorderQty > 0;
            return {
                id: p.id,
                name: p.name,
                currentStock: parseFloat(p.current_stock),
                reorderLevel,
                reorderQty: Math.max(reorderQty, 0),
                rawReorderQty: reorderQty,
                needsReorder,
                status: needsReorder ? 'Reorder Required' : 'Stock Sufficient'
            };
        });

        res.status(200).json({ success: true, alerts });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    adjustStock,
    deleteProduct,
    getReorderAlerts
};
