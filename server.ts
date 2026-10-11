import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { verifySessionFromCookieHeader } from "./src/lib/session-token";
import { CLIENT_IP_HEADER } from "./src/lib/rate-limit";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3400", 10);
// 0.0.0.0 = reachable from the network; set 127.0.0.1 when a reverse proxy or
// Cloudflare Tunnel on the same machine is the only way in.
const bindAddress = process.env.BIND_ADDRESS || "0.0.0.0";

// created before `next({dev})`/app.prepare() runs, so instrumentation.ts's
// register() (which fires during prepare) already sees `global.__wss` set
const wss = new WebSocketServer({ noServer: true });
const clients = new Set<import("ws").WebSocket>();
global.__wss = wss;
global.__wsClients = clients;

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // route handlers can't see the socket; hand them the real peer address
    // (overwriting anything a client sent under the same name)
    req.headers[CLIENT_IP_HEADER] = req.socket.remoteAddress ?? "unknown";
    handle(req, res, parse(req.url ?? "", true));
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "");

    if (pathname !== "/ws") {
      // hand everything else (Next's own HMR websocket, etc.) back to Next.js
      app.getUpgradeHandler()(req, socket, head);
      return;
    }

    if (!verifySessionFromCookieHeader(req.headers.cookie)) {
      // complete the handshake so the browser gets a real WebSocket close event
      // (code 4001) instead of an opaque network error it can't distinguish
      // from "server unreachable"
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.close(4001, "unauthorized");
      });
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  server.listen(port, bindAddress, () => {
    console.log(`> Ready on http://${bindAddress}:${port} (ws: /ws)`);
  });
});
