const mysql = require('mysql2/promise');
require('dotenv').config();

const products = [
  ['无线蓝牙耳机', '主动降噪，续航约30小时', '音频', 299.99, 100, 'https://placehold.co/500x300/2f80ed/ffffff?text=Headphones'],
  ['机械键盘', '104键机械键盘，青轴，RGB背光', '电子产品', 599.99, 80, 'https://placehold.co/500x300/27ae60/ffffff?text=Keyboard'],
  ['无线鼠标', '高精度无线鼠标，适合办公和游戏', '电子产品', 149.99, 120, 'https://placehold.co/500x300/e74c3c/ffffff?text=Mouse'],
  ['4K网络摄像头', '4K高清摄像头，支持自动对焦', '电子产品', 799.99, 45, 'https://placehold.co/500x300/8e44ad/ffffff?text=Webcam'],
  ['便携充电宝', '20000mAh，支持快充', '配件', 129.99, 150, 'https://placehold.co/500x300/f39c12/ffffff?text=PowerBank'],
  ['智能手表', '心率监测、运动记录和消息提醒', '智能设备', 899.99, 60, 'https://placehold.co/500x300/16a085/ffffff?text=Watch'],
  ['蓝牙音箱', '便携式蓝牙音箱，防水设计', '音频', 249.99, 70, 'https://placehold.co/500x300/e67e22/ffffff?text=Speaker'],
  ['USB-C扩展坞', '支持 HDMI、USB 3.0 和 SD 卡', '配件', 79.99, 200, 'https://placehold.co/500x300/52616b/ffffff?text=USB-C+Hub'],
  ['便携固态硬盘', '1TB移动固态硬盘，传输速度快', '存储', 699.99, 35, 'https://placehold.co/500x300/34495e/ffffff?text=SSD'],
  ['笔记本散热垫', '双风扇散热，USB供电', '配件', 99.99, 90, 'https://placehold.co/500x300/2980b9/ffffff?text=Cooler']
];

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

  const [[existing]] = await connection.query('SELECT COUNT(*) AS count FROM products');
  if (existing.count > 0) {
    console.log(`Products already exist (${existing.count}), skipping seed.`);
    await connection.end();
    return;
  }

  for (const product of products) {
    await connection.query(
      `INSERT INTO products (name, description, category, price, stock_quantity, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      product
    );
    await connection.query(
      'INSERT IGNORE INTO categories (name) VALUES (?)',
      [product[2]]
    );
  }

  await connection.end();
  console.log(`Seeded ${products.length} products.`);
}

run().catch((error) => {
  console.error('Product seed failed:', error);
  process.exit(1);
});
