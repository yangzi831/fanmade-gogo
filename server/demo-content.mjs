import { eventIdentity } from "./event-identity.mjs";

export const demoEvents = [
  ["在秋天，听一场日落", "杭州西湖音乐节（演示）", "音乐节"],
  ["等一场好戏，也等你", "上海音乐剧物料交换会（演示）", "剧场"],
  ["把晚风装进口袋", "南京冬日音乐会（演示）", "演唱会"],
];
export const demoMaterials = [
  ["把日落贴在身上", "日落图案异形贴纸", "贴纸"],
  ["一些关于现场的记忆", "音乐节双面明信片", "明信片"],
  ["永远有下一场", "58mm 音乐徽章", "徽章"],
  ["小小音符贴纸包", "音符贴纸包（4枚）", "贴纸"],
  ["谢幕之后，还在发光", "音乐剧珠光明信片", "明信片"],
  ["给你一颗舞台星星", "星形舞台贴纸", "贴纸"],
  ["晚风来信", "冬日纹理纸明信片", "明信片"],
];
// Change only the untouched, explicitly marked fixtures, preserving IDs and all stock.
export function updateDemoContent(db) {
  db.prepare(
    "UPDATE users SET nickname='贴纸盒' WHERE demo=1 AND username='wuwei' AND nickname='无为'",
  ).run();
  db.prepare(
    "UPDATE users SET nickname='徽章夹' WHERE demo=1 AND username='xiaoyu' AND nickname='小屿'",
  ).run();
  db.prepare(
    "UPDATE users SET bio='分享音乐节贴纸、明信片和徽章。领取位置与时间请看各场活动说明。' WHERE demo=1 AND bio='把听过的歌、看过的舞台，做成可以带走的小小纪念。现场见，也欢迎带着你的喜欢来交换。'",
  ).run();
  db.prepare(
    "UPDATE users SET bio='制作剧场明信片和舞台贴纸，支持免费领取与物料互换。' WHERE demo=1 AND bio='为喜欢的剧做一些纸上纪念。收集谢幕，也收集每一次相遇。'",
  ).run();
  for (const [old, title, kind] of demoEvents) {
    const events = db
      .prepare("SELECT * FROM events WHERE demo=1 AND title IN (?,?)")
      .all(old, title);
    for (const e of events) {
      const key = eventIdentity({ ...e, title });
      if (
        db
          .prepare("SELECT 1 FROM events WHERE identity_key=? AND id<>?")
          .get(key, e.id)
      )
        continue;
      db.prepare(
        "UPDATE events SET title=?,kind=?,identity_key=? WHERE id=?",
      ).run(title, kind, key, e.id);
    }
  }
  for (const [old, name, category] of demoMaterials) {
    db.prepare(
      "UPDATE materials SET name=?,category=? WHERE name=? AND creator_id IN(SELECT id FROM users WHERE demo=1) AND event_id IN(SELECT id FROM events WHERE demo=1)",
    ).run(name, category, old);
  }
}
