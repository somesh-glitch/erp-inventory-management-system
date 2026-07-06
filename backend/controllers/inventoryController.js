const { pool } = require('../config/db');
const logger = require('../utils/logger');

// Shifted Reorder calculation logic onto the server
const serverCalcReorder = (product) => {
    const dailyCons = parseFloat(product.dailyConsumption || 0);
    const leadTime = parseInt(product.leadTime || 0);
    const safetyStock = parseFloat(product.safetyStock || 0);
    const currentStock = parseFloat(product.currentStock || 0);

    const reorderLevel = (dailyCons * leadTime) + safetyStock;
    const reorderQty = reorderLevel - currentStock;
    const needsReorder = reorderQty > 0;

    return {
        reorderLevel,
        reorderQty: Math.max(reorderQty, 0),
        rawReorderQty: reorderQty,
        needsReorder,
        status: needsReorder ? 'Reorder Required' : 'Stock Sufficient'
    };
};

// Retrieve in-progress active order items
const getCurrentOrder = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT products_json FROM active_orders WHERE user_id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(200).json({ success: true, products: [] });
        }

        const products = JSON.parse(rows[0].products_json);
        res.status(200).json({ success: true, products });
    } catch (error) {
        next(error);
    }
};

// Save in-progress active order items
const saveCurrentOrder = async (req, res, next) => {
    const { products } = req.body;

    try {
        if (!Array.isArray(products)) {
            return res.status(400).json({ success: false, message: 'Products must be an array.' });
        }

        const payload = JSON.stringify(products);
        await pool.query(
            `INSERT INTO active_orders (user_id, products_json) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE products_json = ?, updated_at = CURRENT_TIMESTAMP`,
            [req.user.id, payload, payload]
        );

        res.status(200).json({ success: true, message: 'Order progress saved.' });
    } catch (error) {
        next(error);
    }
};

// Clear active order items
const clearCurrentOrder = async (req, res, next) => {
    try {
        await pool.query('DELETE FROM active_orders WHERE user_id = ?', [req.user.id]);
        res.status(200).json({ success: true, message: 'Active order cleared.' });
    } catch (error) {
        next(error);
    }
};

// Complete active order, transfer data to reports/history and update catalog
const completeOrder = async (req, res, next) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Get the current active order items
        const [activeRows] = await connection.query(
            'SELECT products_json FROM active_orders WHERE user_id = ?',
            [req.user.id]
        );

        if (activeRows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'No active order found to complete.' });
        }

        const products = JSON.parse(activeRows[0].products_json);
        if (products.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'No products in the current order.' });
        }

        // 2. Generate unique order number (ORD-XXXX)
        const [countRows] = await connection.query('SELECT COUNT(*) AS cnt FROM orders');
        const orderNumber = `ORD-${String(countRows[0].cnt + 1).padStart(4, '0')}`;

        // 3. Compute cost margins and variance
        const totalPlanned = products.reduce((s, p) => s + (parseFloat(p.plannedQty) * parseFloat(p.plannedRate)), 0);
        const totalActual = products.reduce((s, p) => s + (parseFloat(p.actualQty) * parseFloat(p.actualRate)), 0);
        const variance = Math.abs(totalPlanned - totalActual);
        const status = totalActual <= totalPlanned ? 'Profit' : 'Loss';

        // 4. Insert order record
        const [orderResult] = await connection.query(
            `INSERT INTO orders (order_number, user_id, total_planned_cost, total_actual_cost, variance, status, order_date) 
       VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
            [orderNumber, req.user.id, totalPlanned, totalActual, variance, status]
        );
        const orderId = orderResult.insertId;

        const reorderItems = [];
        let reorderRequiredCount = 0;

        // 5. Populate products catalog list and record items/transactions
        for (const p of products) {
            // Upsert product in database
            const [prodRows] = await connection.query('SELECT id, current_stock FROM products WHERE name = ?', [p.name]);
            let productId;
            let prevStock = 0;

            if (prodRows.length > 0) {
                productId = prodRows[0].id;
                prevStock = parseFloat(prodRows[0].current_stock || 0);

                // Update product configurations (optionally subtract usage/actual-qty from inventory catalog stock)
                const newStock = prevStock - parseFloat(p.actualQty);
                await connection.query(
                    `UPDATE products 
           SET current_stock = ?, min_stock = ?, safety_stock = ?, daily_consumption = ?, lead_time = ?, planned_rate = ?, actual_rate = ? 
           WHERE id = ?`,
                    [newStock, p.minStock, p.safetyStock, p.dailyConsumption, p.leadTime, p.plannedRate, p.actualRate, productId]
                );
            } else {
                // Insert new product
                const initialStock = parseFloat(p.currentStock) - parseFloat(p.actualQty);
                const [prodResult] = await connection.query(
                    `INSERT INTO products (name, current_stock, min_stock, safety_stock, daily_consumption, lead_time, planned_rate, actual_rate) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [p.name, initialStock, p.minStock, p.safetyStock, p.dailyConsumption, p.leadTime, p.plannedRate, p.actualRate]
                );
                productId = prodResult.insertId;
                prevStock = parseFloat(p.currentStock || 0);
            }

            const freshStock = prevStock - parseFloat(p.actualQty);

            // Insert order item
            await connection.query(
                `INSERT INTO order_items (order_id, product_id, planned_qty, planned_rate, actual_qty, actual_rate, planned_cost, actual_cost) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, productId, p.plannedQty, p.plannedRate, p.actualQty, p.actualRate, p.plannedQty * p.plannedRate, p.actualQty * p.actualRate]
            );

            // Insert transaction ledger action
            await connection.query(
                `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, previous_stock, new_stock, user_id, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [productId, 'SalesOrderUsage', -parseFloat(p.actualQty), prevStock, freshStock, req.user.id, `Usage inside completed order ${orderNumber}`]
            );

            // Save calculated reorder state of this product in database
            const reorderObj = serverCalcReorder({
                dailyConsumption: p.dailyConsumption,
                leadTime: p.leadTime,
                safetyStock: p.safetyStock,
                currentStock: freshStock
            });

            if (reorderObj.needsReorder) {
                reorderRequiredCount++;
            }

            reorderItems.push({
                name: p.name,
                currentStock: freshStock,
                reorderLevel: reorderObj.reorderLevel,
                reorderQty: reorderObj.needsReorder ? reorderObj.rawReorderQty : 0,
                needsReorder: reorderObj.needsReorder,
                status: reorderObj.status
            });
        }

        // 6. Delete from active orders
        await connection.query('DELETE FROM active_orders WHERE user_id = ?', [req.user.id]);

        // 7. Audit log
        await connection.query(
            `INSERT INTO audit_logs (user_id, action, target_table, target_id, details) 
       VALUES (?, 'ORDER_COMPLETE', 'orders', ?, ?)`,
            [req.user.id, orderId, `Completed order ${orderNumber} with total cost ₹${totalActual.toFixed(2)}.`]
        );

        await connection.commit();
        connection.release();

        res.status(201).json({
            success: true,
            order: {
                id: orderNumber,
                date: new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
                products: products,
                totalPlanned: totalPlanned,
                totalActual: totalActual,
                variance: variance,
                status: status,
                reorderItems: reorderItems,
                reorderRequired: reorderRequiredCount
            }
        });

    } catch (error) {
        await connection.rollback();
        connection.release();
        next(error);
    }
};

// Retrieve historical completed orders list
const getCompletedOrders = async (req, res, next) => {
    try {
        const [orderRows] = await pool.query(
            `SELECT id, order_number, total_planned_cost, total_actual_cost, variance, status, 
              DATE_FORMAT(order_date, '%d %b %Y') AS formatted_date 
       FROM orders 
       WHERE user_id = ? 
       ORDER BY id DESC`,
            [req.user.id]
        );

        const history = [];

        for (const ord of orderRows) {
            // Fetch items to count reorders and format products array
            const [itemRows] = await pool.query(
                `SELECT oi.id, oi.planned_qty, oi.planned_rate, oi.actual_qty, oi.actual_rate, 
                oi.planned_cost, oi.actual_cost, p.name, p.current_stock, p.safety_stock, 
                p.min_stock, p.daily_consumption, p.lead_time 
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
                [ord.id]
            );

            let reorderRequiredCount = 0;
            const reorderList = [];
            const prodList = [];

            itemRows.forEach(item => {
                // Calculate reorder level
                const reorderObj = serverCalcReorder({
                    dailyConsumption: item.daily_consumption,
                    leadTime: item.lead_time,
                    safetyStock: item.safety_stock,
                    currentStock: item.current_stock
                });

                if (reorderObj.needsReorder) {
                    reorderRequiredCount++;
                }

                prodList.push({
                    name: item.name,
                    plannedQty: parseFloat(item.planned_qty),
                    plannedRate: parseFloat(item.planned_rate),
                    actualQty: parseFloat(item.actual_qty),
                    actualRate: parseFloat(item.actual_rate),
                    plannedCost: parseFloat(item.planned_cost),
                    actualCost: parseFloat(item.actual_cost),
                    currentStock: parseFloat(item.current_stock),
                    minStock: parseFloat(item.min_stock),
                    dailyConsumption: parseFloat(item.daily_consumption),
                    leadTime: parseInt(item.lead_time),
                    safetyStock: parseFloat(item.safety_stock)
                });

                reorderList.push({
                    name: item.name,
                    currentStock: parseFloat(item.current_stock),
                    reorderLevel: reorderObj.reorderLevel,
                    reorderQty: reorderObj.needsReorder ? reorderObj.rawReorderQty : 0,
                    needsReorder: reorderObj.needsReorder,
                    status: reorderObj.status
                });
            });

            history.push({
                id: ord.order_number,
                date: ord.formatted_date,
                totalPlanned: parseFloat(ord.total_planned_cost),
                totalActual: parseFloat(ord.total_actual_cost),
                variance: parseFloat(ord.variance),
                status: ord.status,
                products: prodList,
                reorderItems: reorderList,
                reorderRequired: reorderRequiredCount
            });
        }

        res.status(200).json({ success: true, orders: history });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCurrentOrder,
    saveCurrentOrder,
    clearCurrentOrder,
    completeOrder,
    getCompletedOrders
};
