import { Worker } from "node:worker_threads";
import { resolve } from "node:path";

// A bounded compatibility bridge for the existing synchronous SQLite rules.
// The worker owns one real PG connection; BEGIN/COMMIT never use separate clients.
// No business data is kept in worker memory or in the function's temporary disk.
export function openPostgres({
  connectionString = process.env.DATABASE_URL,
  testDatabaseDir,
  timeout = 25000,
} = {}) {
  if (!connectionString && !testDatabaseDir)
    throw new Error("请配置 DATABASE_URL（Supabase 的连接池连接串）");
  const worker = new Worker(resolve("server/cloud/postgres-worker.mjs"), {
    workerData: { connectionString, testDatabaseDir },
    execArgv: [],
  });
  let broken = false;
  const shared = new SharedArrayBuffer(8 + 4 * 1024 * 1024),
    status = new Int32Array(shared, 0, 2);
  worker.on("error", () => {
    broken = true;
  });
  worker.unref();
  function query(sql, values = [], method = "all") {
    if (broken) throw new Error("云端数据库连接不可用，请重试");
    Atomics.store(status, 0, 0);
    Atomics.store(status, 1, 0);
    worker.postMessage({ sql, values, method, shared });
    if (Atomics.wait(status, 0, 0, timeout) === "timed-out") {
      broken = true;
      void worker.terminate();
      throw Object.assign(new Error("数据库响应超时，请使用同一提交凭证重试"), {
        status: 503,
      });
    }
    const result = JSON.parse(
      new TextDecoder().decode(new Uint8Array(shared, 8, status[1])),
    );
    if (result.error) {
      if (result.code === "PG_CONNECTION" || /^(08|57P0)/.test(result.code)) {
        broken = true;
        void worker.terminate();
      }
      throw Object.assign(new Error(result.error), { code: result.code });
    }
    return result.value;
  }
  query("SELECT 1");
  return {
    dialect: "postgres",
    get broken() {
      return broken;
    },
    prepare(sql) {
      return {
        get: (...values) => query(sql, values, "get"),
        all: (...values) => query(sql, values, "all"),
        run: (...values) => query(sql, values, "run"),
      };
    },
    exec(sql) {
      return query(sql, [], "exec");
    },
    close() {
      broken = true;
      return worker.terminate();
    },
  };
}
