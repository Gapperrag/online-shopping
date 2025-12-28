const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            charset: 'utf8'
        });

        console.log('✅ 已连接到数据库');

        // 设置字符集
        await connection.query('SET NAMES utf8');

        // 创建用户表
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(50) NOT NULL UNIQUE,
                email VARCHAR(100) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(100),
                phone VARCHAR(20),
                address TEXT,
                role ENUM('customer', 'admin') DEFAULT 'customer',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci
        `);
        console.log('✅ 用户表创建成功');

        // 创建产品表
        await connection.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                price DECIMAL(10, 2) NOT NULL,
                stock_quantity INT NOT NULL DEFAULT 0,
                image_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci
        `);
        console.log('✅ 产品表创建成功');

        // 创建购物车表
        await connection.query(`
            CREATE TABLE IF NOT EXISTS shopping_cart (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (product_id) REFERENCES products(id),
                UNIQUE KEY unique_user_product (user_id, product_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci
        `);
        console.log('✅ 购物车表创建成功');

        // 创建订单表
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
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci
        `);
        console.log('✅ 订单表创建成功');

        // 创建订单项目表
        await connection.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL,
                unit_price DECIMAL(10, 2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci
        `);
        console.log('✅ 订单项目表创建成功');

        // 创建索引
        try {
            await connection.query('CREATE INDEX idx_user_id ON orders(user_id)');
        } catch (e) {
            // 索引可能已存在，忽略错误
        }
        try {
            await connection.query('CREATE INDEX idx_status ON orders(status)');
        } catch (e) {
            // 索引可能已存在，忽略错误
        }
        console.log('✅ 索引创建成功');

        // 创建初始管理员账户
        const bcrypt = require('bcrypt');
        const adminEmail = 'admin@example.com';
        const adminPassword = 'admin123456';
        const adminUsername = 'admin';
        
        try {
            // 检查管理员是否已存在
            const [existing] = await connection.query(
                'SELECT id FROM users WHERE email = ?',
                [adminEmail]
            );
            
            if (existing.length === 0) {
                // 创建管理员
                const hashedPassword = await bcrypt.hash(adminPassword, 10);
                await connection.query(
                    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
                    [adminUsername, adminEmail, hashedPassword, 'System Admin', 'admin']
                );
                console.log('✅ 初始管理员账户创建成功');
                console.log(`   邮箱: ${adminEmail}`);
                console.log(`   密码: ${adminPassword}`);
            } else {
                console.log('ℹ️  管理员账户已存在，跳过创建');
            }
        } catch (e) {
            console.error('❌ 管理员账户创建失败:', e.message);
        }

        await connection.end();
        console.log('✅ 所有表创建完成！');
    } catch (error) {
        console.error('❌ 数据库初始化失败：', error.message);
    }
}

initDatabase();