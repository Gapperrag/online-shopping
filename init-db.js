const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'shopping_db',
    charset: 'utf8mb4'
  });

  await connection.query('SET NAMES utf8mb4');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(100),
      phone VARCHAR(20),
      address TEXT,
      role ENUM('customer', 'sales', 'admin') NOT NULL DEFAULT 'customer',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  try {
    await connection.query(`
      ALTER TABLE users
      MODIFY role ENUM('customer', 'sales', 'admin') NOT NULL DEFAULT 'customer'
    `);
  } catch (error) {
    console.warn('Skipped users.role migration:', error.message);
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      price DECIMAL(10, 2) NOT NULL,
      stock_quantity INT NOT NULL DEFAULT 0,
      image_url VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS shopping_cart (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_product (user_id, product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      order_number VARCHAR(50) NOT NULL UNIQUE,
      total_amount DECIMAL(10, 2) NOT NULL,
      status ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
      payment_method VARCHAR(50),
      shipping_address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NULL,
      action ENUM('browse', 'cart_add', 'purchase', 'payment', 'product_update', 'category_update') NOT NULL,
      product_id INT NULL,
      order_id INT NULL,
      metadata JSON NULL,
      ip_address VARCHAR(64),
      user_agent VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const activityMigrations = [
    "ALTER TABLE activity_logs MODIFY action ENUM('login', 'browse', 'cart_add', 'like', 'purchase', 'payment', 'product_update', 'category_update', 'sales_manage', 'admin_manage') NOT NULL",
    'ALTER TABLE activity_logs ADD COLUMN category VARCHAR(100) NULL AFTER action',
    'ALTER TABLE activity_logs ADD COLUMN duration_seconds INT NULL AFTER order_id',
    'ALTER TABLE activity_logs ADD COLUMN account VARCHAR(100) NULL AFTER metadata',
    'ALTER TABLE activity_logs ADD COLUMN content TEXT NULL AFTER account'
  ];

  for (const sql of activityMigrations) {
    try {
      await connection.query(sql);
    } catch (_) {
      // Column or enum definition may already exist.
    }
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS product_likes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      product_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_like (user_id, product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NULL,
      account VARCHAR(100) NOT NULL,
      role ENUM('customer', 'sales', 'admin') NULL,
      ip_address VARCHAR(64),
      user_agent VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const indexes = [
    'CREATE INDEX idx_orders_user_id ON orders(user_id)',
    'CREATE INDEX idx_orders_status ON orders(status)',
    'CREATE INDEX idx_products_category ON products(category)',
    'CREATE INDEX idx_logs_action ON activity_logs(action)',
    'CREATE INDEX idx_logs_created_at ON activity_logs(created_at)',
    'CREATE INDEX idx_logs_category ON activity_logs(category)',
    'CREATE INDEX idx_login_logs_created_at ON login_logs(created_at)',
    'CREATE INDEX idx_login_logs_user_id ON login_logs(user_id)',
    'CREATE INDEX idx_product_likes_user_id ON product_likes(user_id)',
    'CREATE INDEX idx_product_likes_product_id ON product_likes(product_id)'
  ];

  for (const sql of indexes) {
    try {
      await connection.query(sql);
    } catch (_) {
      // Index already exists.
    }
  }

  const passwordHash = await bcrypt.hash('admin123456', 10);
  await connection.query(
    `INSERT INTO users (username, email, password_hash, full_name, role)
     VALUES ('admin', 'admin@example.com', ?, 'System Admin', 'admin')
     ON DUPLICATE KEY UPDATE role = 'admin'`,
    [passwordHash]
  );
  const salesPasswordHash = await bcrypt.hash('sales123456', 10);
  await connection.query(
    `INSERT INTO users (username, email, password_hash, full_name, role)
     VALUES ('sales', 'sales@example.com', ?, 'Default Sales', 'sales')
     ON DUPLICATE KEY UPDATE role = 'sales'`,
    [salesPasswordHash]
  );

  const defaultCategories = [
    ['电子产品', '电脑、手机和智能硬件'],
    ['智能设备', '手表、家居和可穿戴设备'],
    ['音频', '耳机、音箱和声音设备'],
    ['配件', '扩展坞、支架、线材等配件'],
    ['存储', '硬盘、U盘和存储设备']
  ];

  for (const [name, description] of defaultCategories) {
    await connection.query(
      'INSERT IGNORE INTO categories (name, description) VALUES (?, ?)',
      [name, description]
    );
  }

  await connection.end();
  console.log('Database initialized.');
  console.log('Admin login: admin / admin123456');
  console.log('Sales login: sales / sales123456');
}

run().catch((error) => {
  console.error('Database initialization failed:', error);
  process.exit(1);
});
