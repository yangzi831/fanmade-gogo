import { randomUUID } from "node:crypto";
import { eventIdentity } from "./event-identity.mjs";
import { transaction } from "./db.mjs";

// Explicit editorial import of the supplied poster, never inferred from a title alone.
export function installCanFeature(db, ownerId) {
  const d = {
    title: "楠溪江·2026 Can Festival PT.2",
    city: "温州",
    venue: "楠溪江",
    date: "2026-10-16",
    session: "全天",
  };
  return transaction(db, () => {
    const key = eventIdentity(d);
    let id = db
      .prepare("SELECT id FROM events WHERE identity_key=?")
      .get(key)?.id;
    if (!id) {
      id = randomUUID();
      db.prepare(
        "INSERT INTO events(id,owner_id,title,date,end_date,location,instructions,city,venue,session,identity_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        ownerId,
        d.title,
        d.date,
        "2026-10-18",
        "温州 · 楠溪江",
        "",
        d.city,
        d.venue,
        d.session,
        key,
      );
    }
    db.prepare(
      "UPDATE events SET kind='音乐节',poster='/assets/can-festival-2026-pt2.jpg',featured=10 WHERE id=?",
    ).run(id);
    // Only label the known demo fixtures; existing user events remain untouched.
    db.prepare(
      "UPDATE events SET kind='剧场' WHERE demo=1 AND title='等一场好戏，也等你' AND city='上海'",
    ).run();
    return id;
  });
}
