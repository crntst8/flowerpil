#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKUP_SSH="${BACKUP_SSH:-user@backup-host}"
BACKUP_ROOT="${BACKUP_ROOT:-/path/to/backup/production}"
BACKUP_HOME="${BACKUP_HOME:-/path/to/backup/home}"
FETCH_SENSITIVE="${FETCH_SENSITIVE:-0}"

if [[ "$BACKUP_SSH" == "user@backup-host" || "$BACKUP_ROOT" == "/path/to/backup/production" ]]; then
  echo "Set BACKUP_SSH and BACKUP_ROOT before running (placeholders are still set)." >&2
  exit 1
fi

cd "$REPO_ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run this script from a Flowerpil git checkout." >&2
  exit 1
fi

# Update repo to develop (ignore current branch).
git fetch origin
git checkout develop
git pull origin develop

# Ensure Homebrew exists.
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found. Installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

brew update

BREW_FORMULAE=(
  brotli
  btop
  c-ares
  ca-certificates
  caddy
  gh
  icu4c@77
  libnghttp2
  libnghttp3
  libngtcp2
  libuv
  lz4
  mkcert
  mpdecimal
  node
  nspr
  nss
  openssl@3
  pcre2
  pipx
  python@3.14
  readline
  redis
  ripgrep
  simdjson
  sqlite
  tailscale
  uv
  uvwasi
  xz
  zstd
)

brew install "${BREW_FORMULAE[@]}"

BREW_CASKS=()
if [ ${#BREW_CASKS[@]} -gt 0 ]; then
  brew install --cask "${BREW_CASKS[@]}"
fi

# Ensure global npm tooling matches this dev box.
if command -v npm >/dev/null 2>&1; then
  npm install -g npm@11.6.2
  npm install -g @anthropic-ai/claude-code@2.0.76 @openai/codex@0.77.0 pm2@6.0.13
else
  echo "npm not found after brew install; verify Node install." >&2
  exit 1
fi

# Sync ignored/untracked files from backup, excluding DB files and upload images.
TMP_LIST="$(mktemp)"
ssh "$BACKUP_SSH" "cd '$BACKUP_ROOT' && git ls-files --others -i --exclude-standard" > "$TMP_LIST"

EXCLUDE_REGEX='^(node_modules/|dist/|storage/uploads/|data/.*\.(db|sqlite)($|-)|data/.*\.(db|sqlite)\.|data/\.flowerpil\.db-litestream/|ecosystem\.config\.cjs$|auth/|.*\.p8$|\.env(\.|$)|docs/no-commit/|security\.(md|json)$|\.certs/|.*\.DS_Store$)'

grep -Ev "$EXCLUDE_REGEX" "$TMP_LIST" > "${TMP_LIST}.filtered"
rsync -av --files-from="${TMP_LIST}.filtered" "$BACKUP_SSH:$BACKUP_ROOT/" "$REPO_ROOT/"
rm -f "$TMP_LIST" "${TMP_LIST}.filtered"

# Sensitive files (explicitly opt-in).
if [ "$FETCH_SENSITIVE" = "1" ]; then
  rsync -av "$BACKUP_SSH:$BACKUP_ROOT/ecosystem.config.cjs" "$REPO_ROOT/ecosystem.config.cjs"
  rsync -av "$BACKUP_SSH:$BACKUP_ROOT/auth/" "$REPO_ROOT/auth/"
  rsync -av "$BACKUP_SSH:$BACKUP_ROOT/.env" "$REPO_ROOT/.env" || true
  rsync -av "$BACKUP_SSH:$BACKUP_ROOT/.env.local" "$REPO_ROOT/.env.local" || true
  rsync -av "$BACKUP_SSH:$BACKUP_ROOT/.env.slack" "$REPO_ROOT/.env.slack" || true
  rsync -av "$BACKUP_SSH:$BACKUP_ROOT/docs/no-commit/" "$REPO_ROOT/docs/no-commit/" || true
  rsync -av "$BACKUP_SSH:$BACKUP_ROOT/security.md" "$REPO_ROOT/security.md" || true
  rsync -av "$BACKUP_SSH:$BACKUP_ROOT/security.json" "$REPO_ROOT/security.json" || true
  rsync -av "$BACKUP_SSH:$BACKUP_ROOT/.certs/" "$REPO_ROOT/.certs/" || true
else
  echo "Skipping sensitive files; rerun with FETCH_SENSITIVE=1 to sync them." >&2
fi

# Sync Codex/Claude settings from backup home.
mkdir -p "$HOME/.codex" "$HOME/.claude"
rsync -av "$BACKUP_SSH:$BACKUP_HOME/.codex/" "$HOME/.codex/"
rsync -av "$BACKUP_SSH:$BACKUP_HOME/.claude/" "$HOME/.claude/"

# Install repo dependencies.
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# Initialize schema and seed users (DB files are rebuilt from scratch).
mkdir -p data storage/uploads
export NODE_ENV=development
npm run db:init
npm run db:migrate
npm run seed:users
