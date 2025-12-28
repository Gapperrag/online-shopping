# 在线购物平台 - 云服务器部署指南

## 📋 目录
1. [云服务选择](#云服务选择)
2. [服务器购买与配置](#服务器购买与配置)
3. [环境安装](#环境安装)
4. [项目部署](#项目部署)
5. [数据库配置](#数据库配置)
6. [进程管理与自启](#进程管理与自启)
7. [反向代理配置](#反向代理配置)
8. [防火墙与安全](#防火墙与安全)
9. [监控与维护](#监控与维护)
10. [常见问题](#常见问题)
11. [实验报告信息](#实验报告信息)

---

## 云服务选择

### 推荐方案：阿里云轻量应用服务器

| 指标 | 配置 | 价格 |
|------|------|------|
| CPU | 2核 | - |
| 内存 | 2GB | - |
| 带宽 | 3Mbps | - |
| 月价 | 约30元 | 学生价/新用户优惠 |
| 操作系统 | Ubuntu 20.04/22.04 LTS | - |

**优势**：
- ✅ 中文支持，学生优惠（需认证）
- ✅ 一键部署模板
- ✅ 防火墙和安全组管理简单
- ✅ 流量充足（3Mbps带宽足以支撑小型应用）

### 其他方案

| 云服务商 | 产品 | 特点 | 价格 |
|---------|------|------|------|
| AWS | EC2 t3.micro | 免费层（1年） | $0/月（首年） |
| 腾讯云 | 云服务器CVM | 新用户优惠 | ¥99/年起 |
| 华为云 | ECS | 学生优惠 | ¥60/年 |

---

## 服务器购买与配置

### 阿里云轻量应用服务器购买步骤

1. **登录阿里云控制台**
   - 访问 https://www.aliyun.com/
   - 注册/登录账户

2. **购买服务器**
   - 进入 "轻量应用服务器" 产品页面
   - 选择配置：2核2GB内存，3Mbps带宽
   - 选择镜像：Ubuntu 20.04 LTS 或 22.04 LTS
   - 选择购买时长：建议3个月或以上（保证访问期限）
   - 完成支付

3. **获取服务器信息**
   - 服务器公网IP：记录下来，用于SSH连接
   - 服务器密码或密钥对：重要！用于登录

4. **重置密码或配置密钥**
   - **方案A（推荐）**：使用网页终端Workbench
     - 控制台 → 实例详情 → 远程连接 → Workbench
     - 直接在网页浏览器中操作，无需密钥
   
   - **方案B**：使用SSH密钥登录
     - 下载密钥对文件（.pem格式）
     - 保存到本地安全位置
     - 设置文件权限：`chmod 600 your-key.pem`

   - **方案C**：重置密码后用密码登录
     - 控制台 → 重置密码
     - 重启服务器使密码生效
     - 然后修改SSH配置允许密码登录

---

## 环境安装

### 步骤1：系统更新

```bash
# 以root用户执行以下命令
sudo apt update
sudo apt upgrade -y
```

### 步骤2：安装Node.js 18.x

```bash
# 添加NodeSource仓库
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# 安装Node.js
sudo apt install -y nodejs

# 验证安装
node -v      # 应显示 v18.x.x
npm -v       # 应显示 9.x.x或以上
```

### 步骤3：安装MySQL 8.0

```bash
# 安装MySQL服务器
sudo apt install -y mysql-server

# 启动MySQL服务
sudo systemctl start mysql
sudo systemctl enable mysql  # 设置开机自启

# 验证MySQL运行状态
sudo systemctl status mysql

# （可选）设置MySQL root密码
sudo mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'your_password';"
```

### 步骤4：安装Git

```bash
sudo apt install -y git
git --version  # 验证
```

### 步骤5：安装PM2（进程管理器）

```bash
sudo npm install -g pm2

# 验证
pm2 -v

# 设置开机自启
sudo pm2 startup
sudo pm2 save
```

### 步骤6：安装Nginx（反向代理）

```bash
sudo apt install -y nginx

# 启动Nginx
sudo systemctl start nginx
sudo systemctl enable nginx  # 开机自启

# 验证
sudo systemctl status nginx
```

---

## 项目部署

### 步骤1：克隆项目代码

```bash
# 进入/home目录（或其他合适位置）
cd /home

# 克隆项目（如果托管在GitHub）
git clone https://github.com/your-username/online-shopping.git

# 如果没有GitHub，使用本地上传
# 在本地运行：scp -r ./online-shopping root@your-server-ip:/home/

cd online-shopping
```

### 步骤2：安装依赖

```bash
npm install
```

### 步骤3：配置环境变量

```bash
# 创建.env文件
nano .env
```

**输入以下内容**（根据实际情况修改）：

```env
# 数据库配置
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_root_password
DB_NAME=shopping_db

# JWT密钥
JWT_SECRET=your_super_secret_jwt_key_change_this

# 邮件配置（可选，用于订单确认邮件）
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASSWORD=your_gmail_app_password

# 服务器端口
PORT=3000

# 环境
NODE_ENV=production
```

**保存文件**：按 `Ctrl+O` → 按回车 → 按 `Ctrl+X` 退出nano编辑器

### 步骤4：初始化数据库

```bash
# 初始化表结构并导入示例数据
npm run setup

# 或分步执行
# npm run init-db    # 创建表
# npm run seed       # 导入示例数据
```

### 步骤5：验证本地运行

```bash
# 启动应用（测试用）
npm run start

# 应显示：Server is running on http://localhost:3000
# 按Ctrl+C停止

# 或使用开发模式（自动重启）
npm run dev
```

---

## 数据库配置

### 创建数据库用户（可选，更安全）

```bash
# 登录MySQL
sudo mysql -u root -p

# 在MySQL命令行中执行
CREATE DATABASE shopping_db;
CREATE USER 'shopping_user'@'localhost' IDENTIFIED BY 'secure_password_here';
GRANT ALL PRIVILEGES ON shopping_db.* TO 'shopping_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

然后在.env中修改：
```env
DB_USER=shopping_user
DB_PASSWORD=secure_password_here
```

### 数据库备份

```bash
# 每日自动备份脚本
cat > /home/online-shopping/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/online-shopping/backups"
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mysqldump -u root -p$DB_PASSWORD shopping_db > $BACKUP_DIR/shopping_db_$TIMESTAMP.sql
# 删除30天前的备份
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
EOF

chmod +x /home/online-shopping/backup-db.sh

# 添加定时任务（每天凌晨2点备份）
crontab -e
# 添加这一行：
# 0 2 * * * /home/online-shopping/backup-db.sh
```

---

## 进程管理与自启

### 使用PM2启动应用

```bash
cd /home/online-shopping

# 用PM2启动应用
pm2 start src/app.js --name "shopping-app"

# 查看运行状态
pm2 status

# 查看日志
pm2 logs shopping-app

# 重启应用
pm2 restart shopping-app

# 停止应用
pm2 stop shopping-app
```

### 配置PM2生态系统文件（推荐）

```bash
# 创建ecosystem.config.js
cat > /home/online-shopping/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'shopping-app',
    script: './src/app.js',
    instances: 1,
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
EOF

# 使用生态文件启动
pm2 start ecosystem.config.js

# 设置开机自启
sudo pm2 startup
sudo pm2 save
```

### 查看应用日志

```bash
# 实时查看日志
pm2 logs shopping-app

# 或查看日志文件
tail -f /home/online-shopping/logs/out.log
tail -f /home/online-shopping/logs/err.log
```

---

## 反向代理配置

### 配置Nginx

```bash
# 创建Nginx配置文件
sudo nano /etc/nginx/sites-available/shopping-app
```

**输入以下内容**：

```nginx
upstream shopping_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com 172.24.189.3;  # 替换为你的域名或IP

    # 重定向HTTP到HTTPS（可选，需要SSL证书）
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://shopping_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态文件缓存（可选优化）
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        proxy_pass http://shopping_backend;
        proxy_cache_valid 200 30d;
        add_header Cache-Control "public, immutable";
    }

    # 健康检查
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

**保存并启用配置**：

```bash
# 检查语法
sudo nginx -t

# 创建符号链接启用站点
sudo ln -s /etc/nginx/sites-available/shopping-app /etc/nginx/sites-enabled/

# 移除默认站点（如果需要）
sudo rm /etc/nginx/sites-enabled/default

# 重新加载Nginx
sudo systemctl reload nginx

# 验证
sudo systemctl status nginx
```

---

## 防火墙与安全

### 配置UFW防火墙

```bash
# 启用防火墙
sudo ufw enable

# 允许SSH（必须！否则无法远程连接）
sudo ufw allow 22

# 允许HTTP
sudo ufw allow 80

# 允许HTTPS
sudo ufw allow 443

# 查看规则
sudo ufw status

# 如果需要特定IP访问
# sudo ufw allow from 192.168.1.100 to any port 22
```

### 安全加固

```bash
# 1. 更新系统补丁（定期执行）
sudo apt update && sudo apt upgrade -y

# 2. 安装Fail2Ban（防止暴力破解）
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# 3. 配置SSH只允许密钥登录（可选）
sudo nano /etc/ssh/sshd_config
# 找到以下行并修改：
# PermitRootLogin no
# PasswordAuthentication no
# PubkeyAuthentication yes

# 4. 重启SSH服务
sudo systemctl restart sshd
```

---

## 监控与维护

### 应用监控

```bash
# 查看应用实时状态
pm2 monit

# 或使用PM2 Web监控面板
pm2 web
# 访问 http://your-ip:9615
```

### 定期检查服务

```bash
# 查看应用状态
pm2 status

# 查看系统资源使用
free -h          # 内存
df -h             # 磁盘
top              # 实时进程

# 查看Nginx状态
sudo systemctl status nginx

# 查看MySQL状态
sudo systemctl status mysql
```

### 日志轮转（防止日志文件过大）

```bash
# 创建logrotate配置
sudo nano /etc/logrotate.d/shopping-app
```

**输入以下内容**：

```
/home/online-shopping/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 nobody nobody
    sharedscripts
    postrotate
        pm2 restart shopping-app > /dev/null 2>&1 || true
    endscript
}
```

---

## 常见问题

### Q1: 如何重启应用？

```bash
pm2 restart shopping-app
# 或重新加载（不中断服务）
pm2 reload shopping-app
```

### Q2: 应用启动失败，如何排查？

```bash
# 查看详细错误日志
pm2 logs shopping-app --err

# 检查.env文件
cat /home/online-shopping/.env

# 检查数据库连接
sudo mysql -u root -p

# 检查端口是否被占用
sudo netstat -tlnp | grep 3000
```

### Q3: 数据库连接错误"access denied"

```bash
# 检查MySQL用户和密码
sudo mysql -u root -p shopping_db

# 重置root密码
sudo mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'newpassword';"

# 更新.env文件的DB_PASSWORD
```

### Q4: Nginx显示502 Bad Gateway

```bash
# 检查Node.js应用是否运行
pm2 status

# 检查Nginx配置
sudo nginx -t

# 查看Nginx错误日志
sudo tail -f /var/log/nginx/error.log

# 检查3000端口是否监听
sudo netstat -tlnp | grep 3000
```

### Q5: 如何HTTPS访问（SSL证书）？

```bash
# 安装Certbot（Let's Encrypt免费证书）
sudo apt install -y certbot python3-certbot-nginx

# 获取证书（需要真实域名）
sudo certbot certonly --nginx -d your-domain.com -d www.your-domain.com

# 自动配置Nginx
sudo certbot --nginx -d your-domain.com

# 设置自动续期
sudo systemctl enable certbot.timer
```

### Q6: 访问速度慢

```bash
# 1. 增加PM2实例数
pm2 delete shopping-app
pm2 start src/app.js --name "shopping-app" -i max  # 使用所有CPU核心

# 2. 启用Nginx缓存和压缩
# 在nginx配置中添加：
gzip on;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript;

# 3. 优化MySQL查询（添加索引）
```

---

## 实验报告信息

### 📌 部署完成清单

部署成功后，请在实验报告中填写以下信息：

#### 1. **访问地址**
```
完整URL: http://172.24.189.3/
或: http://your-domain.com/
```

#### 2. **测试账户信息**

| 账户类型 | 账户 | 密码 | 说明 |
|---------|------|------|------|
| 管理员 | admin@example.com | admin123456 | 可访问后台管理 |
| 普通用户 | user@example.com | password123 | 普通购物用户 |
| 测试账户 | test@example.com | test123456 | 用于演示 |

**新用户注册**: 在平台首页点击"注册"自行创建账户

#### 3. **系统访问保证**

- ✅ **保证期限**: 2025年12月28日 ~ 2026年3月28日（3个月）
- ✅ **校园网访问**: 已在校园网内部署，支持IPv4访问
- ✅ **可用性SLA**: 99%（允许定期维护）
- ✅ **技术支持**: 如有问题，请联系部署人员

#### 4. **核心功能验证**

**用户端功能**：
- [ ] 用户注册和登录
- [ ] 浏览商品和搜索
- [ ] 加入购物车
- [ ] 结算和支付
- [ ] 查看订单和订单详情
- [ ] 确认收货和取消订单
- [ ] 接收订单邮件通知

**管理员功能**：
- [ ] 管理员登录
- [ ] 商品管理（增删改查）
- [ ] 订单管理（查看和更新状态）
- [ ] 销售报表查看
- [ ] 取消订单自动恢复库存

#### 5. **技术栈信息**

| 组件 | 版本 | 说明 |
|------|------|------|
| Node.js | 18.x LTS | 后端运行时 |
| Express.js | 4.x | Web框架 |
| MySQL | 8.0 | 数据库 |
| PM2 | 最新版 | 进程管理 |
| Nginx | 最新版 | 反向代理 |
| Ubuntu | 20.04/22.04 | 操作系统 |

#### 6. **部署架构**

```
┌─────────────────────────────────────────┐
│         用户浏览器 (校园网)              │
└──────────────────┬──────────────────────┘
                   │ HTTP:80
┌──────────────────▼──────────────────────┐
│      Nginx 反向代理 (端口80)            │
└──────────────────┬──────────────────────┘
                   │ 反向代理
┌──────────────────▼──────────────────────┐
│   Node.js + Express (端口3000)          │
│   ├─ 用户认证与授权                    │
│   ├─ 产品管理API                        │
│   ├─ 购物车与订单                       │
│   ├─ 订单支付与确认                     │
│   └─ 订单状态管理                       │
└──────────────────┬──────────────────────┘
                   │ SQL查询
┌──────────────────▼──────────────────────┐
│    MySQL 数据库 (shopping_db)           │
│    ├─ users (用户表)                    │
│    ├─ products (商品表)                 │
│    ├─ shopping_cart (购物车表)         │
│    ├─ orders (订单表)                   │
│    └─ order_items (订单项目表)         │
└─────────────────────────────────────────┘
```

#### 7. **部署命令速查表**

```bash
# 应用管理
pm2 start src/app.js --name "shopping-app"
pm2 restart shopping-app
pm2 stop shopping-app
pm2 logs shopping-app

# 数据库
npm run setup                    # 初始化数据库
npm run clean-db               # 清空数据库（谨慎！）

# Nginx
sudo systemctl start nginx
sudo systemctl restart nginx
sudo nginx -t                  # 测试配置

# 监控
pm2 status
pm2 monit
free -h
df -h
```

#### 8. **联系信息**

- **部署人员**: [你的姓名]
- **部署日期**: [部署完成日期]
- **服务器IP**: 172.24.189.3
- **应急联系**: [你的联系方式]

---

## 📞 问题排查与支持

如部署过程中遇到问题，请按以下步骤排查：

1. **检查服务状态**
   ```bash
   pm2 status
   sudo systemctl status nginx
   sudo systemctl status mysql
   ```

2. **查看应用日志**
   ```bash
   pm2 logs shopping-app
   tail -f /var/log/nginx/error.log
   ```

3. **检查网络连通性**
   ```bash
   ping 8.8.8.8
   netstat -tlnp | grep -E ':(80|3000|3306)'
   ```

4. **重启应用和服务**
   ```bash
   pm2 restart all
   sudo systemctl restart nginx
   sudo systemctl restart mysql
   ```

---

## 📚 参考资源

- [Express.js官方文档](https://expressjs.com/)
- [MySQL文档](https://dev.mysql.com/doc/)
- [PM2文档](https://pm2.keymetrics.io/)
- [Nginx官方文档](https://nginx.org/en/docs/)
- [Ubuntu Server指南](https://ubuntu.com/server/docs)

---

**部署完成！祝你的在线购物平台运营顺利！** 🎉
