const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// 静态文件服务
app.use(express.static('public'));

// 数据库连接池
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'shopping_db',
    charset: 'utf8',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 邮件配置
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// ========== 用户认证模块 ==========

// 用户注册
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, fullName } = req.body;
        const connection = await pool.getConnection();
        
        // 检查用户是否存在
        const [existing] = await connection.query(
            'SELECT id FROM users WHERE email = ?  OR username = ?',
            [email, username]
        );
        
        if (existing.length > 0) {
            connection.release();
            return res.status(400).json({ error: '用户已存在' });
        }
        
        // 加密密码
        const passwordHash = await bcrypt.hash(password, 10);
        
        // 创建用户
        await connection.query(
            'INSERT INTO users (username, email, password_hash, full_name) VALUES (?, ?, ?, ?)',
            [username, email, passwordHash, fullName]
        );
        
        connection.release();
        res.status(201).json({ message: '注册成功' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 用户登录 - 支持邮箱或用户名
app.post('/api/auth/login', async (req, res) => {
    try {
        const { emailOrUsername, password } = req.body;
        const connection = await pool.getConnection();
        
        // 支持邮箱或用户名登录
        const [users] = await connection.query(
            'SELECT id, username, password_hash, role FROM users WHERE email = ? OR username = ?',
            [emailOrUsername, emailOrUsername]
        );
        
        if (users.length === 0) {
            connection.release();
            return res.status(401).json({ error: '账户不存在或密码错误' });
        }
        
        const user = users[0];
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!passwordMatch) {
            connection.release();
            return res.status(401).json({ error: '账户不存在或密码错误' });
        }
        
        // 生成JWT令牌
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
        );
        
        connection.release();
        res.json({ token, userId: user.id, username: user.username, role: user.role });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 用户注销
app.post('/api/auth/logout', (req, res) => {
    res.json({ message: '注销成功' });
});

// ========== 产品管理模块 ==========

// 获取所有产品
app.get('/api/products', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [products] = await connection.query(
            'SELECT id, name, description, category, price, stock_quantity, image_url FROM products'
        );
        connection.release();
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 搜索产品
app.get('/api/products/search', async (req, res) => {
    try {
        const { keyword, category } = req.query;
        const connection = await pool.getConnection();
        
        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        
        if (keyword) {
            query += ' AND (name LIKE ? OR description LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        const [products] = await connection.query(query, params);
        connection.release();
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// JWT认证中间件
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (! token) {
        return res.status(401).json({ error: '未授权' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
        if (err) {
            return res.status(403).json({ error: '令牌无效' });
        }
        req.user = user;
        next();
    });
};

// 管理员权限检查
const checkAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '仅管理员可访问' });
    }
    next();
};

// 添加产品（仅管理员）
app.post('/api/products', authenticateToken, checkAdmin, async (req, res) => {
    try {
        const { name, description, category, price, stockQuantity, imageUrl } = req.body;
        const connection = await pool.getConnection();
        
        await connection.query(
            'INSERT INTO products (name, description, category, price, stock_quantity, image_url) VALUES (?, ?, ?, ?, ?, ?)',
            [name, description, category, price, stockQuantity, imageUrl]
        );
        
        connection.release();
        res.status(201).json({ message: '产品添加成功' });
    } catch (error) {
        res.status(500).json({ error: error. message });
    }
});

// 更新产品（仅管理员）
app.put('/api/products/:id', authenticateToken, checkAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category, price, stockQuantity, imageUrl } = req.body;
        const connection = await pool.getConnection();
        
        await connection.query(
            'UPDATE products SET name=?, description=?, category=?, price=?, stock_quantity=?, image_url=? WHERE id=? ',
            [name, description, category, price, stockQuantity, imageUrl, id]
        );
        
        connection.release();
        res.json({ message: '产品更新成功' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 删除产品（仅管理员）
app.delete('/api/products/:id', authenticateToken, checkAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const connection = await pool.getConnection();
        
        await connection.query('DELETE FROM products WHERE id=?', [id]);
        
        connection.release();
        res.json({ message: '产品删除成功' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 购物车模块 ==========

// 添加至购物车
app.post('/api/cart', authenticateToken, async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const connection = await pool.getConnection();
        
        // 检查产品库存
        const [products] = await connection.query(
            'SELECT stock_quantity FROM products WHERE id = ? ',
            [productId]
        );
        
        if (products.length === 0 || products[0].stock_quantity < quantity) {
            connection.release();
            return res.status(400).json({ error: '库存不足' });
        }
        
        // 添加或更新购物车
        await connection.query(
            `INSERT INTO shopping_cart (user_id, product_id, quantity) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
            [req.user.userId, productId, quantity, quantity]
        );
        
        connection.release();
        res.json({ message: '已添加到购物车' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取购物车
app.get('/api/cart', authenticateToken, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        const [cartItems] = await connection.query(
            `SELECT sc.id, p.id as productId, p.name, p.price, sc.quantity, p.image_url
             FROM shopping_cart sc
             JOIN products p ON sc.product_id = p.id
             WHERE sc.user_id = ?`,
            [req.user.userId]
        );
        
        connection.release();
        res.json(cartItems);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 从购物车移除
app.delete('/api/cart/:productId', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.params;
        const connection = await pool.getConnection();
        
        await connection.query(
            'DELETE FROM shopping_cart WHERE user_id = ? AND product_id = ?',
            [req.user.userId, productId]
        );
        
        connection.release();
        res.json({ message: '已从购物车移除' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 订单模块 ==========

// 创建订单（结算）
app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const { shippingAddress, paymentMethod } = req.body;
        const connection = await pool.getConnection();
        
        // 开始事务
        await connection.beginTransaction();
        
        // 获取购物车项目
        const [cartItems] = await connection.query(
            `SELECT product_id, quantity FROM shopping_cart WHERE user_id = ?`,
            [req.user.userId]
        );
        
        if (cartItems.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: '购物车为空' });
        }
        
        // 计算总金额
        let totalAmount = 0;
        const [productPrices] = await connection.query(
            `SELECT id, price FROM products WHERE id IN (${cartItems.map(() => '?').join(',')})`,
            cartItems.map(item => item.product_id)
        );
        
        const priceMap = {};
        productPrices.forEach(p => priceMap[p.id] = p.price);
        
        cartItems.forEach(item => {
            totalAmount += priceMap[item.product_id] * item.quantity;
        });
        
        // 创建订单
        const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const [orderResult] = await connection.query(
            `INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, shipping_address)
             VALUES (?, ?, ?, 'pending', ?, ?)`,
            [req.user.userId, orderNumber, totalAmount, paymentMethod, shippingAddress]
        );
        
        const orderId = orderResult.insertId;
        
        // 添加订单项目并更新库存
        for (const item of cartItems) {
            await connection.query(
                `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
                 VALUES (?, ?, ?, ?)`,
                [orderId, item.product_id, item.quantity, priceMap[item.product_id]]
            );
            
            // 更新库存
            await connection.query(
                `UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?`,
                [item.quantity, item.product_id]
            );
        }
        
        // 清空购物车
        await connection.query('DELETE FROM shopping_cart WHERE user_id = ?', [req.user.userId]);
        
        // 获取用户邮箱
        const [users] = await connection.query(
            'SELECT email, full_name FROM users WHERE id = ? ',
            [req.user. userId]
        );
        
        await connection.commit();
        connection. release();
        
        // 发送确认邮件
        const user = users[0];
        try {
            await emailTransporter. sendMail({
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: `订单确认 - ${orderNumber}`,
                html: `
                    <h2>感谢您的订单！</h2>
                    <p>尊敬的${user.full_name}，</p>
                    <p>您的订单已创建，订单号：<strong>${orderNumber}</strong></p>
                    <p>总金额：<strong>¥${totalAmount.toFixed(2)}</strong></p>
                    <p>我们将尽快为您发货，请留意电子邮件更新。</p>
                `
            });
        } catch (emailError) {
            console.error('邮件发送失败：', emailError);
        }
        
        res.status(201).json({
            orderId,
            orderNumber,
            totalAmount,
            message: '订单创建成功'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取用户订单
app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        const [orders] = await connection.query(
            `SELECT id, order_number, total_amount, status, created_at
             FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
            [req.user.userId]
        );
        
        connection.release();
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取订单详情
app.get('/api/orders/:orderId', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const connection = await pool.getConnection();
        
        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [orderId, req.user.userId]
        );
        
        if (orders.length === 0) {
            connection.release();
            return res.status(404).json({ error: '订单不存在' });
        }
        
        const [items] = await connection.query(
            `SELECT oi.product_id, p.name, oi.quantity, oi.unit_price
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ? `,
            [orderId]
        );
        
        connection.release();
        
        const order = orders[0];
        order.items = items;
        res.json(order);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 管理员更新订单状态
app.put('/api/orders/:orderId/status', authenticateToken, checkAdmin, async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;
    const allowedStatuses = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        // 查询当前订单状态
        const [orders] = await connection.query('SELECT status FROM orders WHERE id = ?', [orderId]);
        if (orders.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Order not found' });
        }
        const prevStatus = orders[0].status;
        // 仅允许pending/paid订单被取消并恢复库存
        if (status === 'cancelled' && prevStatus !== 'cancelled') {
            if (prevStatus !== 'pending' && prevStatus !== 'paid') {
                connection.release();
                return res.status(400).json({ error: '只有待付款或已付款订单可取消' });
            }
            // 查询订单商品
            const [items] = await connection.query(
                'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
                [orderId]
            );
            // 恢复每个商品库存
            for (const item of items) {
                await connection.query(
                    'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
                    [item.quantity, item.product_id]
                );
            }
        }
        // 更新订单状态
        await connection.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
        connection.release();
        return res.json({ message: 'Order status updated' });
    } catch (error) {
        if (connection) connection.release();
        return res.status(500).json({ error: error.message });
    }
});

// 完成支付（用户操作）
app.put('/api/orders/:orderId/pay', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log(`支付请求：订单ID=${orderId}, 用户ID=${req.user.userId}`);
        const connection = await pool.getConnection();
        
        // 验证订单属于当前用户且状态为 pending
        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = ?',
            [orderId, req.user.userId, 'pending']
        );
        
        console.log(`查询结果：找到 ${orders.length} 个订单`);
        if (orders.length > 0) {
            console.log(`订单状态：${orders[0].status}`);
        }
        
        if (orders.length === 0) {
            connection.release();
            return res.status(400).json({ error: '无法支付：订单不存在或状态不对' });
        }
        
        // 更新订单状态为 paid
        await connection.query(
            'UPDATE orders SET status = ? WHERE id = ?',
            ['paid', orderId]
        );
        
        console.log(`订单 ${orderId} 支付成功`);
        connection.release();
        res.json({ message: '订单支付成功' });
    } catch (error) {
        console.error('支付错误：', error);
        res.status(500).json({ error: error.message });
    }
});

// 确认收货（用户操作）
app.put('/api/orders/:orderId/confirm', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const connection = await pool.getConnection();
        
        // 验证订单属于当前用户且状态为 shipped
        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = ?',
            [orderId, req.user.userId, 'shipped']
        );
        
        if (orders.length === 0) {
            connection.release();
            return res.status(400).json({ error: '无法确认收货：订单不存在或状态不对' });
        }
        
        // 更新订单状态为 delivered
        await connection.query(
            'UPDATE orders SET status = ? WHERE id = ?',
            ['delivered', orderId]
        );
        
        connection.release();
        res.json({ message: '订单已确认收货' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 取消订单（用户操作，只能取消未支付或已支付的订单）
app.put('/api/orders/:orderId/cancel', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const connection = await pool.getConnection();
        
        // 开始事务
        await connection.beginTransaction();
        
        // 验证订单属于当前用户且状态可以取消
        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ? AND status IN (?, ?)',
            [orderId, req.user.userId, 'pending', 'paid']
        );
        
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: '无法取消订单：订单不存在或已发货/已送达' });
        }
        
        const order = orders[0];
        
        // 获取订单中的所有商品
        const [items] = await connection.query(
            'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
            [orderId]
        );

        // 恢复库存
        for (const item of items) {
            await connection.query(
                'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
                [item.quantity, item.product_id]
            );
        }

        // 更新订单状态为已取消
        await connection.query(
            'UPDATE orders SET status = ? WHERE id = ?',
            ['cancelled', orderId]
        );

        await connection.commit();
        connection.release();
        res.json({ message: '订单已取消' });
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        res.status(500).json({ error: error.message });
    }
});

// ========== 销售报表模块 ========== 

// 获取销售统计（仅管理员）
app.get('/api/reports/sales', authenticateToken, checkAdmin, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        const [statistics] = await connection.query(`
            SELECT 
                COUNT(DISTINCT o.id) as total_orders,
                SUM(o.total_amount) as total_revenue,
                AVG(o. total_amount) as avg_order_value,
                COUNT(DISTINCT o.user_id) as total_customers,
                DATE_FORMAT(o.created_at, '%Y-%m-%d') as date
            FROM orders o
            WHERE o.status IN ('paid', 'shipped', 'delivered')
            GROUP BY DATE_FORMAT(o.created_at, '%Y-%m-%d')
            ORDER BY date DESC
            LIMIT 30
        `);
        
        connection.release();
        res.json(statistics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取产品销售排行（仅管理员）
app.get('/api/reports/top-products', authenticateToken, checkAdmin, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        const [topProducts] = await connection.query(`
            SELECT 
                p. id, p.name, 
                SUM(oi. quantity) as total_sold,
                SUM(oi.quantity * oi.unit_price) as total_revenue
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status IN ('paid', 'shipped', 'delivered')
            GROUP BY p.id
            ORDER BY total_sold DESC
            LIMIT 10
        `);
        
        connection.release();
        res.json(topProducts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ 服务器运行在 http://localhost:${PORT}`);
});
