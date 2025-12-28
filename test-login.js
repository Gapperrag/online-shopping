const http = require('http');

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
        console.log('响应:', body);
        try {
            const json = JSON.parse(body);
            console.log('\n解析后的响应:');
            console.log('- token:', json.token ? '✅ 存在' : '❌ 缺失');
            console.log('- userId:', json.userId);
            console.log('- username:', json.username);
            console.log('- role:', json.role ? `✅ ${json.role}` : '❌ 缺失');
        } catch (e) {
            console.error('JSON 解析错误:', e.message);
        }
    });
});

req.on('error', (error) => {
    console.error('请求失败:', error.message);
});

req.write(data);
req.end();
