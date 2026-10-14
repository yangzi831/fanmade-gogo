import { randomUUID } from "node:crypto";
import { transaction } from "./db.mjs";
import { Problem, publicUser, publicMaterial } from "./rules.mjs";
import {
  eventIdentity,
  normalizeEventText as norm,
  hasEnded,
} from "./event-identity.mjs";
export function resolveEventId(db, id) {
  return (
    db.prepare("SELECT event_id FROM event_aliases WHERE alias_id=?").get(id)
      ?.event_id || id
  );
}
export function getEvent(db, id) {
  const e = db
    .prepare("SELECT * FROM events WHERE id=? AND published=1")
    .get(resolveEventId(db, id));
  if (!e) throw new Problem(404, "活动不存在或尚未公开");
  return e;
}
export function catalogEvents(
  db,
  {
    q = "",
    city = "",
    date = "",
    upcomingWithMaterials = false,
    includeHidden = false,
  } = {},
) {
  const rows = db
    .prepare(
      `SELECT e.*,
    (SELECT COUNT(*) FROM materials m JOIN event_creators c ON c.event_id=m.event_id AND c.creator_id=m.creator_id WHERE m.event_id=e.id AND m.published=1 AND c.published=1) material_count,
    (SELECT COUNT(DISTINCT m.creator_id) FROM materials m JOIN event_creators c ON c.event_id=m.event_id AND c.creator_id=m.creator_id WHERE m.event_id=e.id AND m.published=1 AND c.published=1) creator_count
    FROM events e WHERE NOT EXISTS(SELECT 1 FROM personal_collections p WHERE p.event_id=e.id) ${includeHidden ? "" : "AND e.published=1"} ORDER BY e.date,e.session,e.title`,
    )
    .all();
  const terms = String(q)
    .normalize("NFKC")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(norm);
  return rows
    .filter(
      (e) =>
        terms.every((t) =>
          norm(
            [e.title, e.city, e.venue, e.date, e.session].join(" "),
          ).includes(t),
        ) &&
        (!city || norm(e.city).includes(norm(city))) &&
        (!date || (e.date <= date && e.end_date >= date)),
    )
    .map((e) => ({ ...e, ended: hasEnded(e) }))
    .filter(
      (e) => !upcomingWithMaterials || (!e.ended && e.material_count > 0),
    );
}
export function duplicateEvents(db, d, excludeId = "") {
  const key = eventIdentity(d);
  return catalogEvents(db, { includeHidden: true })
    .filter((e) => e.id !== excludeId)
    .filter((e) => {
      const a = norm(e.title),
        b = norm(d.title),
        sameName = a === b || a.includes(b) || b.includes(a);
      const closeDate =
        Math.abs(Date.parse(e.date) - Date.parse(d.date)) <= 7 * 86400000;
      return (
        e.identity_key === key ||
        (sameName && (norm(e.city) === norm(d.city) || closeDate)) ||
        (norm(e.city) === norm(d.city) &&
          norm(e.venue) === norm(d.venue) &&
          e.date === d.date)
      );
    })
    .map((e) => ({ ...e, exact: e.identity_key === key }));
}
export function joinEvent(db, eventId, creatorId) {
  const e = getEvent(db, eventId);
  if (
    db.prepare("SELECT 1 FROM personal_collections WHERE event_id=?").get(e.id)
  )
    throw new Problem(404, "请选择共享活动");
  db.prepare(
    "INSERT OR IGNORE INTO event_creators(event_id,creator_id) VALUES(?,?)",
  ).run(e.id, creatorId);
  return e.id;
}
export function createCatalogEvent(db, d, userId, { join = false } = {}) {
  return transaction(db, () => {
    const duplicates = duplicateEvents(db, d);
    if (duplicates.some((e) => e.exact))
      throw new Problem(
        409,
        "相同名称、城市、日期、场次和场地的活动已存在，请搜索并选择已有活动",
      );
    if (duplicates.length && !d.acknowledgeDuplicates)
      throw new Problem(
        409,
        "发现可能重复的活动，请先核对候选活动并确认不是同一场",
      );
    const id = randomUUID();
    db.prepare(
      "INSERT INTO events(id,owner_id,title,date,location,instructions,theme,published,city,venue,session,end_date,end_time,identity_key,kind) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      userId,
      d.title,
      d.date,
      `${d.city} · ${d.venue}`,
      "",
      d.theme,
      1,
      d.city,
      d.venue,
      d.session,
      d.end_date,
      d.end_time,
      eventIdentity(d),
      d.kind || "其他",
    );
    if (join) joinEvent(db, id, userId);
    return { id };
  });
}
export function creatorListing(db, eventId, username) {
  const e = getEvent(db, eventId);
  const u = db.prepare("SELECT * FROM users WHERE username=?").get(username);
  const c =
    u &&
    db
      .prepare(
        "SELECT * FROM event_creators WHERE event_id=? AND creator_id=? AND published=1",
      )
      .get(e.id, u.id);
  if (!c) throw new Problem(404, "制作人的物料清单不存在或尚未公开");
  return {
    event: {
      ...e,
      instructions: c.instructions,
      personal: !!db
        .prepare("SELECT 1 FROM personal_collections WHERE event_id=?")
        .get(e.id),
    },
    creator: publicUser(u),
    materials: db
      .prepare(
        "SELECT * FROM materials WHERE event_id=? AND creator_id=? AND published=1 ORDER BY rowid",
      )
      .all(e.id, u.id)
      .map(publicMaterial),
  };
}
export function eventGroups(db, eventId) {
  const e = getEvent(db, eventId);
  if (
    db.prepare("SELECT 1 FROM personal_collections WHERE event_id=?").get(e.id)
  )
    throw new Problem(404, "这不是共享活动，请打开发布者的公开主页");
  const creators = db
    .prepare(
      "SELECT u.username FROM event_creators c JOIN users u ON u.id=c.creator_id WHERE c.event_id=? AND c.published=1 AND EXISTS(SELECT 1 FROM materials m WHERE m.event_id=c.event_id AND m.creator_id=c.creator_id AND m.published=1) ORDER BY u.nickname",
    )
    .all(e.id);
  return {
    event: { ...e, ended: hasEnded(e) },
    groups: creators.map((u) => creatorListing(db, e.id, u.username)),
  };
}
