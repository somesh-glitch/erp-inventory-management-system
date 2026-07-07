const { pool } = require("../config/db");

async function buildInventoryContext() {

    const [products] = await pool.query(`
        SELECT
            name,
            current_stock,
            min_stock,
            safety_stock,
            daily_consumption,
            lead_time,
            planned_rate,
            actual_rate
        FROM products
        ORDER BY name
    `);

    if (products.length === 0) {
        return "There are currently no products in the inventory.";
    }

    let context = "CURRENT INVENTORY\n\n";

    products.forEach((product, index) => {

        context +=
`${index + 1}. ${product.name}

Current Stock : ${product.current_stock}

Minimum Stock : ${product.min_stock}

Safety Stock : ${product.safety_stock}

Daily Consumption : ${product.daily_consumption}

Lead Time : ${product.lead_time}

Planned Rate : ${product.planned_rate}

Actual Rate : ${product.actual_rate}

-------------------------

`;

    });

    return context;
}

module.exports = {
    buildInventoryContext
};