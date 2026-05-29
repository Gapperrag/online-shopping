# 在线购物平台部署指南

本文档整理了本项目的本地测试、GitHub 更新、阿里云 Workbench 部署和服务器长期运行方案。

## 1. 先说明

- 本地测试建议使用 MySQL 9.x，端口建议 `3307`
- 服务器部署建议使用 `systemd`
- `.env` 不要提交到 GitHub
- 数据表结构变化后，记得重新执行 `npm run init-db`

---

## 2. 本地测试

### 2.1 配置 `.env`

```env
DB_HOST=localhost
DB_PORT=3307
DB_USER=shopping
DB_PASSWORD=123456
DB_NAME=shopping_db
JWT_SECRET=local_test_secret
PORT=3000
NODE_ENV=development
```

### 2.2 初始化数据库

```powershell
cd C:\Users\ASUS\online-shopping
npm.cmd run init-db
npm.cmd run seed
```

### 2.3 启动本地服务

```powershell
npm.cmd start
```

浏览器访问：

```text
http://127.0.0.1:3000
```

---

## 3. 推送到 GitHub

```powershell
cd C:\Users\ASUS\online-shopping
git status
git add src/app.js public/index.html init-db.js seed-products.js README.md DEPLOYMENT.md
git commit -m "Update analytics, recommendations and deployment docs"
git push origin main
```

如果 `.env` 被误跟踪，先取消跟踪：

```powershell
git rm --cached .env
```

---

## 4. 阿里云 Workbench 部署

### 4.1 进入服务器

阿里云控制台 -> 实例详情 -> 远程连接 -> Workbench。

### 4.2 执行一键部署脚本

```bash
cd ~
curl -fsSL https://raw.githubusercontent.com/Gapperrag/online-shopping/main/server-deploy.sh -o server-deploy.sh
bash server-deploy.sh
```

脚本会完成：

- 安装 `git`、`Node.js`、`MySQL`、`Nginx`
- 拉取项目到 `/var/www/online-shopping`
- 安装依赖
- 创建或读取 `.env`
- 初始化数据库
- 使用 `systemd` 或 PM2 启动服务
- 配置 Nginx 反向代理到 `127.0.0.1:3000`

### 4.3 手动更新服务器代码

```bash
cd /var/www/online-shopping
sudo git config --global --add safe.directory /var/www/online-shopping
sudo git pull
sudo npm ci --omit=dev
sudo npm run init-db
sudo systemctl restart online-shopping
```

---

## 5. systemd 运行

推荐为项目创建 `systemd` 服务，避免 Workbench 断开后进程退出。

### 5.1 创建服务文件

```bash
sudo nano /etc/systemd/system/online-shopping.service
```

写入：

```ini
[Unit]
Description=Online Shopping Platform
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/var/www/online-shopping
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/var/www/online-shopping/.env
User=root
Group=root

[Install]
WantedBy=multi-user.target
```

### 5.2 启动并设为开机自启

```bash
sudo systemctl daemon-reload
sudo systemctl start online-shopping
sudo systemctl enable online-shopping
sudo systemctl status online-shopping
```

### 5.3 查看日志

```bash
sudo journalctl -u online-shopping -f
```

---

## 6. 服务器端口

- 应用监听：`3000`
- Nginx 对外：`80`
- MySQL：`3306`

检查 3000 端口：

```bash
sudo ss -ltnp | grep :3000
```

---

## 7. 常见问题

### 7.1 连接数据库失败

检查 `.env` 中的：

```env
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
```

### 7.2 端口被占用

```bash
sudo ss -ltnp | grep :3000
```

### 7.3 页面打不开

```bash
sudo systemctl status online-shopping
sudo systemctl status nginx
curl http://127.0.0.1:3000
```

### 7.4 需要重建数据库

```bash
cd /var/www/online-shopping
sudo npm run init-db
sudo npm run seed
```

---

## 8. 默认账号

- 管理员：`admin / admin123456`
- 销售员：`sales / sales123456`

---

## 9. 功能概览

- 用户注册/登录/注销
- 商品浏览、购物车、下单、付款、邮件确认
- 销售人员商品管理、类别管理、日志监控
- 管理员销售人员管理、报表、趋势分析
- 画像、推荐、异常监控、可视化大屏
- 导入/导出商品、订单、购买记录、日志
