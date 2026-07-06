-- Drop database if exists and recreate
-- CREATE DATABASE IF NOT EXISTS erp_inventory;
-- USE erp_inventory;

-- 1. Roles table
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

-- 3. Categories table
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. Products table
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category_id INT DEFAULT NULL,
    supplier_id INT DEFAULT NULL,
    current_stock DECIMAL(12,4) DEFAULT 0.0000,
    min_stock DECIMAL(12,4) DEFAULT 0.0000,
    safety_stock DECIMAL(12,4) DEFAULT 0.0000,
    daily_consumption DECIMAL(12,4) DEFAULT 0.0000,
    lead_time INT DEFAULT 0,
    planned_rate DECIMAL(12,2) DEFAULT 0.00,
    actual_rate DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

-- 6. Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INT NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected', 'Delivered') DEFAULT 'Pending',
    total_cost DECIMAL(12,2) DEFAULT 0.00,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    created_by INT NOT NULL,
    approved_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. Purchase Order Items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id INT NOT NULL,
    product_id INT NOT NULL,
    ordered_qty DECIMAL(12,4) NOT NULL,
    rate DECIMAL(12,2) NOT NULL,
    received_qty DECIMAL(12,4) DEFAULT 0.0000,
    pending_qty DECIMAL(12,4) NOT NULL,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- 8. Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    total_planned_cost DECIMAL(12,2) NOT NULL,
    total_actual_cost DECIMAL(12,2) NOT NULL,
    variance DECIMAL(12,2) NOT NULL,
    status ENUM('Profit', 'Loss', 'Even') NOT NULL,
    order_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- 9. Order Items table
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    planned_qty DECIMAL(12,4) NOT NULL,
    planned_rate DECIMAL(12,2) NOT NULL,
    actual_qty DECIMAL(12,4) NOT NULL,
    actual_rate DECIMAL(12,2) NOT NULL,
    planned_cost DECIMAL(12,2) NOT NULL,
    actual_cost DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- 10. Inventory Transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    transaction_type ENUM('Adjustment', 'PurchaseOrderReceipt', 'SalesOrderUsage') NOT NULL,
    quantity DECIMAL(12,4) NOT NULL,
    previous_stock DECIMAL(12,4) NOT NULL,
    new_stock DECIMAL(12,4) NOT NULL,
    user_id INT NOT NULL,
    notes TEXT,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- 11. Reports table
CREATE TABLE IF NOT EXISTS reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_type ENUM('Inventory', 'Purchase', 'CostAnalysis', 'ProfitLoss', 'Reorder', 'Supplier') NOT NULL,
    title VARCHAR(150) NOT NULL,
    generated_by INT NOT NULL,
    generated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    parameters_json TEXT,
    file_path VARCHAR(255),
    FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- 12. Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    action VARCHAR(100) NOT NULL,
    target_table VARCHAR(50),
    target_id INT DEFAULT NULL,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed Initial Roles
INSERT INTO roles (id, name, description) VALUES 
(1, 'Admin', 'Full administrative authorization key privilege'),
(2, 'Inventory Manager', 'Access to stocks, categories, suppliers, and purchase orders'),
(3, 'Employee', 'Basic entry and reports creation privileges')
ON DUPLICATE KEY UPDATE name=name;

-- 13. Active Orders state table
CREATE TABLE IF NOT EXISTS active_orders (
    user_id INT PRIMARY KEY,
    products_json LONGTEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
