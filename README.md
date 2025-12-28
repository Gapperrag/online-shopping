学号：202330453091
姓名：许桐
班级：23网络工程班
指导教师：布社辉
项目名称：在线购物平台 (Online Shopping Platform)
项目描述：基于Express.js和MySQL的完整电商REST API系统，支持用户认证、商品管理、购物车、订单处理、支付和管理员报表。

测试账户
管理员账户：admin/admin123456
用户可自行注册新账户进行测试

源代码文件说明
app.js - 项目的核心文件，包含所有Express服务器配置和REST API路由实现，包括用户认证、商品管理、购物车、订单处理、订单支付确认、订单取消库存恢复、管理员订单和商品管理、邮件通知、销售报表等全部后端业务逻辑。

init-db.js - 数据库初始化脚本，用于创建MySQL数据库和5个核心表（users、products、shopping_cart、orders、order_items），使用UTF8字符集以支持中文，在项目首次部署时需要执行此脚本建立数据库结构。

seed-products.js - 数据导入脚本，用于向products表中插入示例商品数据，包括笔记本、鼠标、键盘、耳机等电子产品，便于开发测试和演示时有初始数据使用。

add-products.js - 商品添加脚本，用于向数据库单独添加新的商品记录，支持设置商品名称、描述、价格、分类和库存数量，可用于后期向系统补充新产品。

clean-db.js - 数据库清空脚本，用于删除所有数据表内容或重置数据库，仅在需要完全重新初始化数据库时使用，执行前需谨慎确认。

check-products.js - 数据检查脚本，用于查询和验证products表中的商品数据是否完整正确，帮助开发者确认初始数据是否成功导入。

verify-api.js - API验证脚本，用于测试各个REST API端点是否正常工作，包括认证、商品查询、购物车操作、订单创建等功能的自动化测试。

test-login.js - 认证测试脚本，用于测试用户登录和JWT token认证功能是否正常，支持邮箱或用户名登录，验证token的有效性。

package.json - 项目配置文件，定义了项目名称、版本、依赖包（Express、MySQL2、JWT、Bcrypt、Nodemailer等）和npm运行脚本命令（setup、start、dev、clean-db等）。

.env - 环境变量配置文件，包含数据库连接信息（DB_HOST、DB_USER、DB_PASSWORD、DB_NAME）、JWT密钥、邮件服务配置等敏感信息，不应提交到GitHub。

.gitignore - Git忽略配置文件，指定哪些文件不需要版本控制，包括node_modules、.env敏感文件、日志文件、编辑器配置等。

index.html - 前端主页面文件，包含用户界面的HTML结构，提供用户注册、登录、浏览商品、购物车、结算、订单查看等功能的交互界面。

public/style.css - 前端样式文件，定义了整个购物平台网页的视觉样式，包括布局、颜色、字体、响应式设计等CSS规则。

DEPLOYMENT.md - 部署指南文档，详细说明了如何将项目部署到云服务器（阿里云、AWS等），包括环境配置、服务安装、Nginx配置、PM2进程管理、防火墙设置、监控维护等完整的部署步骤和实验报告填写模板。

