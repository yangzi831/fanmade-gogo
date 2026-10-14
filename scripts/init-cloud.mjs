import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { openPostgres } from "../server/cloud/postgres.mjs";
import { transaction } from "../server/db.mjs";
import { installCanFeature } from "../server/feature-can.mjs";
const {
  OWNER_USERNAME: username,
  OWNER_PASSWORD: password,
  SUPABASE_URL: url,
  SUPABASE_SECRET_KEY: key,
} = process.env;
if (
  !/^[a-z0-9_-]{3,30}$/.test(username || "") ||
  (password || "").length < 12 ||
  /YOUR_|PROJECT_REF/i.test(password || "") ||
  !url ||
  /PROJECT_REF/.test(url) ||
  !key ||
  /YOUR_/.test(key) ||
  !process.env.DATABASE_URL ||
  /YOUR_|PROJECT_REF/.test(process.env.DATABASE_URL)
)
  throw new Error(
    "请在 .env.cloud 配置 OWNER_USERNAME、至少 12 位的 OWNER_PASSWORD、SUPABASE_URL、SUPABASE_SECRET_KEY 和 DATABASE_URL；凭据不会打印。",
  );
const db = openPostgres();
try {
  const exists = db
    .prepare("SELECT to_regclass('fanmade.users') AS existing")
    .get().existing;
  if (!exists)
    db.exec(
      readFileSync("supabase/migrations/202610140001_initial.sql", "utf8"),
    );
  const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    bucket = process.env.SUPABASE_BUCKET || "fanmade-images";
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error)
    throw new Error("无法读取图片桶，请核对服务端 Secret key 和连接。");
  const found = buckets.find((b) => b.id === bucket);
  if (found?.public)
    throw new Error(
      "指定的图片桶是公开的，不能用于私密互换图片；请使用私有桶。",
    );
  if (!found) {
    const { error } = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 2 * 1024 * 1024,
      allowedMimeTypes: ["image/webp"],
    });
    if (error)
      throw new Error(
        "无法创建私有图片桶，请在 Supabase Storage 中创建 fanmade-images。",
      );
  }
  const encoded = await bcrypt.hash(password, 12);
  transaction(db, () => {
    if (db.prepare("SELECT 1 FROM users LIMIT 1").get()) {
      console.log("账号已存在：未修改任何现有账号或管理员。");
      return;
    }
    db.prepare(
      "INSERT INTO users(id,username,password,nickname,is_admin) VALUES(?,?,?,?,1)",
    ).run(
      randomUUID(),
      username,
      encoded,
      process.env.OWNER_NICKNAME || username,
    );
    console.log("已创建站点拥有者账号，未创建公开密码的演示管理员。");
  });
  const owner = db
    .prepare("SELECT id FROM users WHERE is_admin=1 ORDER BY rowid LIMIT 1")
    .get();
  if (owner) installCanFeature(db, owner.id);
  console.log(
    "真实 PostgreSQL 与私有图片桶配置完成；原本地数据未上传、未改动。",
  );
} finally {
  await db.close();
}
