const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        charset: 'utf8'
    });

    const [rows] = await conn.query('SELECT COUNT(*) as total FROM products');
    console.log('总商品数:', rows[0].total);

    const [products] = await conn.query('SELECT id, name, price FROM products ORDER BY id DESC LIMIT 3');
    console.log('\n最新3件商品:');
    products.forEach(p => console.log(`  ${p.id}. ${p.name} - ¥${p.price}`));

    conn.end();
})();
