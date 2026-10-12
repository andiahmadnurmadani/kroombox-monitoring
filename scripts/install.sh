#!/usr/bin/env bash
# Kroombox Monitor — install or update as a systemd service (Linux only).
#
#   git clone https://github.com/andiahmadnurmadani/uptime-monitor.git
#   cd uptime-monitor
#   sudo ./scripts/install.sh            # fresh install or update (data is kept)
#
# Options (all optional):
#   --port N              HTTP port (default 3400; existing config wins on update)
#   --bind ADDR           listen address (default 0.0.0.0; 127.0.0.1 behind a proxy/tunnel)
#   --trust-proxy         behind a reverse proxy / Cloudflare Tunnel (see .env.example)
#   --admin-user NAME     first login username (default admin)
#   --import-data DIR     copy an existing data directory (monitors, auth, ...) on first install
#   --import-env FILE     import servers/NAS from an old .env.local (NAS_*, SERVERS_JSON)
#   --no-start            install everything but don't (re)start the service
# Environment: ADMIN_PASSWORD (first login password, non-interactive installs),
#   INSTALL_DIR, DATA_DIR, SERVICE_USER to change the default locations.
set -euo pipefail

APP=kroombox-monitor
INSTALL_DIR=${INSTALL_DIR:-/opt/$APP}
DATA_DIR=${DATA_DIR:-/var/lib/$APP}
CONF_DIR=/etc/$APP
ENV_FILE=$CONF_DIR/$APP.env
UNIT_FILE=/etc/systemd/system/$APP.service
SERVICE_USER=${SERVICE_USER:-$APP}
SRC_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

PORT=3400
BIND=0.0.0.0
TRUST_PROXY=false
ADMIN_USER=admin
IMPORT_DATA=""
IMPORT_ENV=""
START=1

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT=$2; shift 2 ;;
    --bind) BIND=$2; shift 2 ;;
    --trust-proxy) TRUST_PROXY=true; shift ;;
    --admin-user) ADMIN_USER=$2; shift 2 ;;
    --import-data) IMPORT_DATA=$(realpath "$2"); shift 2 ;;
    --import-env) IMPORT_ENV=$(realpath "$2"); shift 2 ;;
    --no-start) START=0; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

[ "$(uname -s)" = Linux ] || die "This installer is for Linux (systemd) only."
[ "$(id -u)" = 0 ] || die "Run with sudo: sudo $0 $*"
command -v systemctl >/dev/null || die "systemd not found."
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "Invalid port: $PORT"

NODE=$(command -v node || true)
[ -n "$NODE" ] || die "Node.js is not installed. Install Node.js 20 LTS or newer (https://nodejs.org/en/download/package-manager), then try again."
NODE_MAJOR=$("$NODE" -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$("$NODE" -p 'process.versions.node.split(".")[1]')
if [ "$NODE_MAJOR" -lt 18 ] || { [ "$NODE_MAJOR" -eq 18 ] && [ "$NODE_MINOR" -lt 18 ]; }; then
  die "Node.js $("$NODE" -v) is too old; need >= 18.18 (20 LTS recommended)."
fi
NPM=$(command -v npm || true)
[ -n "$NPM" ] || die "npm not found."
command -v rsync >/dev/null || die "rsync is required (apt install rsync / dnf install rsync)."

UPDATE=0
[ -f "$UNIT_FILE" ] && UPDATE=1
say "$([ $UPDATE = 1 ] && echo Updating || echo Installing) $APP (Node $("$NODE" -v))"

# --- service user ------------------------------------------------------------
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  say "Creating system user $SERVICE_USER"
  useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# --- application code ----------------------------------------------------------
say "Copying the application to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
if [ "$SRC_DIR" != "$INSTALL_DIR" ]; then
  rsync -a --delete \
    --exclude .git --exclude node_modules --exclude .next --exclude data \
    --exclude '.env*' --exclude '*.tsbuildinfo' \
    "$SRC_DIR"/ "$INSTALL_DIR"/
fi

say "Installing dependencies & building (may take a few minutes)"
cd "$INSTALL_DIR"
export npm_config_cache="$INSTALL_DIR/.npm-cache" NEXT_TELEMETRY_DISABLED=1
"$NPM" ci --no-audit --no-fund --loglevel=error
"$NPM" run build --silent
rm -rf "$INSTALL_DIR/.npm-cache"
chown -R root:root "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/.next/cache"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.next/cache"

# --- configuration ---------------------------------------------------------------
mkdir -p "$CONF_DIR"
if [ ! -f "$ENV_FILE" ]; then
  say "Writing config $ENV_FILE"
  cat > "$ENV_FILE" <<EOF
# Kroombox Monitor — see $INSTALL_DIR/.env.example for what each option does.
NODE_ENV=production
PORT=$PORT
BIND_ADDRESS=$BIND
DATA_DIR=$DATA_DIR
TRUST_PROXY=$TRUST_PROXY
EOF
else
  say "Keeping existing config ($ENV_FILE)"
fi
chown root:"$SERVICE_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"
echo "SOURCE_DIR=$SRC_DIR" > "$CONF_DIR/install.conf"

# --- data ------------------------------------------------------------------------
mkdir -p "$DATA_DIR"
if [ -n "$IMPORT_DATA" ]; then
  if [ -f "$DATA_DIR/monitors.json" ] || [ -f "$DATA_DIR/auth.json" ]; then
    warn "$DATA_DIR already has data, skipping --import-data"
  else
    say "Importing data from $IMPORT_DATA"
    for f in monitors.json auth.json sound-settings.json settings.json hosts.json logo.png logo.jpg logo.webp; do
      if [ -f "$IMPORT_DATA/$f" ]; then cp -p "$IMPORT_DATA/$f" "$DATA_DIR/$f"; fi
    done
    if [ -d "$IMPORT_DATA/sounds" ]; then cp -rp "$IMPORT_DATA/sounds" "$DATA_DIR/"; fi
  fi
fi
if [ -n "$IMPORT_ENV" ]; then
  say "Importing servers/NAS from $IMPORT_ENV"
  DATA_DIR="$DATA_DIR" "$NODE" "$INSTALL_DIR/node_modules/tsx/dist/cli.mjs" "$INSTALL_DIR/scripts/import-env.ts" "$IMPORT_ENV"
fi

NEW_PASSWORD=""
if [ ! -f "$DATA_DIR/auth.json" ]; then
  NEW_PASSWORD=${ADMIN_PASSWORD:-}
  if [ -z "$NEW_PASSWORD" ] && [ -t 0 ]; then
    while :; do
      read -rsp "Login password for '$ADMIN_USER' (min. 8 characters, empty = random): " NEW_PASSWORD; echo
      [ -z "$NEW_PASSWORD" ] && break
      [ ${#NEW_PASSWORD} -ge 8 ] || { warn "At least 8 characters."; continue; }
      read -rsp "Repeat: " again; echo
      [ "$NEW_PASSWORD" = "$again" ] && break
      warn "Passwords do not match, try again."
    done
  fi
  GENERATED=0
  if [ -z "$NEW_PASSWORD" ]; then
    NEW_PASSWORD=$("$NODE" -e 'process.stdout.write(require("crypto").randomBytes(12).toString("base64url"))')
    GENERATED=1
  fi
  DATA_DIR="$DATA_DIR" ADMIN_PASSWORD="$NEW_PASSWORD" "$NODE" "$INSTALL_DIR/node_modules/tsx/dist/cli.mjs" \
    "$INSTALL_DIR/scripts/passwd.ts" --username "$ADMIN_USER" >/dev/null
  [ $GENERATED = 1 ] || NEW_PASSWORD="(the one you typed)"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chmod 0750 "$DATA_DIR"
find "$DATA_DIR" -maxdepth 1 -name '*.json' -exec chmod 0600 {} +

# --- systemd -----------------------------------------------------------------------
PROTECT_HOME=true
case "$NODE" in /home/*|/root/*) PROTECT_HOME=read-only ;; esac
say "Installing systemd unit $UNIT_FILE"
sed -e "s|@USER@|$SERVICE_USER|g" -e "s|@INSTALL_DIR@|$INSTALL_DIR|g" -e "s|@DATA_DIR@|$DATA_DIR|g" \
    -e "s|@CONF_DIR@|$CONF_DIR|g" -e "s|@NODE@|$NODE|g" -e "s|@PROTECT_HOME@|$PROTECT_HOME|g" \
    "$INSTALL_DIR/deploy/$APP.service" > "$UNIT_FILE"
install -m 0755 "$INSTALL_DIR/deploy/$APP-cli.sh" /usr/local/bin/$APP
systemctl daemon-reload
systemctl enable "$APP" >/dev/null 2>&1

if [ $START = 0 ]; then
  say "Done (--no-start). Start it with: sudo systemctl start $APP"
  exit 0
fi

say "Starting the service"
systemctl restart "$APP"
PORT_NOW=$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -1)
for _ in $(seq 1 60); do
  if "$NODE" -e 'fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))' \
      "http://127.0.0.1:${PORT_NOW:-3400}/login" 2>/dev/null; then
    echo
    say "Kroombox Monitor is running at http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT_NOW:-3400}"
    if [ -n "$NEW_PASSWORD" ]; then
      echo "    Login : $ADMIN_USER / $NEW_PASSWORD"
    fi
    echo "    Manage: $APP status | logs | restart | passwd | update | uninstall"
    exit 0
  fi
  sleep 1
done
warn "The service is not responding yet. Check the logs: journalctl -u $APP -n 50"
exit 1
