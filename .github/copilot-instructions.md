# AI Copilot Instructions for Online Shopping Platform

## Project Overview

This is an **Express.js REST API** for an e-commerce platform with user authentication, product management, shopping cart, orders, and admin reporting. The project uses MySQL for persistence and includes email notifications.

### Key Architecture
- **Backend**: Express.js (Node.js) with MySQL2 connection pooling
- **Authentication**: JWT tokens (24h expiry) with role-based access control (customer/admin)
- **Database**: MySQL with 5 core tables: `users`, `products`, `shopping_cart`, `orders`, `order_items`
- **External Services**: Gmail via Nodemailer for order confirmations
- **Environment**: `.env` file required with `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `EMAIL_USER`, `EMAIL_PASSWORD`

## Core Modules & Patterns

### Authentication Module (`src/app.js` lines 37-108)
- **Registration**: POST `/api/auth/register` - Accepts username, email, password, fullName; bcrypt hashing (salt=10)
- **Login**: POST `/api/auth/login` - Supports **email OR username** login with single `emailOrUsername` field; returns JWT with `userId` and `role` claims
- **Middleware**: `authenticateToken` parses Bearer tokens; `checkAdmin` enforces admin role
- **Key Pattern**: All protected routes use `authenticateToken` → `checkAdmin` middleware chain

### Product Management (`src/app.js` lines 140-211)
- **Search**: Dynamic SQL building with keyword and category filters (lines 154-172)
- **CRUD**: Only admins can add/update/delete products (protected endpoints)
- **Convention**: Query parameters for search; path params for single resource operations

### Shopping Cart & Orders (`src/app.js` lines 265-560)
- **Transactions**: Order creation uses `beginTransaction()`/`commit()`/`rollback()` to ensure consistency
- **Stock Validation**: Cart addition checks inventory before allowing quantity increase
- **Email Integration**: Sends order confirmation HTML emails via Nodemailer (async, non-blocking)
- **Order Number**: Format is `ORD-${timestamp}-${random}` for uniqueness
- **User Order Operations**:
  - `PUT /api/orders/:orderId/confirm` - Confirm delivery (only for 'shipped' orders) → updates status to 'delivered'
  - `PUT /api/orders/:orderId/cancel` - Cancel order (only for 'pending'/'paid' orders) → restores inventory and sets status to 'cancelled'
- **Admin Order Operations**: 
  - `PUT /api/orders/:orderId/status` - Update order status (admin-only)

### Sales Reports (Admin-only, `src/app.js` lines 490-528)
- **Daily Aggregation**: Groups orders by date, filters for paid/shipped/delivered only
- **Top Products**: Sums quantity and revenue per product from order_items table

## Database Setup & Utilities

### Setup Flow
1. `npm run init-db` - Creates tables with UTF-8 charset (runs `init-db.js`)
2. `npm run seed` - Inserts sample products (runs `seed-products.js`)
3. `npm run setup` - Runs both init and seed in sequence

### Utility Scripts
- `clean-db.js` - Drops all tables (use for fresh database reset)
- `add-products.js` - Adds individual products
- `seed-products.js` - Bulk inserts sample data
- `check-products.js` - Verifies product data
- `verify-api.js` - Tests API endpoints
- `test-login.js` - Tests authentication flow

## Important Conventions & Gotchas

### Error Handling Pattern
- All endpoints catch errors and return 500 with `error.message`
- No validation middleware; validation is inline (check for duplicates, stock, auth)
- Async errors in email sending are caught but logged, not returned

### Connection Pool Management
- **Always** call `connection.release()` after use or connection leak will occur
- Use `await pool.getConnection()` for every database operation
- Connection pool limit is 10 (see `src/app.js` line 18)

### Response Format
- Success: `{ message: "...", data... }` or direct data array
- Errors: `{ error: "message" }`
- Status codes: 201 for creation, 400 for validation, 401 for auth, 403 for permission, 500 for server errors

### Query Parameters vs Path Parameters
- **Products**: `/api/products/search?keyword=mouse&category=electronics` (GET with query params)
- **Single Resource**: `/api/products/:id`, `/api/orders/:orderId` (GET/PUT/DELETE with path params)

## Running the Application

```bash
npm install
npm run setup          # Initialize DB and seed data
npm run start         # Production mode (node src/app.js)
npm run dev           # Development mode with nodemon (auto-restart)
```

Server runs on `http://localhost:${PORT}` (default 3000), serves static files from `public/` folder.

## Development Tips

- Test auth endpoints with `test-login.js` script (login with email OR username)
- Check product data with `check-products.js`
- Verify entire API with `verify-api.js`
- All API responses include English and Chinese comments in code
