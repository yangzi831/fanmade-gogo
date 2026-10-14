import serverless from "serverless-http";
import { createApp } from "../../server/app.mjs";
import { openPostgres } from "../../server/cloud/postgres.mjs";
import { supabaseImageStore } from "../../server/cloud/storage.mjs";
let handler, database;
export async function main(event, context) {
  if (!/^https:\/\/[^/]+$/.test(process.env.APP_ORIGIN || ""))
    throw new Error("请配置 HTTPS 的 APP_ORIGIN");
  if (!handler || database?.broken) {
    process.env.TRUST_PROXY = "1";
    const db = openPostgres();
    db.prepare("SELECT 1 FROM users LIMIT 1").get();
    database = db;
    const { app } = createApp({
      db,
      production: true,
      dataDir: "/tmp/fanmade",
      imageStore: supabaseImageStore(),
    });
    handler = serverless(app);
  }
  context.callbackWaitsForEmptyEventLoop = false;
  const clean = (path) =>
    path?.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, "") || "/";
  return handler(
    {
      ...event,
      path: clean(event.path),
      ...(event.rawPath ? { rawPath: clean(event.rawPath) } : {}),
    },
    context,
  );
}
export { main as handler };
