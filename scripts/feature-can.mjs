import { openDb } from "../server/db.mjs";
import { installCanFeature } from "../server/feature-can.mjs";
const db = openDb();
try {
  const user = db
    .prepare("SELECT id FROM users WHERE is_admin=1 ORDER BY rowid LIMIT 1")
    .get();
  if (!user) throw Error("请先创建管理员账号");
  console.log("CAN 活动已收录：", installCanFeature(db, user.id));
} finally {
  db.close();
}
