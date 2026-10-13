<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.png">
    <img src="docs/logo-light.png" alt="Kroombox logo" height="44" align="center">
  </picture>
  Kroombox Monitor
</h1>

Self-hosted, real-time monitoring dashboard for **websites**, **Linux servers** and **NAS** — one small Node.js service, no database, no agents to install on the machines you watch.

![Dashboard](docs/screenshot.png)

*[Baca dalam Bahasa Indonesia](README.id.md)*

## Features

- **Websites** — HTTP(S) checks on your own interval, response time, heartbeat bar, uptime %. A failed check is retried first (shown in yellow as *RETRYING*, with your own retry count and interval) and only marked *DOWN* when the retries fail too, so a single hiccup doesn't raise an alarm.
- **Servers** — load average, RAM, root disk usage and uptime over SSH (password or private key). One SSH connection per host is kept open and re-used, so a 1-second refresh stays cheap.
- **NAS** — the same SSH metrics plus per-disk temperature and SMART status from **Synology DSM**.
- **Everything is added in the UI** — any number of websites, servers and NAS; edit, pause or delete them; a *Test connection* button checks SSH/DSM before saving.
- **Live** — the browser receives updates over a WebSocket; no polling, no page refresh.
- **Alerts in the browser** — a sound when a website, server or NAS goes down or recovers, with quiet hours; upload your own sounds in Settings.
- **Your branding** — app name and logo are set in Settings.
- **Secure by default** — login required for everything, random first password, login rate limiting, credentials stored owner-only (`0600`) and never sent back to the browser, hardened systemd unit.

The UI is in Bahasa Indonesia.

## Requirements

- Linux with **systemd** (Ubuntu, Debian, Fedora, Rocky/Alma, Arch, …)
- **Node.js 20 LTS or newer** (18.18+ works) and npm, `rsync`, `git`
- Monitored servers/NAS: SSH access with a user that can read `/proc` and run `df` (any normal user can). For NAS disk temperatures: a Synology DSM account in the *administrators* group, without 2FA.

## Install (systemd)

```bash
git clone https://github.com/andiahmadnurmadani/uptime-monitor.git
cd uptime-monitor
sudo ./scripts/install.sh
```

The installer:

1. creates a system user `kroombox-monitor`,
2. copies the app to `/opt/kroombox-monitor`, installs dependencies and builds it,
3. writes the config to `/etc/kroombox-monitor/kroombox-monitor.env` and keeps data in `/var/lib/kroombox-monitor`,
4. asks for the login password (leave empty for a random one, which is printed at the end),
5. installs and starts `kroombox-monitor.service`.

Open `http://<server-ip>:3400`, log in, then use **+ Add** to add websites, servers and NAS.

Useful options:

```bash
sudo ./scripts/install.sh --port 8080                 # another port
sudo ./scripts/install.sh --bind 127.0.0.1 --trust-proxy   # behind nginx/Caddy/Cloudflare Tunnel
sudo ADMIN_PASSWORD='s3cret-pass' ./scripts/install.sh     # non-interactive
```

### Managing the service

```bash
kroombox-monitor status        # systemctl status
kroombox-monitor logs          # follow the log
kroombox-monitor restart
kroombox-monitor passwd        # reset the dashboard login (e.g. forgotten password)
kroombox-monitor check-update  # look for a new version on GitHub
kroombox-monitor update        # git pull + rebuild, data is kept
kroombox-monitor uninstall     # remove the service, keep data (--purge removes data too)
```

### Updating from the dashboard

The installer also sets up a small root-only updater (`kroombox-monitor-updater.service`). It checks GitHub every 6 hours; when a new version exists the dashboard header shows **Update available**, and **Settings → Updates → Update now** installs it (the same as `kroombox-monitor update`): the source folder is fast-forwarded, the app is rebuilt and restarted, and the page reloads by itself. Data and configuration are kept. The dashboard never runs anything as root — it only drops a request file into `/var/lib/kroombox-monitor-updater/requests`, which `kroombox-monitor-updater.path` picks up. The source folder must be a clean git clone (no uncommitted changes).

## Configuration

Websites, servers, NAS, branding, login and sound schedule are all managed in the web UI. The env file only holds runtime settings:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3400` | HTTP port |
| `BIND_ADDRESS` | `0.0.0.0` | Listen address; `127.0.0.1` when only a local reverse proxy/tunnel should reach it |
| `DATA_DIR` | `./data` | Where all state lives (installer: `/var/lib/kroombox-monitor`) |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy/Cloudflare Tunnel so the login rate limit sees the real client IP |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / random | First login, used only when no account exists yet |
| `APP_NAME` | `Kroombox Monitoring` | Default display name before one is set in Settings |

After editing `/etc/kroombox-monitor/kroombox-monitor.env`, run `kroombox-monitor restart`.

### Data directory

| File | Content |
|---|---|
| `monitors.json` | websites and their recent check history |
| `hosts.json` | servers and NAS **including SSH/DSM credentials** (mode `0600`) |
| `auth.json` | login username, password hash, session secret (mode `0600`) |
| `settings.json`, `sound-settings.json`, `logo.*` | branding and alert schedule |
| `sounds/down.*`, `sounds/recovery.*` | alert sounds uploaded in Settings (bundled ones are used otherwise) |
| `hosts-status.json` | last known server status, shown right after a restart |

Back up this directory to back up everything.

## Exposing it safely

The dashboard holds SSH credentials for your machines, so treat it like an admin panel:

- Put it behind HTTPS (nginx, Caddy or a Cloudflare Tunnel) and set `--bind 127.0.0.1 --trust-proxy`.
- Use a long login password; consider an extra access layer (VPN, Cloudflare Access, basic auth on the proxy) when it is reachable from the internet.
- Prefer a dedicated, unprivileged SSH user (or key) per monitored host — the app only runs `cat /proc/...`, `nproc` and `df`.

Synology DSM is contacted with certificate verification disabled, because DSM ships a self-signed certificate on its management port; keep DSM traffic on a private network or VPN.

## Upgrading from the `.env.local` version

Earlier versions read `NAS_*` and `SERVERS_JSON` from `.env.local`. On first start this version imports them into `hosts.json` automatically (when `hosts.json` does not exist yet); after that they are ignored and everything is edited in the UI. To move an old checkout to the systemd install:

```bash
sudo ./scripts/install.sh --import-data /path/to/old/data --import-env /path/to/old/.env.local
```

## Development

```bash
npm install
npm run dev          # http://localhost:3400, data in ./data
npm test             # unit tests
npm run lint && npm run typecheck
```

Stack: Next.js 15 (App Router) with a small custom server (`server.ts`) that adds the `/ws` WebSocket endpoint, `ssh2` for SSH, Tailwind CSS. Background pollers start in `src/instrumentation.ts`:

- `src/lib/scheduler.ts` — website checks
- `src/lib/infra-monitor.ts` — one SSH poller (+ DSM poller for NAS) per host, reconciled whenever hosts change
- `src/lib/host-store.ts` — host config storage, validation, legacy import

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
