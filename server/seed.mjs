import { openDb, transaction } from "./db.mjs";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eventIdentity } from "./event-identity.mjs";
import { installCanFeature } from "./feature-can.mjs";
import { updateDemoContent } from "./demo-content.mjs";
const db = openDb();
if (
  db.prepare("SELECT id FROM users WHERE username IN ('wuwei','xiaoyu')").get()
) {
  console.log("演示账号已存在，未覆盖任何数据。");
  db.close();
  process.exit(0);
}
const password = await bcrypt.hash("Demo2026!share", 12);
transaction(db, () => {
  const a = randomUUID(),
    b = randomUUID();
  const addUser = db.prepare(
    "INSERT INTO users(id,username,password,nickname,avatar,bio,demo,is_admin) VALUES(?,?,?,?,?,?,1,?)",
  );
  addUser.run(
    a,
    "wuwei",
    password,
    "贴纸盒",
    "/assets/avatar-wuwei.svg",
    "分享音乐节贴纸、明信片和徽章。领取位置与时间请看各场活动说明。",
    1,
  );
  addUser.run(
    b,
    "xiaoyu",
    password,
    "徽章夹",
    "/assets/avatar-xiaoyu.svg",
    "制作剧场明信片和舞台贴纸，支持免费领取与物料互换。",
    0,
  );
  const e1 = randomUUID(),
    e2 = randomUUID(),
    e3 = randomUUID();
  const addEvent = db.prepare(
    "INSERT INTO events(id,owner_id,title,date,location,instructions,theme,published,demo) VALUES(?,?,?,?,?,?,?,?,1)",
  );
  addEvent.run(
    e1,
    a,
    "杭州西湖音乐节（演示）",
    "2026-11-07",
    "杭州 · 西湖音乐节",
    "11 月 7 日 14:00–16:00，草坪区入口左侧。带着领取码来找戴绿色帽子的我；如有变化会更新这里。",
    "sage",
    1,
  );
  addEvent.run(
    e2,
    b,
    "上海音乐剧物料交换会（演示）",
    "2026-11-14",
    "上海 · 文化广场 · 音乐剧之夜",
    "演出前 18:00–19:00，剧院正门右侧领取。互换请先提交你带来的物料说明，确认后再来碰面。",
    "lilac",
    1,
  );
  addEvent.run(
    e3,
    a,
    "南京冬日音乐会（演示）",
    "2026-12-05",
    "南京 · 江边冬日音乐会",
    "15:00–16:00 观众入口，领取前请打开预约页面核对说明。",
    "peach",
    1,
  );
  const add = db.prepare(
    "INSERT INTO materials(id,event_id,name,description,image,mode,total,per_person,creator_id,category) VALUES(?,?,?,?,?,?,?,?,(SELECT owner_id FROM events WHERE id=?),?)",
  );
  const list = [
    [
      e1,
      "日落图案异形贴纸",
      "一枚日落，一点自由。原创异形贴纸，哑光覆膜，约 6 × 8 cm。可以贴在水杯、手账或你喜欢的地方。",
      "sunset",
      "free",
      60,
      2,
    ],
    [
      e1,
      "音乐节双面明信片",
      "把草坪、晚风和那首安可，寄给未来的自己。300g 纹理纸双面明信片，10 × 15 cm。",
      "postcard",
      "both",
      40,
      1,
    ],
    [
      e1,
      "58mm 音乐徽章",
      "给每一个还想听下去的人。58mm 磨砂徽章，附透明保护袋；仅限物料互换。",
      "badge",
      "swap",
      24,
      1,
    ],
    [
      e1,
      "音符贴纸包（4枚）",
      "把喜欢的旋律贴进日常。一包 4 枚，手工裁切，每一包都有一点不一样。",
      "notes",
      "free",
      30,
      1,
    ],
    [
      e2,
      "音乐剧珠光明信片",
      "为剧场里的每束光留一张位置。银紫色原创明信片，珠光纸双面印刷。",
      "theatre",
      "both",
      32,
      1,
    ],
    [
      e2,
      "星形舞台贴纸",
      "小小一枚星形贴纸，愿下次也在剧院见。",
      "star",
      "free",
      50,
      2,
    ],
    [
      e3,
      "冬日纹理纸明信片",
      "冬日限定原创明信片，厚纹纸，手写一句祝福送给你。",
      "postcard",
      "free",
      25,
      1,
    ],
  ];
  for (const [e, n, d, img, m, t, p] of list) {
    const category =
      img === "badge"
        ? "徽章"
        : ["postcard", "theatre"].includes(img)
          ? "明信片"
          : "贴纸";
    add.run(
      randomUUID(),
      e,
      n,
      d,
      "/assets/" + img + ".svg",
      m,
      t,
      p,
      e,
      category,
    );
  }
  for (const e of db.prepare("SELECT * FROM events").all()) {
    const [city, ...rest] = e.location.split("·").map((s) => s.trim());
    const updated = { ...e, city, venue: rest.join(" · "), session: "全天" };
    db.prepare(
      "UPDATE events SET city=?,venue=?,end_date=?,identity_key=? WHERE id=?",
    ).run(updated.city, updated.venue, e.date, eventIdentity(updated), e.id);
    db.prepare("INSERT INTO event_creators VALUES(?,?,?,?)").run(
      e.id,
      e.owner_id,
      e.instructions,
      e.published,
    );
  }
});
transaction(db, () => updateDemoContent(db));
installCanFeature(
  db,
  db.prepare("SELECT id FROM users WHERE username='wuwei'").get().id,
);
db.close();
console.log(
  "已创建演示数据：wuwei / xiaoyu，密码均为 Demo2026!share。仅供本地试用。",
);
