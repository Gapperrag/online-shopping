const http = require('http');

// 测试两种方式的登录

console.log('=== 测试 1: 直接 HTTP 请求 ===');
const data = JSON.stringify({
    email: 'admin@example.com',
    password: 'admin123456'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => {
        body += chunk;
    });
    res.on('end', () => {
        console.log('状态码:', res.statusCode);
        try {
            const json = JSON.parse(body);
            console.log('响应数据:');
            console.log('  token:', json.token ? '✅ 存在' : '❌ 不存在');
            console.log('  role:', json.role ? `✅ ${json.role}` : '❌ 不存在');
            console.log('  userId:', json.userId);
            console.log('  username:', json.username);
            console.log('\n完整响应:');
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.error('JSON 解析错误:', e.message);
            console.log('原始响应:', body);
        }
    });
});

req.on('error', (error) => {
    console.error('请求失败:', error.message);
});

req.write(data);
req.end();
