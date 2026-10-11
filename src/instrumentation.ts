import type { WebSocket } from "ws";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAll } = await import("./lib/scheduler");
    startAll();
    const { infraMonitor } = await import("./lib/infra-monitor");
    infraMonitor().start();
    const { store } = await import("./lib/store");
    const { broadcast } = await import("./lib/ws-broadcast");
    // creates data/auth.json (and logs the first admin password) at boot rather
    // than on the first page view, so it shows up right in `journalctl`
    const { loadAuthConfig } = await import("./lib/session-token");
    loadAuthConfig();

    // push a fresh monitor list to every client the moment anything changes
    // (created/edited/deleted/checked) instead of waiting for their next poll
    store.onChange(() => broadcast("monitors", store.list()));

    // server.ts creates the WebSocket server and stores it on `global` before
    // Next.js (and this instrumentation hook) boots, so it's already there by now
    const wss = global.__wss;
    if (wss) {
      wss.on("connection", (ws: WebSocket) => {
        ws.send(JSON.stringify({ type: "monitors", data: store.list() }));
        ws.send(JSON.stringify({ type: "hosts", data: infraMonitor().list() }));
      });
    }
  }
}
