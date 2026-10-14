// Local verification against the REAL Supabase database and Storage.
// This entry point binds only to loopback; it is not a public production server.
import { createApp } from "../app.mjs";
import { openPostgres } from "./postgres.mjs";
import { supabaseImageStore } from "./storage.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const port = Number(process.env.CLOUD_PORT ?? 3003);
process.env.APP_ORIGIN = `http://localhost:${port}`;
process.env.TRUST_PROXY = "0";
const db = openPostgres();
db.prepare("SELECT 1 FROM users LIMIT 1").get();
const { app } = createApp({
  db,
  production: false,
  dataDir: join(tmpdir(), "fanmade-cloud"),
  imageStore: supabaseImageStore(),
});
const server = app.listen(port, "127.0.0.1", () => {
  const actual = server.address().port;
  process.env.APP_ORIGIN = `http://localhost:${actual}`;
  if (process.send) process.send({ port: actual });
  else
    console.log(`Supabase 真实后台试用：http://localhost:${actual}（仅本机）`);
});
function stop() {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
