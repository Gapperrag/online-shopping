# 在线购物平台

一个基于 Express + MySQL 的在线购物系统，支持用户、销售人员、管理员三类角色。

公网IP：http://8.148.248.214/

## 功能

- 用户注册、登录、注销
- 商品浏览、搜索、购物车、下单、付款、邮件确认
- 订单详情、取消订单、状态管理
- 销售人员商品类别管理、商品管理、销售状态监控、日志查看
- 管理员销售人员管理、密码重置、销售报表
- 数据采集：登录、浏览停留、购买、操作日志
- 数据分析：用户画像、销售趋势、异常监控、排行榜、趋势预测
- 推荐系统：浏览/购买/收藏驱动的物品协同过滤推荐
- 数据导入/导出
- 数据可视化大屏

## 默认账号

- 管理员：`admin / admin123456`
- 销售员：`sales / sales123456`

## 本地启动

1. 安装 MySQL 9.x，创建数据库和用户。
2. 修改 `.env`：

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

3. 初始化数据库并导入商品：

```powershell
npm.cmd run init-db
npm.cmd run seed
```

4. 启动项目：

```powershell
npm.cmd start
```

浏览器本地访问：

```text
http://127.0.0.1:3000
```

## 服务器部署

推荐使用 `systemd`，不要依赖 Workbench 会话或终端常驻。

### 快速更新

```bash
cd /var/www/online-shopping
sudo git pull
sudo npm ci --omit=dev
sudo npm run init-db
sudo systemctl restart online-shopping
```

### 服务管理

```bash
sudo systemctl status online-shopping
sudo journalctl -u online-shopping -f
```

## 项目结构

- `src/app.js` - 后端 API
- `public/index.html` - 前端页面
- `init-db.js` - 数据库初始化
- `seed-products.js` - 示例商品数据
- `server-deploy.sh` - Linux 一键部署脚本
- `scripts/deploy.ps1` - Windows 辅助部署脚本

## 注意

- `.env` 不要提交到 GitHub
- 本地测试建议使用独立 MySQL 端口，例如 `3307`
- 数据表结构更新后，请重新执行 `npm run init-db`
