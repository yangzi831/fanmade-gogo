import { randomUUID } from "node:crypto";
import { transaction } from "./db.mjs";
import {
  Problem,
  publicMaterial,
  publicUser,
  readReservation,
} from "./rules.mjs";

// Reuse the original stock/booking scope internally; this container is never a catalog event.
export function personalCollection(db, userId) {
  return transaction(db, () => {
    let row = db
      .prepare("SELECT event_id FROM personal_collections WHERE creator_id=?")
      .get(userId);
    if (!row) {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO events(id,owner_id,title,date,end_date,location,instructions,city,venue,session) VALUES(?,?,?,'','','','','','','')",
      ).run(id, userId, "日常物料 · 未关联活动");
      db.prepare("INSERT INTO personal_collections VALUES(?,?)").run(
        userId,
        id,
      );
      db.prepare(
        "INSERT INTO event_creators(event_id,creator_id) VALUES(?,?)",
      ).run(id, userId);
      row = { event_id: id };
    }
    return {
      ...db
        .prepare(
          "SELECT e.*,c.instructions,c.published FROM events e JOIN event_creators c ON c.event_id=e.id WHERE e.id=? AND c.creator_id=?",
        )
        .get(row.event_id, userId),
      personal: true,
    };
  });
}
export function browseMaterials(
  db,
  { q = "", category = "", mode = "", username = "" } = {},
) {
  const rows = db
    .prepare(
      `SELECT m.*,u.username FROM materials m JOIN users u ON u.id=m.creator_id
    JOIN events e ON e.id=m.event_id JOIN event_creators c ON c.event_id=e.id AND c.creator_id=m.creator_id
    WHERE m.published=1 AND c.published=1 AND e.published=1 ORDER BY m.rowid DESC`,
    )
    .all();
  const norm = (v) => String(v).normalize("NFKC").toLowerCase();
  const terms = norm(q).trim().split(/\s+/).filter(Boolean);
  return rows
    .filter(
      (m) =>
        (!category || m.category === category) &&
        (!mode || m.mode === mode || m.mode === "both") &&
        (!username || m.username === username),
    )
    .map((m) => {
      const creator = publicUser(
        db.prepare("SELECT * FROM users WHERE id=?").get(m.creator_id),
      );
      const event = db
        .prepare(
          "SELECT id,title,date,end_date,city,venue,session,kind,poster FROM events WHERE id=?",
        )
        .get(m.event_id);
      const personal = !!db
        .prepare("SELECT 1 FROM personal_collections WHERE event_id=?")
        .get(m.event_id);
      return {
        material: publicMaterial(m),
        creator,
        event: personal ? null : event,
        scopeId: m.event_id,
        detailPath: personal
          ? `/u/${creator.username}/m/${m.id}`
          : `/e/${event.id}/by/${creator.username}/m/${m.id}`,
      };
    })
    .filter((v) =>
      terms.every((t) =>
        norm(
          [
            v.material.name,
            v.material.description,
            v.creator.nickname,
            v.event?.title || "",
            v.event?.city || "",
          ].join(" "),
        ).includes(t),
      ),
    );
}
export function accountRecords(db, userId, direction = "received") {
  const column = direction === "sent" ? "creator_id" : "recipient_id";
  return db
    .prepare(
      `SELECT id FROM reservations WHERE ${column}=? ORDER BY created_at DESC,rowid DESC`,
    )
    .all(userId)
    .map((r) => readReservation(db, r.id));
}
export function participantRecord(db, id, userId) {
  const row = db
    .prepare("SELECT creator_id,recipient_id FROM reservations WHERE id=?")
    .get(id);
  if (!row || (row.creator_id !== userId && row.recipient_id !== userId))
    throw new Problem(404, "找不到可访问的记录");
  return readReservation(db, id);
}
