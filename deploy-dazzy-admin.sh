#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${DAZZY_ADMIN_DIR:-$SCRIPT_DIR}"
BUILD_DIR="${APP_DIR}/dist"

ADMIN_DOMAIN="${DAZZY_ADMIN_DOMAIN:-admin.ledaban.cn}"
DEPLOY_DIR="${DAZZY_ADMIN_DEPLOY_DIR:-/opt/1panel/www/sites/${ADMIN_DOMAIN}/index}"
BACKUP_DIR="${DAZZY_ADMIN_BACKUP_DIR:-/opt/1panel/www/sites/${ADMIN_DOMAIN}/deploy-backups}"
API_BASE_URL="${VITE_API_BASE_URL:-/api/v1}"
SITE_URL="${DAZZY_ADMIN_SITE_URL:-https://${ADMIN_DOMAIN}/}"
DEPLOY_OWNER="${DEPLOY_OWNER:-}"

log() {
  printf '[dazzy-admin] %s\n' "$*"
}

fail() {
  printf '[dazzy-admin] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required but was not found in PATH."
}

require_command node
require_command npm
require_command rsync
require_command tar

[[ -f "${APP_DIR}/package.json" ]] || fail "Missing ${APP_DIR}/package.json. Keep this script in the dazzy_admin project root or set DAZZY_ADMIN_DIR."
[[ "${DEPLOY_DIR}" == /opt/1panel/www/sites/*/index ]] || fail "Unsafe deploy directory: ${DEPLOY_DIR}"
[[ "${BACKUP_DIR}" == /opt/1panel/www/sites/*/deploy-backups ]] || fail "Unsafe backup directory: ${BACKUP_DIR}"
[[ "${DEPLOY_DIR}" != "/" && "${BACKUP_DIR}" != "/" ]] || fail "Refusing to use the filesystem root."

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( NODE_MAJOR < 20 )); then
  fail "Node.js 20 or newer is required; current version is $(node --version)."
fi

log "Project: ${APP_DIR}"
log "API base URL: ${API_BASE_URL}"
log "Deploy directory: ${DEPLOY_DIR}"
log "Backup directory: ${BACKUP_DIR}"

cd "${APP_DIR}"

log "Installing locked dependencies..."
npm ci --no-audit --no-fund

log "Running type checks and building the production admin app..."
export VITE_API_BASE_URL="${API_BASE_URL}"
npm run build

[[ -f "${BUILD_DIR}/index.html" ]] || fail "Build failed: ${BUILD_DIR}/index.html was not generated."
[[ -d "${BUILD_DIR}/assets" ]] || fail "Build failed: ${BUILD_DIR}/assets was not generated."

install -d "${DEPLOY_DIR}" || fail "Cannot create ${DEPLOY_DIR}; check the parent directory permissions."
install -d "${BACKUP_DIR}" || fail "Cannot create ${BACKUP_DIR}; check the parent directory permissions."

[[ -w "${DEPLOY_DIR}" ]] || fail "Deploy directory is not writable: ${DEPLOY_DIR}"
[[ -w "${BACKUP_DIR}" ]] || fail "Backup directory is not writable: ${BACKUP_DIR}"

EXISTING_FILE="$(find "${DEPLOY_DIR}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)"
if [[ -n "${EXISTING_FILE}" ]]; then
  BACKUP_FILE="${BACKUP_DIR}/dazzy-admin-$(date '+%Y%m%d-%H%M%S').tar.gz"
  BACKUP_TMP="${BACKUP_FILE}.tmp"
  log "Backing up the current site to ${BACKUP_FILE}..."
  tar -C "${DEPLOY_DIR}" -czf "${BACKUP_TMP}" .
  mv "${BACKUP_TMP}" "${BACKUP_FILE}"
fi

log "Publishing the new build..."
rsync -a --delay-updates --delete-delay \
  --exclude='.well-known/' \
  --exclude='.user.ini' \
  "${BUILD_DIR}/" "${DEPLOY_DIR}/"

if [[ -n "${DEPLOY_OWNER}" ]]; then
  log "Setting deploy directory owner to ${DEPLOY_OWNER}..."
  chown -R "${DEPLOY_OWNER}" "${DEPLOY_DIR}"
fi

[[ -f "${DEPLOY_DIR}/index.html" ]] || fail "Deploy verification failed: index.html is missing from ${DEPLOY_DIR}."

log "Deployment complete: ${SITE_URL}"
log "Configure /api/ as a reverse proxy to the DAZZY API if it is not configured yet."
