import type { WebSocket } from "ws";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAll } = await import("./lib/scheduler");
    startAll();
    const { startNasMonitor, getNasStatus } = await import("./lib/nas-scheduler");
    startNasMonitor();
    const { startServersMonitor, getServersStatus } = await import("./lib/servers-scheduler");
    startServersMonitor();
    const { store } = await import("./lib/store");
    const { broadcast } = await import("./lib/ws-broadcast");

    // push a fresh monitor list to every client the moment anything changes
    // (created/edited/deleted/checked) instead of waiting for their next poll
    store.onChange(() => broadcast("monitors", store.list()));

    // server.ts creates the WebSocket server and stores it on `global` before
    // Next.js (and this instrumentation hook) boots, so it's already there by now
    const wss = global.__wss;
    if (wss) {
      wss.on("connection", (ws: WebSocket) => {
        ws.send(JSON.stringify({ type: "monitors", data: store.list() }));
        ws.send(JSON.stringify({ type: "nas", data: getNasStatus() }));
        ws.send(JSON.stringify({ type: "servers", data: getServersStatus() }));
      });
    }
  }
}
