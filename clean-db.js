const mysql = require('mysql2/promise');
require('dotenv').config();

async function cleanDatabase() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            charset: 'utf8'
        });

        console.log('✅ 已连接到数据库');
        await connection.query('SET NAMES utf8');

        // 删除所有表（按依赖顺序）
        const tables = ['order_items', 'orders', 'shopping_cart', 'products', 'users'];
        
        for (const table of tables) {
            try {
                await connection.query(`DROP TABLE IF EXISTS ${table}`);
                console.log(`✅ 已删除表: ${table}`);
            } catch (e) {
                console.log(`ℹ️  表 ${table} 不存在或删除失败`);
            }
        }

        await connection.end();
        console.log('✅ 数据库清理完成！');
    } catch (error) {
        console.error('❌ 数据库清理失败：', error.message);
    }
}

cleanDatabase();
