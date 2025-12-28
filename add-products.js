const mysql = require('mysql2/promise');
require('dotenv').config();

async function addProducts() {
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

        // 新产品数据（3个新商品）
        const newProducts = [
            {
                name: '游戏鼠标垫',
                description: '超大鼠标垫，1200x600mm，防滑底面，表面顺滑',
                category: '配件',
                price: 159.99,
                image_url: 'https://via.placeholder.com/250x200?text=Mouse+Pad'
            },
            {
                name: '显示器挂灯',
                description: '自适应屏幕挂灯，USB供电，不伤眼睛',
                category: '电子产品',
                price: 199.99,
                image_url: 'https://via.placeholder.com/250x200?text=Monitor+Light'
            },
            {
                name: '便携式投影仪',
                description: '1080P便携投影仪，亮度500流明，内置电池8小时',
                category: '电子产品',
                price: 1299.99,
                image_url: 'https://via.placeholder.com/250x200?text=Projector'
            }
        ];

        // 添加产品
        let addedCount = 0;
        for (const product of newProducts) {
            try {
                // 检查产品是否已存在
                const [existing] = await connection.query(
                    'SELECT id FROM products WHERE name = ?',
                    [product.name]
                );
                
                if (existing.length === 0) {
                    await connection.query(
                        `INSERT INTO products (name, description, category, price, stock_quantity, image_url) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [product.name, product.description, product.category, product.price, 100, product.image_url]
                    );
                    addedCount++;
                    console.log(`✅ 已添加: ${product.name}`);
                } else {
                    console.log(`ℹ️  产品已存在，跳过: ${product.name}`);
                }
            } catch (e) {
                console.error(`❌ 添加产品 "${product.name}" 失败:`, e.message);
            }
        }

        await connection.end();
        console.log(`\n✅ 成功添加 ${addedCount} 件新产品到数据库`);
        console.log('\n📊 新增的产品：');
        newProducts.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.name} - ¥${p.price} (库存: 100)`);
        });
    } catch (error) {
        console.error('❌ 添加产品失败：', error.message);
    }
}

addProducts();
