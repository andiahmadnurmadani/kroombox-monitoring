import type { WebSocket, WebSocketServer } from "ws";

declare global {
  // eslint-disable-next-line no-var
  var __wsClients: Set<WebSocket> | undefined;
  // eslint-disable-next-line no-var
  var __wss: WebSocketServer | undefined;
}

/** Pushes a typed message to every currently-connected dashboard WebSocket client. */
export function broadcast(type: string, data: unknown) {
  const clients = global.__wsClients;
  if (!clients || clients.size === 0) return;
  const msg = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      try {
        client.send(msg);
      } catch {
        // a dead socket will be cleaned up by its own "close" handler
      }
    }
  }
}
