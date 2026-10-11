/**
 * Set (or reset) the dashboard login from the command line — for the first
 * install and for "I forgot the password".
 *
 *   npm run passwd                      # asks for username + password
 *   ADMIN_PASSWORD=... npm run passwd -- --username admin   # non-interactive
 *
 * Existing browser sessions are signed out (a new session secret is generated).
 */
import crypto from "crypto";
import readline from "readline";
import { Writable } from "stream";
import { hashPassword, loadAuthConfig, MIN_PASSWORD_LENGTH, saveAuthConfig } from "../src/lib/session-token";
import { dataFile } from "../src/lib/data-dir";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
    muted = hidden;
  });
}

async function main() {
  // ADMIN_PASSWORD set on purpose for this command must not also seed a random one
  const fromEnv = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  const silentCfg = (() => {
    const log = console.log;
    console.log = () => {};
    try {
      return loadAuthConfig();
    } finally {
      console.log = log;
    }
  })();

  let username = argValue("--username");
  let password = fromEnv ?? "";
  if (!username) {
    username = process.stdin.isTTY ? (await ask(`Username [${silentCfg.username}]: `)).trim() || silentCfg.username : silentCfg.username;
  }
  if (!password) {
    if (!process.stdin.isTTY) {
      console.error("Tidak ada terminal: set ADMIN_PASSWORD untuk mode non-interaktif.");
      process.exit(1);
    }
    password = await ask("Password baru: ", true);
    const again = await ask("Ulangi password: ", true);
    if (password !== again) {
      console.error("Password tidak sama.");
      process.exit(1);
    }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`);
    process.exit(1);
  }

  saveAuthConfig({
    username,
    passwordHash: hashPassword(password),
    sessionSecret: crypto.randomBytes(32).toString("hex"),
  });
  console.log(`Login diperbarui untuk "${username}" (${dataFile("auth.json")}). Sesi lama otomatis keluar.`);
}

main();
