#!/usr/bin/env bash
set -euo pipefail

APP_DOMAIN="${APP_DOMAIN:-tasks.maciejmostowski.pl}"
APP_DIR="${APP_DIR:-/opt/eisenhower-pwa}"
APP_PORT="${APP_PORT:-8080}"
N8N_WEBHOOK_URL="${N8N_WEBHOOK_URL:-https://n8n.maciejmostowski.pl/webhook/eisenhower-intake}"
APP_TOKEN="${APP_TOKEN:-}"
SERVICE_USER="${SERVICE_USER:-www-data}"

if [[ -z "$APP_TOKEN" ]]; then
  APP_TOKEN="$(openssl rand -hex 32)"
fi

echo "Creating app directory: $APP_DIR"
sudo mkdir -p "$APP_DIR/data"
sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

echo "Writing environment file"
sudo tee "$APP_DIR/.env" >/dev/null <<ENV
PORT=$APP_PORT
APP_TOKEN=$APP_TOKEN
N8N_WEBHOOK_URL=$N8N_WEBHOOK_URL
APP_VERSION=production
ENV

sudo chmod 600 "$APP_DIR/.env"
sudo chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/.env"

echo "Installing systemd service"
sudo tee /etc/systemd/system/eisenhower-pwa.service >/dev/null <<SERVICE
[Unit]
Description=Eisenhower PWA
After=network.target

[Service]
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=always
RestartSec=3
User=$SERVICE_USER
Group=$SERVICE_USER

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable eisenhower-pwa

if command -v caddy >/dev/null 2>&1; then
  echo "Configuring Caddy for https://$APP_DOMAIN"
  sudo mkdir -p /etc/caddy/conf.d
  sudo tee /etc/caddy/conf.d/eisenhower-pwa.caddy >/dev/null <<CADDY
$APP_DOMAIN {
  encode zstd gzip
  reverse_proxy 127.0.0.1:$APP_PORT
}
CADDY

  if ! sudo grep -q "import /etc/caddy/conf.d/*.caddy" /etc/caddy/Caddyfile; then
    echo "import /etc/caddy/conf.d/*.caddy" | sudo tee -a /etc/caddy/Caddyfile >/dev/null
  fi
  sudo systemctl reload caddy || sudo systemctl restart caddy
else
  echo "Caddy is not installed. Install it or configure nginx with nginx.example.conf."
fi

echo
echo "Done."
echo "APP_DOMAIN=$APP_DOMAIN"
echo "APP_DIR=$APP_DIR"
echo "APP_TOKEN=$APP_TOKEN"
echo
echo "Next: push code via GitHub Actions or upload files to $APP_DIR, then run:"
echo "sudo systemctl restart eisenhower-pwa"

