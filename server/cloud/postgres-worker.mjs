import { parentPort, workerData } from "node:worker_threads";
import pg from "pg";
import { postgresClient } from "./connection.mjs";

pg.types.setTypeParser(20, Number);
let client, initialError;
try {
  if (workerData.testDatabaseDir) {
    const { PGlite } = await import("@electric-sql/pglite");
    client = new PGlite(workerData.testDatabaseDir);
    await client.waitReady;
    await client.exec("SET search_path=fanmade,public");
  } else {
    client = await postgresClient(workerData.connectionString, {
      application_name: "fanmade-gogo",
      options: "-c search_path=fanmade,public",
    });
    client.on("error", (e) => {
      initialError = e;
    });
    await client.connect();
  }
} catch (e) {
  initialError = e;
}
const tables =
  "users,sessions,events,event_creators,event_aliases,materials,reservations,reservation_items,exchange_applications,uploads,manual_handoffs,manual_handoff_items,share_lists,personal_collections,user_favorites";
export function translate(sql) {
  if (/^BEGIN IMMEDIATE\s*$/i.test(sql)) return "BEGIN";
  let index = 0;
  sql = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (part) =>
    part === "?" ? "$" + ++index : part,
  );
  if (/^\s*INSERT OR IGNORE\b/i.test(sql))
    sql =
      sql.replace(/INSERT OR IGNORE/i, "INSERT") + " ON CONFLICT DO NOTHING";
  return sql;
}
let queue = Promise.resolve();
parentPort.on("message", (message) => {
  // Never interleave statements from two requests on the connection.
  queue = queue.then(async () => {
    const { sql, values, method, shared } = message;
    let result;
    try {
      if (initialError) throw initialError;
      const query = translate(sql);
      let response;
      if (method === "exec") {
        response = workerData.testDatabaseDir
          ? await client.exec(query)
          : await client.query(query);
      } else response = await client.query(query, values);
      if (/^BEGIN IMMEDIATE\s*$/i.test(sql) && !workerData.testDatabaseDir)
        await client.query(
          "LOCK TABLE " + tables + " IN SHARE ROW EXCLUSIVE MODE",
        );
      result = {
        value:
          method === "get"
            ? (response.rows[0] ?? null)
            : method === "all"
              ? response.rows
              : method === "run"
                ? { changes: response.rowCount ?? response.affectedRows ?? 0 }
                : null,
      };
    } catch (e) {
      if (/^BEGIN IMMEDIATE\s*$/i.test(sql))
        await client?.query("ROLLBACK").catch(() => {});
      // Do not return SQL, connection strings or row details to HTTP logs.
      result = { error: "云端数据库请求失败", code: e.code || "PG_CONNECTION" };
    }
    const status = new Int32Array(shared, 0, 2),
      target = new Uint8Array(shared, 8);
    let bytes = new TextEncoder().encode(JSON.stringify(result));
    if (bytes.length > target.length)
      bytes = new TextEncoder().encode(
        JSON.stringify({
          error: "结果过大，请缩小查询范围",
          code: "PG_RESULT_SIZE",
        }),
      );
    target.set(bytes);
    Atomics.store(status, 1, bytes.length);
    Atomics.store(status, 0, 1);
    Atomics.notify(status, 0);
  });
});
