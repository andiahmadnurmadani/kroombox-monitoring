import { Client } from "ssh2";

export interface SshCreds {
  host: string;
  port: number;
  username: string;
  password: string;
}

const EXEC_TIMEOUT_MS = 5000;

/**
 * Keeps ONE SSH connection open to a host and re-runs a read-only command over it
 * on a fixed interval, instead of reconnecting (full TCP + key-exchange + auth)
 * every tick. That's what makes a ~1s refresh safe on a production box: the
 * expensive part (the handshake) happens once, not every poll.
 */
export class PersistentSshPoller<T> {
  private conn: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private creds: SshCreds,
    private intervalMs: number,
    private command: string,
    private parse: (output: string) => T | null,
    private onResult: (result: T | null) => void
  ) {}

  start() {
    this.stopped = false;
    this.loop();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.conn?.end();
    this.conn = null;
  }

  private connect(): Promise<Client> {
    if (this.conn) return Promise.resolve(this.conn);
    if (this.connecting) return this.connecting;

    this.connecting = new Promise((resolve, reject) => {
      const conn = new Client();
      conn
        .on("ready", () => {
          this.conn = conn;
          this.connecting = null;
          resolve(conn);
        })
        .on("error", (err) => {
          this.conn = null;
          this.connecting = null;
          reject(err);
        })
        .on("close", () => {
          // next loop() tick reconnects automatically
          this.conn = null;
        })
        .connect({
          host: this.creds.host,
          port: this.creds.port,
          username: this.creds.username,
          password: this.creds.password,
          readyTimeout: EXEC_TIMEOUT_MS,
          keepaliveInterval: 10_000,
        });
    });
    return this.connecting;
  }

  private execOnce(conn: Client): Promise<T | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), EXEC_TIMEOUT_MS);
      conn.exec(this.command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          resolve(null);
          return;
        }
        let out = "";
        stream
          .on("data", (chunk: Buffer) => (out += chunk.toString()))
          .on("close", () => {
            clearTimeout(timer);
            resolve(this.parse(out));
          });
      });
    });
  }

  private async loop() {
    if (this.stopped) return;
    try {
      const conn = await this.connect();
      this.onResult(await this.execOnce(conn));
    } catch {
      this.onResult(null);
    }
    if (!this.stopped) {
      this.timer = setTimeout(() => this.loop(), this.intervalMs);
    }
  }
}
