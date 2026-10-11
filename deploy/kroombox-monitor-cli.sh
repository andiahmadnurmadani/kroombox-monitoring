#!/usr/bin/env bash
# `kroombox-monitor` — small helper installed to /usr/local/bin by scripts/install.sh.
set -euo pipefail
APP=kroombox-monitor
CONF_DIR=/etc/$APP
ENV_FILE=$CONF_DIR/$APP.env
INSTALL_DIR=$(systemctl show -p WorkingDirectory --value "$APP" 2>/dev/null || true)
INSTALL_DIR=${INSTALL_DIR:-/opt/$APP}

need_root() { [ "$(id -u)" = 0 ] || exec sudo "$0" "$@"; }

case "${1:-help}" in
  status) systemctl status "$APP" --no-pager ;;
  logs) journalctl -u "$APP" -f -n "${2:-100}" ;;
  start|stop|restart) need_root "$@"; systemctl "$1" "$APP" ;;
  passwd)
    need_root "$@"
    shift
    DATA_DIR=$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | tail -1)
    USER_NAME=$(systemctl show -p User --value "$APP")
    NODE=$(systemctl show -p ExecStart --value "$APP" | sed -n 's/^{ path=\([^ ;]*\).*/\1/p')
    cd "$INSTALL_DIR"
    DATA_DIR="$DATA_DIR" "${NODE:-node}" node_modules/tsx/dist/cli.mjs scripts/passwd.ts "$@"
    chown "$USER_NAME:$USER_NAME" "$DATA_DIR/auth.json"
    chmod 0600 "$DATA_DIR/auth.json"
    ;;
  update)
    need_root "$@"
    SRC=$(sed -n 's/^SOURCE_DIR=//p' "$CONF_DIR/install.conf" 2>/dev/null || true)
    [ -d "$SRC/.git" ] || { echo "Folder sumber ($SRC) tidak ditemukan / bukan git clone." >&2; exit 1; }
    git -C "$SRC" pull --ff-only
    exec "$SRC/scripts/install.sh"
    ;;
  uninstall)
    need_root "$@"
    shift
    exec "$INSTALL_DIR/scripts/uninstall.sh" "$@"
    ;;
  version) node -p "require('$INSTALL_DIR/package.json').version" ;;
  *)
    cat <<USAGE
Pemakaian: $APP <perintah>
  status            status layanan systemd
  logs [N]          ikuti log (journalctl), N baris terakhir
  start|stop|restart
  passwd            ganti/reset username & password login dashboard
  update            git pull di folder sumber lalu pasang ulang (data tetap)
  uninstall [--purge]  hapus layanan (--purge: hapus juga data & konfigurasi)
  version
USAGE
    ;;
esac
