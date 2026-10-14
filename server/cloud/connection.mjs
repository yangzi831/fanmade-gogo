import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Optional local SOCKS proxy for networks blocking the PostgreSQL SSLRequest.
// Production hosts connect directly unless explicitly configured otherwise.
export async function postgresClient(connectionString, options = {}) {
  const url = new URL(connectionString);
  // URL sslmode would override pg's explicit CA options; verify hostname and CA.
  url.searchParams.delete("sslmode");
  let stream;
  if (process.env.DATABASE_PROXY_URL) {
    const proxy = new URL(process.env.DATABASE_PROXY_URL);
    if (proxy.protocol !== "socks5:")
      throw new Error("数据库代理仅支持 socks5");
    const { SocksClient } = await import("socks");
    const { socket } = await SocksClient.createConnection({
      command: "connect",
      proxy: {
        host: proxy.hostname,
        port: Number(proxy.port),
        type: 5,
        userId: decodeURIComponent(proxy.username),
        password: decodeURIComponent(proxy.password),
      },
      destination: { host: url.hostname, port: Number(url.port) || 5432 },
      timeout: 8000,
    });
    // pg normally opens its own socket. This one is already connected by SOCKS.
    socket.connect = () => {
      setImmediate(() => socket.emit("connect"));
      return socket;
    };
    stream = socket;
  }
  const ca = readFileSync(
    resolve("server/cloud/certs/supabase-root-2021.crt"),
    "utf8",
  );
  return new pg.Client({
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 15000,
    statement_timeout: 15000,
    ...options,
    ...(stream ? { stream } : {}),
  });
}
