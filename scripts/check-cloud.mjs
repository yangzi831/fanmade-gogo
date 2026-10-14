// Print status only: never connection strings, credentials or raw driver errors.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { openPostgres } from "../server/cloud/postgres.mjs";
import { supabaseImageStore } from "../server/cloud/storage.mjs";
let db, probe;
const store = supabaseImageStore();
try {
  db = openPostgres();
  db.prepare("SELECT 1").get();
  console.log("PostgreSQL 加密连接、认证和查询：通过");
  const counts = db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM users)::int users,(SELECT COUNT(*) FROM events)::int events,(SELECT COUNT(*) FROM materials)::int materials",
    )
    .get();
  console.log("云端记录数量：" + JSON.stringify(counts));
  const tables = db
    .prepare(
      "SELECT COUNT(*)::int n FROM pg_tables WHERE schemaname='fanmade' AND NOT rowsecurity",
    )
    .get().n;
  const access = db
    .prepare(
      "SELECT has_schema_privilege('anon','fanmade','USAGE') a,has_schema_privilege('authenticated','fanmade','USAGE') b",
    )
    .get();
  if (tables || access.a || access.b)
    throw new Error("数据库匿名访问权限检查未通过");
  console.log("业务表 RLS 及匿名／客户端角色权限：通过");
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const bucket = process.env.SUPABASE_BUCKET || "fanmade-images";
  const { data, error } = await client.storage.getBucket(bucket);
  if (error || data.public) throw new Error("图片桶认证或私有状态检查未通过");
  console.log("图片桶存在、认证通过、Public 关闭");
  probe = "connection-check-" + randomUUID() + ".webp";
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#45867c" },
  })
    .webp()
    .toBuffer();
  await store.put(probe, bytes);
  const read = await store.get(probe);
  if (!read?.equals(bytes)) throw new Error("图片上传读取一致性检查未通过");
  const response = await fetch(
    process.env.SUPABASE_URL +
      "/storage/v1/object/public/" +
      bucket +
      "/" +
      probe,
    { signal: AbortSignal.timeout(10000) },
  );
  if (![400, 401, 403, 404].includes(response.status))
    throw new Error("图片桶匿名访问检查未通过");
  await store.remove(probe);
  probe = null;
  console.log("图片实际上传／读取／删除、匿名访问拒绝：通过");
} catch (error) {
  console.error(
    error.status || error.code
      ? "云端检查失败，请核对网络与配置；未输出底层错误或凭据"
      : error.message,
  );
  process.exitCode = 1;
} finally {
  if (probe) await store.remove(probe).catch(() => {});
  await db?.close();
}
