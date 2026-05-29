const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }));
app.use(cors());
app.use(express.static('public'));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shopping_db',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const emailTransporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: process.env.EMAIL_USER && process.env.EMAIL_PASSWORD
    ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
    : undefined
});

const signToken = (user) => jwt.sign(
  { userId: user.id, role: user.role },
  process.env.JWT_SECRET || 'secret',
  { expiresIn: '24h' }
);

function getToken(req) {
  const authHeader = req.headers.authorization;
  return (authHeader && authHeader.split(' ')[1]) || req.query.token;
}

function authenticateToken(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: '未登录' });

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (error, user) => {
    if (error) return res.status(403).json({ error: '登录已失效' });
    req.user = user;
    next();
  });
}

function optionalUser(req, _res, next) {
  const token = getToken(req);
  if (!token) return next();

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (error, user) => {
    if (!error) req.user = user;
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, fallbackHeaders = []) {
  const headers = rows.length ? Object.keys(rows[0]) : fallbackHeaders;
  if (!headers.length) return '';
  return [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(','))
  ].join('\n');
}

function parseCsv(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] || ''])
  ));
}

const exportHeaders = {
  products: ['id', 'name', 'description', 'category', 'price', 'stock_quantity', 'image_url', 'created_at'],
  orders: ['id', 'order_number', 'username', 'email', 'total_amount', 'status', 'payment_method', 'shipping_address', 'created_at'],
  'purchase-records': ['username', 'product_name', 'category', 'date', 'unit_price', 'quantity', 'amount', 'status', 'order_number'],
  logs: ['created_at', 'action', 'account', 'content', 'category', 'duration_seconds', 'ip_address', 'username', 'product_name', 'order_number']
};

function sendExport(res, format, name, rows) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(`\uFEFF${toCsv(rows, exportHeaders[name] || [])}`);
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`);
  return res.json(rows);
}

function normalizeImageUrl(value) {
  const imageUrl = String(value || '').trim();
  if (!imageUrl) return null;
  if (imageUrl.length > 1024) {
    throw new Error('图片地址不能超过 1024 个字符');
  }
  if (imageUrl.startsWith('/')) return imageUrl;
  try {
    const url = new URL(imageUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch (_) {
    // Fall through to the validation error below.
  }
  throw new Error('图片地址必须是 http://、https:// 或 /images/ 开头的地址');
}

async function logActivity(req, connection, { action, productId = null, orderId = null, metadata = null }) {
  await connection.query(
    `INSERT INTO activity_logs
     (user_id, action, category, product_id, order_id, duration_seconds, metadata, account, content, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user?.userId || null,
      action,
      metadata?.category || null,
      productId,
      orderId,
      metadata?.durationSeconds || null,
      metadata ? JSON.stringify(metadata) : null,
      metadata?.account || null,
      metadata?.content || null,
      req.ip,
      (req.headers['user-agent'] || '').slice(0, 255)
    ]
  );
}

async function writeOperationLog(req, connection, action, content, metadata = {}) {
  await logActivity(req, connection, {
    action,
    metadata: {
      ...metadata,
      account: metadata.account || `user:${req.user?.userId}`,
      content
    }
  });
}

async function sendOrderEmail(user, order) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) return;

  await emailTransporter.sendMail({
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: `订单确认 - ${order.order_number}`,
    html: `
      <h2>订单已确认</h2>
      <p>${user.full_name || user.username}，您好：</p>
      <p>您的订单 <strong>${order.order_number}</strong> 已付款成功。</p>
      <p>金额：<strong>¥${Number(order.total_amount).toFixed(2)}</strong></p>
    `
  });
}

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, fullName } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: '用户名、邮箱和密码必填' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name, role)
       VALUES (?, ?, ?, ?, 'customer')`,
      [username, email, passwordHash, fullName || username]
    );

    res.status(201).json({
      message: '注册成功',
      token: signToken({ id: result.insertId, role: 'customer' }),
      user: { id: result.insertId, username, role: 'customer' }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '用户名或邮箱已存在' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { emailOrUsername, password } = req.body;
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, password_hash, role FROM users WHERE email = ? OR username = ?',
      [emailOrUsername, emailOrUsername]
    );
    const user = users[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: '账号或密码错误' });
    }

    await pool.query(
      `INSERT INTO login_logs (user_id, account, role, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, user.username, user.role, req.ip, (req.headers['user-agent'] || '').slice(0, 255)]
    );
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, account, content, ip_address, user_agent)
       VALUES (?, 'login', ?, ?, ?, ?)`,
      [user.id, user.username, `${user.role} login`, req.ip, (req.headers['user-agent'] || '').slice(0, 255)]
    );

    res.json({
      token: signToken(user),
      userId: user.id,
      username: user.username,
      role: user.role
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.json({ message: '注销成功' });
});

app.get('/api/categories', async (_req, res) => {
  try {
    const [categories] = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  const { name, description } = req.body;
  try {
    const connection = await pool.getConnection();
    await connection.query(
      'INSERT INTO categories (name, description, created_by) VALUES (?, ?, ?)',
      [name, description || null, req.user.userId]
    );
    await logActivity(req, connection, { action: 'category_update', metadata: { operation: 'create', name } });
    await writeOperationLog(req, connection, 'sales_manage', `创建商品类别：${name}`, { category: name });
    connection.release();
    res.status(201).json({ message: '类别已添加' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categories/:id', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [[category]] = await connection.query('SELECT name FROM categories WHERE id = ?', [req.params.id]);
    if (!category) {
      connection.release();
      return res.status(404).json({ error: '类别不存在' });
    }
    await connection.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    await logActivity(req, connection, {
      action: 'category_update',
      metadata: { operation: 'delete', name: category.name }
    });
    await writeOperationLog(req, connection, 'sales_manage', `删除商品类别：${category.name}`, { category: category.name });
    connection.release();
    res.json({ message: '类别已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products', optionalUser, async (req, res) => {
  try {
    const { keyword, category } = req.query;
    const params = [];
    let sql = 'SELECT id, name, description, category, price, stock_quantity, image_url FROM products WHERE 1 = 1';
    if (keyword) {
      sql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += ' ORDER BY created_at DESC';

    const connection = await pool.getConnection();
    const [products] = await connection.query(sql, params);
    await logActivity(req, connection, { action: 'browse', metadata: { keyword, category } });
    connection.release();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/search', optionalUser, async (req, res) => {
  try {
    const { keyword, category } = req.query;
    const params = [];
    let sql = 'SELECT id, name, description, category, price, stock_quantity, image_url FROM products WHERE 1 = 1';
    if (keyword) {
      sql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    const connection = await pool.getConnection();
    const [products] = await connection.query(sql, params);
    await logActivity(req, connection, { action: 'browse', metadata: { keyword, category } });
    connection.release();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analytics/browse', optionalUser, async (req, res) => {
  const { productId, category, durationSeconds } = req.body;
  try {
    const connection = await pool.getConnection();
    await logActivity(req, connection, {
      action: 'browse',
      productId: productId || null,
      metadata: {
        category,
        durationSeconds: Math.max(0, Math.round(Number(durationSeconds) || 0))
      }
    });
    connection.release();
    res.status(201).json({ message: '浏览行为已记录' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  const { name, description, category, price, stockQuantity, imageUrl } = req.body;
  try {
    const normalizedImageUrl = normalizeImageUrl(imageUrl);
    const connection = await pool.getConnection();
    const [result] = await connection.query(
      `INSERT INTO products (name, description, category, price, stock_quantity, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, description, category, price, stockQuantity || 0, normalizedImageUrl]
    );
    await connection.query('INSERT IGNORE INTO categories (name, created_by) VALUES (?, ?)', [category, req.user.userId]);
    await logActivity(req, connection, {
      action: 'product_update',
      productId: result.insertId,
      metadata: { operation: 'create', name, category, price, stockQuantity }
    });
    await writeOperationLog(req, connection, 'sales_manage', `添加商品：${name}`, { category });
    connection.release();
    res.status(201).json({ message: '商品已添加', productId: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  const { name, description, category, price, stockQuantity, imageUrl } = req.body;
  try {
    const normalizedImageUrl = normalizeImageUrl(imageUrl);
    const connection = await pool.getConnection();
    await connection.query(
      `UPDATE products
       SET name = ?, description = ?, category = ?, price = ?, stock_quantity = ?, image_url = ?
       WHERE id = ?`,
      [name, description, category, price, stockQuantity, normalizedImageUrl, req.params.id]
    );
    await connection.query('INSERT IGNORE INTO categories (name, created_by) VALUES (?, ?)', [category, req.user.userId]);
    await logActivity(req, connection, {
      action: 'product_update',
      productId: req.params.id,
      metadata: { operation: 'update', name, category, price, stockQuantity }
    });
    await writeOperationLog(req, connection, 'sales_manage', `修改商品：${name}，价格 ${price}，库存 ${stockQuantity}`, { category });
    connection.release();
    res.json({ message: '商品已更新' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await logActivity(req, connection, {
      action: 'product_update',
      productId: req.params.id,
      metadata: { operation: 'delete' }
    });
    await connection.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    await writeOperationLog(req, connection, 'sales_manage', `删除商品 ID：${req.params.id}`);
    res.json({ message: '商品已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/api/cart', authenticateToken, requireRole('customer', 'admin'), async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  try {
    const connection = await pool.getConnection();
    const [[product]] = await connection.query(
      'SELECT stock_quantity FROM products WHERE id = ?',
      [productId]
    );
    if (!product || product.stock_quantity < quantity) {
      connection.release();
      return res.status(400).json({ error: '库存不足' });
    }
    await connection.query(
      `INSERT INTO shopping_cart (user_id, product_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [req.user.userId, productId, quantity]
    );
    await logActivity(req, connection, { action: 'cart_add', productId, metadata: { quantity } });
    connection.release();
    res.json({ message: '已加入购物车' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cart', authenticateToken, async (req, res) => {
  try {
    const [cartItems] = await pool.query(
      `SELECT sc.id, p.id AS productId, p.name, p.price, sc.quantity, p.image_url
       FROM shopping_cart sc
       JOIN products p ON sc.product_id = p.id
       WHERE sc.user_id = ?`,
      [req.user.userId]
    );
    res.json(cartItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/cart/:productId', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM shopping_cart WHERE user_id = ? AND product_id = ?',
      [req.user.userId, req.params.productId]
    );
    res.json({ message: '已移出购物车' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/likes', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.category, p.price, p.stock_quantity, p.image_url, l.created_at
       FROM product_likes l
       JOIN products p ON p.id = l.product_id
       WHERE l.user_id = ?
       ORDER BY l.created_at DESC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/likes/:productId', authenticateToken, requireRole('customer', 'admin'), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.query(
      'INSERT IGNORE INTO product_likes (user_id, product_id) VALUES (?, ?)',
      [req.user.userId, req.params.productId]
    );
    await logActivity(req, connection, {
      action: 'like',
      productId: req.params.productId,
      metadata: { content: `喜欢商品 ${req.params.productId}` }
    });
    connection.release();
    res.status(201).json({ message: '已收藏/喜欢' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/likes/:productId', authenticateToken, requireRole('customer', 'admin'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM product_likes WHERE user_id = ? AND product_id = ?',
      [req.user.userId, req.params.productId]
    );
    res.json({ message: '已取消喜欢' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', authenticateToken, requireRole('customer', 'admin'), async (req, res) => {
  const { shippingAddress, paymentMethod } = req.body;
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [cartItems] = await connection.query(
      `SELECT sc.product_id, sc.quantity, p.price, p.stock_quantity
       FROM shopping_cart sc
       JOIN products p ON sc.product_id = p.id
       WHERE sc.user_id = ? FOR UPDATE`,
      [req.user.userId]
    );
    if (cartItems.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: '购物车为空' });
    }
    for (const item of cartItems) {
      if (item.stock_quantity < item.quantity) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ error: '部分商品库存不足' });
      }
    }

    const totalAmount = cartItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [orderResult] = await connection.query(
      `INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, shipping_address)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [req.user.userId, orderNumber, totalAmount, paymentMethod, shippingAddress]
    );

    for (const item of cartItems) {
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [orderResult.insertId, item.product_id, item.quantity, item.price]
      );
      await connection.query(
        'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }
    await connection.query('DELETE FROM shopping_cart WHERE user_id = ?', [req.user.userId]);
    await logActivity(req, connection, {
      action: 'purchase',
      orderId: orderResult.insertId,
      metadata: { orderNumber, totalAmount, content: `创建订单 ${orderNumber}` }
    });

    await connection.commit();
    connection.release();
    res.status(201).json({ orderId: orderResult.insertId, orderNumber, totalAmount, message: '订单已创建' });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const isStaff = ['sales', 'admin'].includes(req.user.role);
    const [orders] = await pool.query(
      isStaff
        ? `SELECT o.*, u.username, u.email FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`
        : `SELECT id, order_number, total_amount, status, payment_method, shipping_address, created_at
           FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      isStaff ? [] : [req.user.userId]
    );
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:orderId', authenticateToken, async (req, res) => {
  try {
    const isStaff = ['sales', 'admin'].includes(req.user.role);
    const [orders] = await pool.query(
      isStaff
        ? 'SELECT o.*, u.username, u.email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?'
        : 'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      isStaff ? [req.params.orderId] : [req.params.orderId, req.user.userId]
    );
    if (orders.length === 0) return res.status(404).json({ error: '订单不存在' });

    const [items] = await pool.query(
      `SELECT oi.product_id, p.name, p.category, oi.quantity, oi.unit_price
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [req.params.orderId]
    );
    res.json({ ...orders[0], items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/orders/:orderId/pay', authenticateToken, requireRole('customer', 'admin'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[order]] = await connection.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = ?',
      [req.params.orderId, req.user.userId, 'pending']
    );
    if (!order) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: '订单不存在或状态不可付款' });
    }
    await connection.query('UPDATE orders SET status = ? WHERE id = ?', ['paid', req.params.orderId]);
    await logActivity(req, connection, { action: 'payment', orderId: req.params.orderId });
    const [[user]] = await connection.query('SELECT username, email, full_name FROM users WHERE id = ?', [req.user.userId]);
    await connection.commit();
    connection.release();

    sendOrderEmail(user, { ...order, status: 'paid' }).catch((error) => {
      console.error('Email send failed:', error.message);
    });
    res.json({ message: '付款成功，确认邮件已发送' });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/orders/:orderId/status', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
  if (!allowedStatuses.includes(status)) return res.status(400).json({ error: '订单状态无效' });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[order]] = await connection.query('SELECT status FROM orders WHERE id = ? FOR UPDATE', [req.params.orderId]);
    if (!order) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: '订单不存在' });
    }
    if (status === 'cancelled' && order.status !== 'cancelled') {
      const [items] = await connection.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [req.params.orderId]);
      for (const item of items) {
        await connection.query(
          'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
      }
    }
    await connection.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.orderId]);
    await writeOperationLog(req, connection, 'sales_manage', `更新订单 ${req.params.orderId} 状态为 ${status}`);
    await connection.commit();
    connection.release();
    res.json({ message: '订单状态已更新' });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/orders/:orderId/cancel', authenticateToken, requireRole('customer', 'admin'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[order]] = await connection.query(
      `SELECT status FROM orders
       WHERE id = ? AND user_id = ? AND status IN ('pending', 'paid')
       FOR UPDATE`,
      [req.params.orderId, req.user.userId]
    );
    if (!order) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: '订单不存在或状态不可取消' });
    }
    const [items] = await connection.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [req.params.orderId]);
    for (const item of items) {
      await connection.query(
        'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }
    await connection.query('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', req.params.orderId]);
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

app.get('/api/admin/sales', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    const [sales] = await pool.query(
      `SELECT id, username, email, full_name, created_at
       FROM users WHERE role = 'sales' ORDER BY created_at DESC`
    );
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/sales', authenticateToken, requireRole('admin'), async (req, res) => {
  const { username, email, password, fullName } = req.body;
  try {
    const passwordHash = await bcrypt.hash(password || 'sales123456', 10);
    const [result] = await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name, role)
       VALUES (?, ?, ?, ?, 'sales')`,
      [username, email, passwordHash, fullName || username]
    );
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, account, content, ip_address, user_agent)
       VALUES (?, 'admin_manage', ?, ?, ?, ?)`,
      [req.user.userId, `user:${req.user.userId}`, `添加销售人员：${username}`, req.ip, (req.headers['user-agent'] || '').slice(0, 255)]
    );
    res.status(201).json({ message: '销售人员已添加', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '用户名或邮箱已存在' });
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/sales/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE id = ? AND role = 'sales'", [req.params.id]);
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, account, content, ip_address, user_agent)
       VALUES (?, 'admin_manage', ?, ?, ?, ?)`,
      [req.user.userId, `user:${req.user.userId}`, `删除销售人员 ID：${req.params.id}`, req.ip, (req.headers['user-agent'] || '').slice(0, 255)]
    );
    res.json({ message: '销售人员已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/sales/:id/password', authenticateToken, requireRole('admin'), async (req, res) => {
  const { password } = req.body;
  try {
    const passwordHash = await bcrypt.hash(password || 'sales123456', 10);
    await pool.query(
      "UPDATE users SET password_hash = ? WHERE id = ? AND role = 'sales'",
      [passwordHash, req.params.id]
    );
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, account, content, ip_address, user_agent)
       VALUES (?, 'admin_manage', ?, ?, ?, ?)`,
      [req.user.userId, `user:${req.user.userId}`, `重置销售人员 ID ${req.params.id} 的密码`, req.ip, (req.headers['user-agent'] || '').slice(0, 255)]
    );
    res.json({ message: '销售人员密码已重置' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sales/status', authenticateToken, requireRole('sales', 'admin'), async (_req, res) => {
  try {
    const [[summary]] = await pool.query(`
      SELECT
        COUNT(*) AS products,
        SUM(stock_quantity) AS total_stock,
        SUM(stock_quantity <= 10) AS low_stock,
        SUM(stock_quantity = 0) AS out_of_stock
      FROM products
    `);
    const [ordersByStatus] = await pool.query(`
      SELECT status, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS revenue
      FROM orders GROUP BY status
    `);
    res.json({ summary, ordersByStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sales/logs', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT l.*, u.username, p.name AS product_name, o.order_number
       FROM activity_logs l
       LEFT JOIN users u ON l.user_id = u.id
       LEFT JOIN products p ON l.product_id = p.id
       LEFT JOIN orders o ON l.order_id = o.id
       ORDER BY l.created_at DESC
       LIMIT ?`,
      [Math.min(Number(req.query.limit) || 100, 300)]
    );
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/login-logs', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.*, u.username
       FROM login_logs l
       LEFT JOIN users u ON l.user_id = u.id
       ORDER BY l.created_at DESC
       LIMIT ?`,
      [Math.min(Number(req.query.limit) || 100, 300)]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/purchase-records', authenticateToken, requireRole('sales', 'admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        u.username,
        p.category,
        DATE(o.created_at) AS date,
        oi.unit_price,
        oi.quantity,
        oi.unit_price * oi.quantity AS amount,
        o.status,
        o.order_number
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN users u ON o.user_id = u.id
      JOIN products p ON oi.product_id = p.id
      ORDER BY o.created_at DESC
      LIMIT 500
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/profile', authenticateToken, async (req, res) => {
  const userId = req.query.userId && req.user.role === 'admin' ? req.query.userId : req.user.userId;
  try {
    const [[user]] = await pool.query('SELECT id, username, address FROM users WHERE id = ?', [userId]);
    const [categorySpend] = await pool.query(`
      SELECT p.category,
             SUM(oi.quantity) AS quantity,
             SUM(oi.quantity * oi.unit_price) AS amount
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE o.user_id = ? AND o.status IN ('paid','shipped','delivered')
      GROUP BY p.category
      ORDER BY quantity DESC, amount DESC
    `, [userId]);
    const [likedProducts] = await pool.query(`
      SELECT p.id, p.name, p.category, p.price, p.stock_quantity, p.image_url, l.created_at
      FROM product_likes l
      JOIN products p ON p.id = l.product_id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
      LIMIT 12
    `, [userId]);
    const [browsePrefs] = await pool.query(`
      SELECT category,
             COUNT(*) AS views,
             COALESCE(SUM(duration_seconds), 0) AS duration_seconds
      FROM activity_logs
      WHERE user_id = ? AND action = 'browse' AND category IS NOT NULL
      GROUP BY category
      ORDER BY duration_seconds DESC, views DESC
    `, [userId]);
    const [[spend]] = await pool.query(`
      SELECT COUNT(*) AS orders,
             COALESCE(SUM(total_amount), 0) AS total_spend,
             COALESCE(AVG(total_amount), 0) AS avg_order_value
      FROM orders
      WHERE user_id = ? AND status IN ('paid','shipped','delivered')
    `, [userId]);

    res.json({
      user,
      region: user?.address?.split(/[ ,，]/)[0] || '未知',
      purchasingPower: Number(spend.total_spend) >= 3000 ? '高' : Number(spend.total_spend) >= 1000 ? '中' : '低',
      favoriteCategory: categorySpend[0]?.category || '暂无',
      spend,
      categorySpend,
      browsePrefs,
      likedProducts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/trends', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  const granularity = ['day', 'week', 'month'].includes(req.query.granularity) ? req.query.granularity : 'day';
  const periodSql = {
    day: "DATE_FORMAT(o.created_at, '%Y-%m-%d')",
    week: "DATE_FORMAT(DATE_SUB(o.created_at, INTERVAL WEEKDAY(o.created_at) DAY), '%Y-%m-%d')",
    month: "DATE_FORMAT(o.created_at, '%Y-%m')"
  }[granularity];

  try {
    const [rows] = await pool.query(`
      SELECT ${periodSql} AS period,
             COUNT(DISTINCT o.id) AS orders,
             COALESCE(SUM(o.total_amount), 0) AS revenue,
             COALESCE(SUM(oi.quantity), 0) AS units
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status IN ('paid','shipped','delivered')
      GROUP BY period
      ORDER BY period ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/forecast', authenticateToken, requireRole('sales', 'admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DATE_FORMAT(o.created_at, '%Y-%m-%d') AS date,
             COALESCE(SUM(o.total_amount), 0) AS revenue
      FROM orders o
      WHERE o.status IN ('paid','shipped','delivered')
      GROUP BY DATE_FORMAT(o.created_at, '%Y-%m-%d')
      ORDER BY date ASC
      LIMIT 60
    `);
    const values = rows.map((row) => Number(row.revenue));
    const n = values.length;
    const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(n, 1);
    const slope = n > 1 ? (values[n - 1] - values[0]) / (n - 1) : 0;
    const forecast = Array.from({ length: 7 }, (_, index) => ({
      dayOffset: index + 1,
      predictedRevenue: Math.max(0, avg + slope * (index + 1))
    }));
    const mae = n > 2
      ? values.slice(1).reduce((sum, value, index) => sum + Math.abs(value - values[index]), 0) / (n - 1)
      : 0;
    res.json({ history: rows, model: 'moving-average-with-linear-slope', evaluation: { mae }, forecast });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/anomalies', authenticateToken, requireRole('sales', 'admin'), async (_req, res) => {
  try {
    const [daily] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
             COUNT(*) AS orders,
             COALESCE(SUM(total_amount), 0) AS revenue
      FROM orders
      WHERE status IN ('paid','shipped','delivered')
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
      ORDER BY date DESC
      LIMIT 30
    `);
    const revenues = daily.map((row) => Number(row.revenue));
    const avg = revenues.reduce((sum, value) => sum + value, 0) / Math.max(revenues.length, 1);
    const variance = revenues.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / Math.max(revenues.length, 1);
    const stddev = Math.sqrt(variance);
    const revenueAnomalies = daily.filter((row) => stddev > 0 && Math.abs(Number(row.revenue) - avg) > 2 * stddev);
    const [stockAnomalies] = await pool.query(`
      SELECT id, name, category, stock_quantity
      FROM products
      WHERE stock_quantity <= 10
      ORDER BY stock_quantity ASC
      LIMIT 30
    `);
    res.json({
      generatedAt: new Date().toISOString(),
      revenueBaseline: { avg, stddev },
      revenueAnomalies,
      stockAnomalies,
      level: revenueAnomalies.length || stockAnomalies.length ? 'warning' : 'normal'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/rankings', authenticateToken, requireRole('sales', 'admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.id, p.name, p.category,
             COALESCE(SUM(oi.quantity), 0) AS total_sold,
             COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON o.id = oi.order_id AND o.status IN ('paid','shipped','delivered')
      GROUP BY p.id, p.name, p.category
      ORDER BY total_sold DESC, revenue DESC
      LIMIT 20
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/recommendations/also-bought/:productId', optionalUser, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const scores = new Map();
    const reasons = new Map();

    const addScore = (id, score, source) => {
      const candidateId = Number(id);
      const value = Number(score) || 0;
      if (!candidateId || candidateId === productId || value <= 0) return;
      scores.set(candidateId, (scores.get(candidateId) || 0) + value);
      if (!reasons.has(candidateId)) reasons.set(candidateId, []);
      reasons.get(candidateId).push(source);
    };

    const [purchaseRows] = await pool.query(`
      SELECT peer_item.product_id AS product_id,
             COUNT(DISTINCT peer_order.id) AS co_count,
             COALESCE(SUM(peer_item.quantity), 0) AS units
      FROM orders source_order
      JOIN order_items source_item ON source_item.order_id = source_order.id
      JOIN orders peer_order ON peer_order.user_id = source_order.user_id
      JOIN order_items peer_item ON peer_item.order_id = peer_order.id
      WHERE source_item.product_id = ?
        AND peer_item.product_id <> ?
        AND source_order.status IN ('paid','shipped','delivered')
        AND peer_order.status IN ('paid','shipped','delivered')
      GROUP BY peer_item.product_id
    `, [productId, productId]);
    purchaseRows.forEach((row) => {
      addScore(row.product_id, Number(row.co_count) * 8 + Number(row.units) * 2, 'purchase-cooccurrence');
    });

    const [cartRows] = await pool.query(`
      SELECT peer.product_id,
             COUNT(DISTINCT peer.user_id) AS co_count,
             COALESCE(SUM(peer.quantity), 0) AS quantity
      FROM shopping_cart source
      JOIN shopping_cart peer
        ON peer.user_id = source.user_id
       AND peer.product_id <> source.product_id
      WHERE source.product_id = ?
      GROUP BY peer.product_id
    `, [productId]);
    cartRows.forEach((row) => {
      addScore(row.product_id, Number(row.co_count) * 5 + Number(row.quantity), 'cart-cooccurrence');
    });

    const [likeRows] = await pool.query(`
      SELECT peer.product_id,
             COUNT(DISTINCT peer.user_id) AS co_count
      FROM product_likes source
      JOIN product_likes peer
        ON peer.user_id = source.user_id
       AND peer.product_id <> source.product_id
      WHERE source.product_id = ?
      GROUP BY peer.product_id
    `, [productId]);
    likeRows.forEach((row) => {
      addScore(row.product_id, Number(row.co_count) * 4, 'like-cooccurrence');
    });

    if (req.user?.userId) {
      const [browseRows] = await pool.query(`
        SELECT product_id,
               MAX(duration_seconds) AS max_duration,
               SUM(duration_seconds) AS total_duration,
               MIN(ABS(TIMESTAMPDIFF(SECOND, created_at, NOW()))) AS seconds_ago
        FROM activity_logs
        WHERE user_id = ?
          AND action = 'browse'
          AND product_id IS NOT NULL
          AND product_id <> ?
          AND created_at >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
        GROUP BY product_id
        ORDER BY seconds_ago ASC
        LIMIT 20
      `, [req.user.userId, productId]);
      browseRows.forEach((row) => {
        const durationScore = Math.min(Number(row.total_duration) || 0, 120) / 10;
        const longStayBonus = Math.min(Number(row.max_duration) || 0, 60) / 15;
        const recencyScore = 1 / (1 + (Number(row.seconds_ago) || 0) / 300);
        addScore(row.product_id, (durationScore + longStayBonus) * recencyScore * 3, 'recent-browse');
      });
    }

    const [categoryRows] = await pool.query(`
      SELECT p2.id AS product_id
      FROM products p1
      JOIN products p2 ON p2.category = p1.category AND p2.id <> p1.id
      WHERE p1.id = ?
      ORDER BY p2.stock_quantity DESC, p2.created_at DESC
      LIMIT 20
    `, [productId]);
    categoryRows.forEach((row) => addScore(row.product_id, 0.4, 'same-category-low-weight'));

    const [popularRows] = await pool.query(`
      SELECT p.id AS product_id,
             COALESCE(SUM(oi.quantity), 0) AS sold
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      WHERE p.id <> ?
      GROUP BY p.id, p.created_at
      ORDER BY sold DESC, p.created_at DESC
      LIMIT 20
    `, [productId]);
    popularRows.forEach((row, index) => {
      addScore(row.product_id, 0.2 + Number(row.sold) * 0.1 + (20 - index) * 0.005, 'popular-fallback');
    });

    const ranked = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (!ranked.length) return res.json([]);

    const ids = ranked.map(([id]) => id);
    const [products] = await pool.query(`
      SELECT id, name, category, price, stock_quantity, image_url
      FROM products
      WHERE id IN (${ids.map(() => '?').join(',')})
    `, ids);
    const productMap = new Map(products.map((product) => [product.id, product]));

    res.json(ranked
      .map(([id, score]) => ({
        ...productMap.get(id),
        score,
        reason: [...new Set(reasons.get(id) || [])].join(',')
      }))
      .filter((product) => product.id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/recommendations/collaborative', authenticateToken, async (req, res) => {
  try {
    const [interactions] = await pool.query(`
      SELECT user_id, product_id, MAX(weight) AS weight
      FROM (
        SELECT o.user_id, oi.product_id, 5.0 AS weight
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status IN ('paid','shipped','delivered')

        UNION ALL
        SELECT user_id, product_id, 3.0 AS weight
        FROM shopping_cart

        UNION ALL
        SELECT user_id, product_id, 2.0 AS weight
        FROM product_likes

        UNION ALL
        SELECT user_id, product_id,
               CASE
                 WHEN duration_seconds > 10 THEN 1.0
                 WHEN duration_seconds <= 3 THEN 0.2
                 ELSE 0.5
               END AS weight
        FROM activity_logs
        WHERE action = 'browse'
          AND product_id IS NOT NULL
          AND user_id IS NOT NULL
          AND duration_seconds IS NOT NULL
      ) weighted_events
      GROUP BY user_id, product_id
    `);

    const byUser = new Map();
    const currentUserItems = new Map();
    for (const row of interactions) {
      const userId = Number(row.user_id);
      const productId = Number(row.product_id);
      const weight = Number(row.weight);
      if (!byUser.has(userId)) byUser.set(userId, []);
      byUser.get(userId).push({ productId, weight });
      if (userId === req.user.userId) currentUserItems.set(productId, weight);
    }

    if (currentUserItems.size === 0) {
      const [popular] = await pool.query(`
        SELECT p.id, p.name, p.category, p.price, p.stock_quantity, p.image_url,
               COALESCE(SUM(oi.quantity), 0) AS item_cf_score
        FROM products p
        LEFT JOIN order_items oi ON oi.product_id = p.id
        GROUP BY p.id, p.name, p.category, p.price, p.stock_quantity, p.image_url
        ORDER BY item_cf_score DESC, p.created_at DESC
        LIMIT 8
      `);
      return res.json({
        strategy: 'item-based-collaborative-filtering-popular-fallback',
        weights: { purchase: 5.0, cart: 3.0, like: 2.0, browseLong: 1.0, browseShort: 0.2 },
        products: popular
      });
    }

    const itemNorm = new Map();
    const similarity = new Map();
    for (const items of byUser.values()) {
      for (const item of items) {
        itemNorm.set(item.productId, (itemNorm.get(item.productId) || 0) + item.weight * item.weight);
      }
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i];
          const b = items[j];
          const key = a.productId < b.productId ? `${a.productId}:${b.productId}` : `${b.productId}:${a.productId}`;
          similarity.set(key, (similarity.get(key) || 0) + a.weight * b.weight);
        }
      }
    }

    const scores = new Map();
    const reasons = new Map();
    for (const [sourceProductId, sourceWeight] of currentUserItems.entries()) {
      for (const [key, dot] of similarity.entries()) {
        const [left, right] = key.split(':').map(Number);
        let candidateId = null;
        if (left === sourceProductId) candidateId = right;
        if (right === sourceProductId) candidateId = left;
        if (!candidateId || currentUserItems.has(candidateId)) continue;

        const denom = Math.sqrt(itemNorm.get(sourceProductId) || 1) * Math.sqrt(itemNorm.get(candidateId) || 1);
        const cosine = denom ? dot / denom : 0;
        const score = cosine * sourceWeight;
        scores.set(candidateId, (scores.get(candidateId) || 0) + score);
        reasons.set(candidateId, Math.max(reasons.get(candidateId) || 0, cosine));
      }
    }

    const ranked = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (!ranked.length) {
      const [popular] = await pool.query(`
        SELECT p.id, p.name, p.category, p.price, p.stock_quantity, p.image_url,
               COALESCE(SUM(oi.quantity), 0) AS item_cf_score
        FROM products p
        LEFT JOIN order_items oi ON oi.product_id = p.id
        WHERE p.id NOT IN (${[...currentUserItems.keys()].map(() => '?').join(',')})
        GROUP BY p.id, p.name, p.category, p.price, p.stock_quantity, p.image_url
        ORDER BY item_cf_score DESC, p.created_at DESC
        LIMIT 8
      `, [...currentUserItems.keys()]);
      return res.json({
        strategy: 'item-based-collaborative-filtering-popular-fallback',
        weights: { purchase: 5.0, cart: 3.0, like: 2.0, browseLong: 1.0, browseShort: 0.2 },
        products: popular
      });
    }

    const ids = ranked.map(([id]) => id);
    const [products] = await pool.query(`
      SELECT id, name, category, price, stock_quantity, image_url
      FROM products
      WHERE id IN (${ids.map(() => '?').join(',')})
    `, ids);
    const productMap = new Map(products.map((product) => [product.id, product]));

    res.json({
      strategy: 'item-based-collaborative-filtering',
      weights: { purchase: 5.0, cart: 3.0, like: 2.0, browseLong: 1.0, browseShort: 0.2 },
      products: ranked
        .map(([id, score]) => ({
          ...productMap.get(id),
          item_cf_score: score,
          max_similarity: reasons.get(id) || 0
        }))
        .filter((product) => product.id)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/:dataset', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const { dataset } = req.params;

  try {
    let rows;
    if (dataset === 'products') {
      [rows] = await pool.query(`
        SELECT id, name, description, category, price, stock_quantity, image_url, created_at
        FROM products ORDER BY id
      `);
    } else if (dataset === 'orders') {
      [rows] = await pool.query(`
        SELECT o.id, o.order_number, u.username, u.email, o.total_amount, o.status,
               o.payment_method, o.shipping_address, o.created_at
        FROM orders o
        JOIN users u ON u.id = o.user_id
        ORDER BY o.created_at DESC
      `);
    } else if (dataset === 'purchase-records') {
      [rows] = await pool.query(`
        SELECT u.username, p.name AS product_name, p.category, DATE(o.created_at) AS date,
               oi.unit_price, oi.quantity, oi.unit_price * oi.quantity AS amount, o.status, o.order_number
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN users u ON o.user_id = u.id
        JOIN products p ON oi.product_id = p.id
        ORDER BY o.created_at DESC
      `);
    } else if (dataset === 'logs') {
      [rows] = await pool.query(`
        SELECT l.created_at, l.action, l.account, l.content, l.category, l.duration_seconds,
               l.ip_address, u.username, p.name AS product_name, o.order_number
        FROM activity_logs l
        LEFT JOIN users u ON l.user_id = u.id
        LEFT JOIN products p ON l.product_id = p.id
        LEFT JOIN orders o ON l.order_id = o.id
        ORDER BY l.created_at DESC
        LIMIT 2000
      `);
    } else {
      return res.status(404).json({ error: '不支持的数据集' });
    }

    return sendExport(res, format, dataset, rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/import/products', authenticateToken, requireRole('sales', 'admin'), async (req, res) => {
  let connection;
  try {
    const contentType = req.headers['content-type'] || '';
    const format = req.query.format || (contentType.includes('json') ? 'json' : 'csv');
    let parsed;
    if (format === 'json') {
      parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else if (format === 'csv') {
      parsed = parseCsv(req.body || '');
    } else {
      return res.status(400).json({ error: '不支持的导入格式' });
    }
    const rows = Array.isArray(parsed) ? parsed : parsed?.products;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: '没有可导入的商品数据' });
    }

    connection = await pool.getConnection();
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = row.name || row['商品名称'];
      const category = row.category || row['类别'];
      const price = Number(row.price || row['价格']);
      const stockQuantity = Number(row.stock_quantity || row.stockQuantity || row['库存'] || 0);
      if (!name || !category || Number.isNaN(price)) {
        skipped += 1;
        continue;
      }

      let normalizedImageUrl = null;
      try {
        normalizedImageUrl = normalizeImageUrl(row.image_url || row.imageUrl || row['图片地址']);
      } catch (_) {
        skipped += 1;
        continue;
      }

      await connection.query(
        `INSERT INTO products (name, description, category, price, stock_quantity, image_url)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           description = VALUES(description),
           category = VALUES(category),
           price = VALUES(price),
           stock_quantity = VALUES(stock_quantity),
           image_url = VALUES(image_url)`,
        [
          name,
          row.description || row['描述'] || '',
          category,
          price,
          stockQuantity,
          normalizedImageUrl
        ]
      );
      await connection.query('INSERT IGNORE INTO categories (name, created_by) VALUES (?, ?)', [category, req.user.userId]);
      imported += 1;
    }

    await writeOperationLog(req, connection, 'sales_manage', `导入商品 ${imported} 条，跳过 ${skipped} 条`);
    res.json({ message: '商品导入完成', imported, skipped });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/reports/sales', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
        COUNT(*) AS total_orders,
        COALESCE(SUM(total_amount), 0) AS total_revenue,
        COALESCE(AVG(total_amount), 0) AS avg_order_value,
        COUNT(DISTINCT user_id) AS total_customers
      FROM orders
      WHERE status IN ('paid', 'shipped', 'delivered')
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
      ORDER BY date DESC
      LIMIT 30
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/top-products', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.id, p.name, p.category, SUM(oi.quantity) AS total_sold,
             SUM(oi.quantity * oi.unit_price) AS total_revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN ('paid', 'shipped', 'delivered')
      GROUP BY p.id, p.name, p.category
      ORDER BY total_sold DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/category', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.category,
             COUNT(DISTINCT p.id) AS product_count,
             COALESCE(SUM(p.stock_quantity), 0) AS stock,
             COALESCE(SUM(CASE WHEN o.status IN ('paid','shipped','delivered') THEN oi.quantity ELSE 0 END), 0) AS sold,
             COALESCE(SUM(CASE WHEN o.status IN ('paid','shipped','delivered') THEN oi.quantity * oi.unit_price ELSE 0 END), 0) AS revenue
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON o.id = oi.order_id
      GROUP BY p.category
      ORDER BY revenue DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/inventory', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT category,
             COUNT(*) AS product_count,
             SUM(stock_quantity) AS total_stock,
             SUM(stock_quantity = 0) AS out_of_stock,
             SUM(stock_quantity BETWEEN 1 AND 10) AS low_stock
      FROM products
      GROUP BY category
      ORDER BY low_stock DESC, total_stock ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
