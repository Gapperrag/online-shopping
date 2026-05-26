#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-online-shopping}"
REPO_URL="${REPO_URL:-https://github.com/Gapperrag/online-shopping.git}"
APP_DIR="${APP_DIR:-/var/www/online-shopping}"
PORT="${PORT:-3000}"
DB_NAME="${DB_NAME:-shopping_db}"
DB_USER="${DB_USER:-shopping_app}"
DB_PASSWORD="${DB_PASSWORD:-}"
RUN_DB_SETUP="${RUN_DB_SETUP:-1}"

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

need_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "This command needs root privileges, but sudo is not installed." >&2
    exit 1
  fi
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This deploy script expects Ubuntu/Debian with apt-get." >&2
  exit 1
fi

log "Installing system packages"
need_root apt-get update
need_root apt-get install -y ca-certificates curl git mysql-server nginx

if ! command -v node >/dev/null 2>&1 || [ "$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)" -lt 18 ]; then
  log "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | need_root bash -
  need_root apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  need_root npm install -g pm2
fi

log "Preparing app directory: $APP_DIR"
need_root mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
  need_root git -C "$APP_DIR" fetch --all --prune
  need_root git -C "$APP_DIR" reset --hard origin/main
elif [ -d "$APP_DIR" ] && [ "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 | wc -l)" -gt 0 ]; then
  echo "$APP_DIR exists and is not an empty git repository." >&2
  echo "Set APP_DIR to another path or clear the directory before deploying." >&2
  exit 1
else
  need_root git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD="$(random_secret)"
  fi
  JWT_SECRET="$(random_secret)"

  log "Creating .env"
  need_root tee .env >/dev/null <<EOF
DB_HOST=localhost
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
JWT_SECRET=$JWT_SECRET
PORT=$PORT
NODE_ENV=production
EOF
else
  log "Keeping existing .env"
fi

log "Configuring MySQL database and user"
MYSQL_SQL="
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
"
if [ -n "$DB_PASSWORD" ]; then
  printf '%s\n' "$MYSQL_SQL" | need_root mysql
else
  echo "DB_PASSWORD is empty and .env already exists; skipping MySQL user password reset."
fi

log "Installing npm dependencies"
need_root npm ci --omit=dev

if [ "$RUN_DB_SETUP" = "1" ]; then
  log "Initializing database tables and seed data"
  need_root npm run setup
fi

log "Starting app with PM2"
if need_root pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  need_root pm2 restart "$APP_NAME"
else
  need_root pm2 start npm --name "$APP_NAME" -- start
fi
need_root pm2 save

log "Configuring Nginx reverse proxy"
need_root tee "/etc/nginx/sites-available/$APP_NAME" >/dev/null <<EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
need_root ln -sf "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME"
need_root rm -f /etc/nginx/sites-enabled/default
need_root nginx -t
need_root systemctl restart nginx

log "Enabling services"
need_root systemctl enable mysql nginx >/dev/null 2>&1 || true

log "Done"
echo "App directory: $APP_DIR"
echo "PM2 app name: $APP_NAME"
echo "Local URL: http://127.0.0.1:$PORT"
echo "Public URL: http://$(curl -fsS ifconfig.me 2>/dev/null || echo 8.148.248.214)/"
