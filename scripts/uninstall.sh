#!/usr/bin/env bash
# Remove the Kroombox Monitor systemd service. Data and configuration are kept
# unless --purge is given.
set -euo pipefail
APP=kroombox-monitor
INSTALL_DIR=${INSTALL_DIR:-/opt/$APP}
DATA_DIR=${DATA_DIR:-/var/lib/$APP}
CONF_DIR=/etc/$APP
SERVICE_USER=${SERVICE_USER:-$APP}

[ "$(id -u)" = 0 ] || exec sudo "$0" "$@"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

if [ -f "$CONF_DIR/$APP.env" ]; then
  configured=$(sed -n 's/^DATA_DIR=//p' "$CONF_DIR/$APP.env" | tail -1)
  DATA_DIR=${configured:-$DATA_DIR}
fi

systemctl disable --now "$APP" 2>/dev/null || true
rm -f "/etc/systemd/system/$APP.service" "/usr/local/bin/$APP"
systemctl daemon-reload
rm -rf "$INSTALL_DIR"
echo "Layanan dan aplikasi di $INSTALL_DIR dihapus."

if [ $PURGE = 1 ]; then
  rm -rf "$DATA_DIR" "$CONF_DIR"
  userdel "$SERVICE_USER" 2>/dev/null || true
  echo "Data ($DATA_DIR), konfigurasi ($CONF_DIR) dan user $SERVICE_USER ikut dihapus."
else
  echo "Data tetap di $DATA_DIR dan konfigurasi di $CONF_DIR (pakai --purge untuk menghapusnya)."
fi
