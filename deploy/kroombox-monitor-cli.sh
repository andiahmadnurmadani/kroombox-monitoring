#!/usr/bin/env bash
# `kroombox-monitor` — small helper installed to /usr/local/bin by scripts/install.sh.
set -euo pipefail
APP=kroombox-monitor
CONF_DIR=/etc/$APP
ENV_FILE=$CONF_DIR/$APP.env
INSTALL_DIR=$(systemctl show -p WorkingDirectory --value "$APP" 2>/dev/null || true)
INSTALL_DIR=${INSTALL_DIR:-/opt/$APP}

need_root() { [ "$(id -u)" = 0 ] || exec sudo "$0" "$@"; }
service_node() { systemctl show -p ExecStart --value "$APP" | sed -n 's/^{ path=\([^ ;]*\).*/\1/p'; }

case "${1:-help}" in
  status) systemctl status "$APP" --no-pager ;;
  logs) journalctl -u "$APP" -f -n "${2:-100}" ;;
  start|stop|restart) need_root "$@"; systemctl "$1" "$APP" ;;
  passwd)
    need_root "$@"
    shift
    DATA_DIR=$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | tail -1)
    USER_NAME=$(systemctl show -p User --value "$APP")
    NODE=$(service_node)
    cd "$INSTALL_DIR"
    DATA_DIR="$DATA_DIR" "${NODE:-node}" node_modules/tsx/dist/cli.mjs scripts/passwd.ts "$@"
    chown "$USER_NAME:$USER_NAME" "$DATA_DIR/auth.json"
    chmod 0600 "$DATA_DIR/auth.json"
    ;;
  update|check-update)
    need_root "$@"
    NODE=$(service_node)
    exec "${NODE:-node}" "$INSTALL_DIR/scripts/updater.mjs" "$([ "$1" = update ] && echo apply || echo check)"
    ;;
  uninstall)
    need_root "$@"
    shift
    exec "$INSTALL_DIR/scripts/uninstall.sh" "$@"
    ;;
  version)
    NODE=$(service_node)
    "${NODE:-node}" -p "let s = ''; try { s = ' (' + require('$INSTALL_DIR/version.json').sha.slice(0, 7) + ')' } catch {} require('$INSTALL_DIR/package.json').version + s"
    ;;
  *)
    cat <<USAGE
Usage: $APP <command>
  status            systemd service status
  logs [N]          follow the logs (journalctl), last N lines
  start|stop|restart
  passwd            change/reset the dashboard login username & password
  check-update      look for a new version on GitHub
  update            pull the new version into the source folder and reinstall (data is kept);
                    the same as Settings → Updates → "Update now" in the dashboard
  uninstall [--purge]  remove the service (--purge: also remove data & config)
  version
USAGE
    ;;
esac
