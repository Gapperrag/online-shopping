const mysql = require('mysql2/promise');
require('dotenv').config();

async function seedProducts() {
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

        // 示例产品数据
        const products = [
            {
                name: '无线蓝牙耳机',
                description: '高品质无线蓝牙耳机，支持主动降噪，续航30小时',
                category: '电子产品',
                price: 299.99,
                image_url: 'https://placehold.co/250x200/3498db/white?text=Headphones'
            },
            {
                name: '机械键盘',
                description: '104键机械键盘，青轴开关，RGB背光',
                category: '电子产品',
                price: 599.99,
                image_url: 'https://placehold.co/250x200/2ecc71/white?text=Keyboard'
            },
            {
                name: '无线鼠标',
                description: '精准定位无线鼠标，续航6个月',
                category: '电子产品',
                price: 149.99,
                image_url: 'https://placehold.co/250x200/e74c3c/white?text=Mouse'
            },
            {
                name: '4K网络摄像头',
                description: '4K高清网络摄像头，支持夜视和双向语音',
                category: '电子产品',
                price: 799.99,
                image_url: 'https://placehold.co/250x200/9b59b6/white?text=Webcam'
            },
            {
                name: '便携式充电宝',
                description: '20000mAh充电宝，支持快速充电，双输出端口',
                category: '电子产品',
                price: 129.99,
                image_url: 'https://placehold.co/250x200/f39c12/white?text=PowerBank'
            },
            {
                name: '智能手表',
                description: '心率监测、运动追踪、防水智能手表',
                category: '智能设备',
                price: 899.99,
                image_url: 'https://placehold.co/250x200/1abc9c/white?text=Watch'
            },
            {
                name: '无线充电板',
                description: '15W快速无线充电板，兼容所有Qi标准设备',
                category: '电子产品',
                price: 89.99,
                image_url: 'https://placehold.co/250x200/34495e/white?text=Charger'
            },
            {
                name: '蓝牙音箱',
                description: '便携式蓝牙音箱，360度环绕音效，防水设计',
                category: '音频',
                price: 249.99,
                image_url: 'https://placehold.co/250x200/e67e22/white?text=Speaker'
            },
            {
                name: 'USB-C转接器',
                description: '多功能USB-C转接器，支持HDMI、USB 3.0、SD卡',
                category: '配件',
                price: 79.99,
                image_url: 'https://placehold.co/250x200/95a5a6/white?text=USB-C+Hub'
            },
            {
                name: '降噪耳塞',
                description: '真无线降噪耳塞，主动降噪技术，通话清晰',
                category: '音频',
                price: 449.99,
                image_url: 'https://placehold.co/250x200/16a085/white?text=Earbuds'
            },
            {
                name: '笔记本散热垫',
                description: '双风扇笔记本散热垫，USB供电',
                category: '配件',
                price: 99.99,
                image_url: 'https://placehold.co/250x200/2980b9/white?text=Cooler'
            },
            {
                name: '便携式固态硬盘',
                description: '1TB便携式固态硬盘，传输速度550MB/s',
                category: '存储',
                price: 699.99,
                image_url: 'https://placehold.co/250x200/8e44ad/white?text=SSD'
            },
            {
                name: '游戏鼠标垫',
                description: '超大鼠标垫，1200x600mm，防滑底面，表面顺滑',
                category: '配件',
                price: 159.99,
                image_url: 'https://placehold.co/250x200/c0392b/white?text=MousePad'
            },
            {
                name: '显示器挂灯',
                description: '自适应屏幕挂灯，USB供电，不伤眼睛',
                category: '电子产品',
                price: 199.99,
                image_url: 'https://placehold.co/250x200/d35400/white?text=Light'
            },
            {
                name: '便携式投影仪',
                description: '1080P便携投影仪，亮度500流明，内置电池8小时',
                category: '电子产品',
                price: 1299.99,
                image_url: 'https://placehold.co/250x200/27ae60/white?text=Projector'
            }
        ];

        // 检查是否已存在产品
        const [existing] = await connection.query('SELECT COUNT(*) as count FROM products');
        
        if (existing[0].count > 0) {
            console.log(`🔄 数据库中已存在 ${existing[0].count} 件产品，清空后重新添加...`);
            // 临时禁用外键检查以清空产品表
            await connection.query('SET FOREIGN_KEY_CHECKS=0');
            await connection.query('DELETE FROM products');
            await connection.query('SET FOREIGN_KEY_CHECKS=1');
            console.log('✅ 旧产品已清空');
        }

        // 添加产品
        let addedCount = 0;
        for (const product of products) {
            try {
                await connection.query(
                    `INSERT INTO products (name, description, category, price, stock_quantity, image_url) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [product.name, product.description, product.category, product.price, 100, product.image_url]
                );
                addedCount++;
            } catch (e) {
                console.error(`❌ 添加产品 "${product.name}" 失败:`, e.message);
            }
        }

        await connection.end();
        console.log(`✅ 成功添加 ${addedCount} 件产品到数据库`);
        console.log('📊 产品列表：');
        products.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.name} - ¥${p.price} (库存: 100)`);
        });
    } catch (error) {
        console.error('❌ 添加产品失败：', error.message);
    }
}

seedProducts();
