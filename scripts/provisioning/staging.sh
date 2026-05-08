#!/usr/bin/env bash
set -euo pipefail

# Flowerpil staging provisioning script.
# Goal: bootstrap a fresh Debian (AMD64/ARM64) host with user "colby" and
# deploy the staging stack (API + workers + ytmusic helper). Secrets,
# database files, uploads, and auth keys are not bundled; restore them
# from your backups before starting PM2.

APP_USER="${APP_USER:-colby}"
APP_HOME="/home/${APP_USER}"
REPO_URL="${REPO_URL:-https://github.com/flowerpil/production.git}"
REPO_DIR="${REPO_DIR:-/var/www/flowerpil}"
NODE_VERSION="${NODE_VERSION:-24.8.0}"
PM2_CONFIG="${PM2_CONFIG:-ecosystem.config.cjs}"
DATABASE_PATH="${DATABASE_PATH:-${REPO_DIR}/data/flowerpil-staging.db}"
UPLOAD_PATH="${UPLOAD_PATH:-${REPO_DIR}/storage/uploads-staging}"
LOG_DIR="${LOG_DIR:-${REPO_DIR}/logs}"
PY_SERVICE_DIR="${PY_SERVICE_DIR:-${REPO_DIR}/server/python-services/ytmusic}"
INSTALL_NGINX_CONF="${INSTALL_NGINX_CONF:-false}" # set to true to write nginx site file
NGINX_SERVER_NAME="${NGINX_SERVER_NAME:-apistage.flowerpil.io}"
BIO_SERVER_NAME="${BIO_SERVER_NAME:-*.pil.bio}"
NGINX_SSL_PATH="${NGINX_SSL_PATH:-/etc/letsencrypt/live/${NGINX_SERVER_NAME}}"
BIO_SSL_PATH="${BIO_SSL_PATH:-/etc/letsencrypt/live/pil.bio}"
START_PM2="${START_PM2:-false}" # set to true to start and save PM2 after install

SYSTEM_PACKAGES=(
  ca-certificates
  curl
  git
  build-essential
  python3
  python3-pip
  python3-venv
  sqlite3
  redis-server
  nginx
  ffmpeg
  libvips-dev
  pkg-config
)

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root (sudo) to install system dependencies." >&2
    exit 1
  fi
}

detect_arch() {
  local machine
  machine="$(uname -m)"
  case "${machine}" in
    x86_64) NODE_ARCH="linux-x64" ;;
    aarch64|arm64) NODE_ARCH="linux-arm64" ;;
    *)
      echo "Unsupported architecture: ${machine}" >&2
      exit 1
      ;;
  esac
}

install_packages() {
  echo "Installing system packages..."
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${SYSTEM_PACKAGES[@]}"
  systemctl enable --now redis-server
  systemctl enable --now nginx
}

install_node() {
  detect_arch
  local current
  if command -v node >/dev/null 2>&1; then
    current="$(node -v || true)"
  else
    current=""
  fi

  if [[ "${current}" == "v${NODE_VERSION}" ]]; then
    echo "Node ${NODE_VERSION} already installed."
    return
  fi

  echo "Installing Node ${NODE_VERSION} (${NODE_ARCH})..."
  local url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_ARCH}.tar.xz"
  local target="/usr/local/lib/nodejs"
  mkdir -p "${target}"
  curl -fsSL "${url}" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C "${target}"
  ln -sfn "${target}/node-v${NODE_VERSION}-${NODE_ARCH}/bin/node" /usr/local/bin/node
  ln -sfn "${target}/node-v${NODE_VERSION}-${NODE_ARCH}/bin/npm" /usr/local/bin/npm
  ln -sfn "${target}/node-v${NODE_VERSION}-${NODE_ARCH}/bin/npx" /usr/local/bin/npx
  ln -sfn "${target}/node-v${NODE_VERSION}-${NODE_ARCH}/bin/corepack" /usr/local/bin/corepack
  rm -f /tmp/node.tar.xz
}

ensure_user() {
  if id "${APP_USER}" >/dev/null 2>&1; then
    return
  fi

  echo "Creating user ${APP_USER}..."
  useradd -m -s /bin/bash "${APP_USER}"
}

ensure_repo() {
  if [[ -d "${REPO_DIR}/.git" ]]; then
    echo "Repo already present at ${REPO_DIR}"
    return
  fi

  echo "Cloning repository..."
  mkdir -p "$(dirname "${REPO_DIR}")"
  git clone "${REPO_URL}" "${REPO_DIR}"
  chown -R "${APP_USER}:${APP_USER}" "${REPO_DIR}"
}

set_permissions() {
  mkdir -p "${REPO_DIR}"
  chown -R "${APP_USER}:${APP_USER}" "${REPO_DIR}"
}

prepare_directories() {
  sudo -u "${APP_USER}" mkdir -p \
    "${REPO_DIR}/data" \
    "${REPO_DIR}/storage/uploads" \
    "${UPLOAD_PATH}" \
    "${REPO_DIR}/auth" \
    "${LOG_DIR}"
}

install_node_modules() {
  echo "Installing node dependencies..."
  sudo -u "${APP_USER}" bash -lc "cd '${REPO_DIR}' && npm ci --include=dev"
}

install_pm2() {
  echo "Installing PM2 globally..."
  npm install -g pm2@latest
  pm2 startup systemd -u "${APP_USER}" --hp "${APP_HOME}" >/dev/null
}

install_python_service() {
  if [[ ! -f "${PY_SERVICE_DIR}/requirements.txt" ]]; then
    echo "Skipping Python service install (requirements.txt missing)."
    return
  fi

  echo "Installing Python dependencies for ytmusic service..."
  python3 -m pip install --upgrade pip
  python3 -m pip install --no-cache-dir --break-system-packages -r "${PY_SERVICE_DIR}/requirements.txt"
}

run_migrations() {
  echo "Running database migrations against ${DATABASE_PATH}..."
  sudo -u "${APP_USER}" bash -lc "cd '${REPO_DIR}' && STAGING=true DATABASE_PATH='${DATABASE_PATH}' npm run db:migrate"
}

configure_nginx() {
  if [[ "${INSTALL_NGINX_CONF}" != "true" ]]; then
    echo "Skipping nginx config (INSTALL_NGINX_CONF not set to true)."
    return
  fi

  echo "Writing nginx site config..."
  cat > /etc/nginx/sites-available/flowerpil <<EOF
server {
    listen 443 ssl http2;
    server_name ${NGINX_SERVER_NAME};

    ssl_certificate ${NGINX_SSL_PATH}/fullchain.pem;
    ssl_certificate_key ${NGINX_SSL_PATH}/privkey.pem;

    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    send_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }
}

server {
    listen 80;
    server_name ${NGINX_SERVER_NAME};
    return 301 https://\$host\$request_uri;
}

server {
    listen 80;
    server_name ${BIO_SERVER_NAME};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${BIO_SERVER_NAME};

    ssl_certificate ${BIO_SSL_PATH}/fullchain.pem;
    ssl_certificate_key ${BIO_SSL_PATH}/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }
}
EOF

  ln -sfn /etc/nginx/sites-available/flowerpil /etc/nginx/sites-enabled/flowerpil
  nginx -t && systemctl reload nginx
}

start_pm2_stack() {
  if [[ "${START_PM2}" != "true" ]]; then
    echo "Skipping PM2 start/save (START_PM2 not true)."
    return
  fi

  sudo -u "${APP_USER}" bash -lc "cd '${REPO_DIR}' && pm2 start '${PM2_CONFIG}' --env staging && pm2 save"
}

main() {
  require_root
  install_packages
  install_node
  ensure_user
  ensure_repo
  set_permissions
  prepare_directories
  install_node_modules
  install_pm2
  install_python_service
  run_migrations
  configure_nginx
  start_pm2_stack

  echo "Provisioning complete. Restore /etc/environment secrets, database file (${DATABASE_PATH}), uploads (${UPLOAD_PATH}), and auth keys (${REPO_DIR}/auth) from backup before starting traffic."
}

main "$@"
