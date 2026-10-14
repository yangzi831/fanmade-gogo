import { browseMaterials } from "./accounts.mjs";
import { catalogEvents } from "./events.mjs";
import { Problem, publicUser } from "./rules.mjs";

export function favorites(db, uid) {
  const rows = db
    .prepare(
      "SELECT kind,target_id FROM user_favorites WHERE user_id=? ORDER BY created_at DESC",
    )
    .all(uid);
  const ids = (kind) =>
    rows.filter((r) => r.kind === kind).map((r) => r.target_id);
  const materialIds = ids("material"),
    eventIds = ids("event"),
    creatorIds = ids("creator");
  return {
    materialIds,
    eventIds,
    creatorIds,
    // Saved references do not bypass publication rules or duplicate inventory.
    materials: browseMaterials(db).filter((e) =>
      materialIds.includes(e.material.id),
    ),
    events: catalogEvents(db).filter((e) => eventIds.includes(e.id)),
    creators: db
      .prepare("SELECT * FROM users")
      .all()
      .filter((u) => creatorIds.includes(u.id))
      .map(publicUser),
  };
}
export function setFavorite(db, uid, kind, id, saved) {
  if (!saved) {
    db.prepare(
      "DELETE FROM user_favorites WHERE user_id=? AND kind=? AND target_id=?",
    ).run(uid, kind, id);
    return;
  }
  const exists =
    kind === "material"
      ? browseMaterials(db).some((e) => e.material.id === id)
      : kind === "event"
        ? catalogEvents(db).some((e) => e.id === id)
        : !!db.prepare("SELECT 1 FROM users WHERE id=?").get(id);
  if (!exists) throw new Problem(404, "内容不存在或尚未公开");
  db.prepare("INSERT OR IGNORE INTO user_favorites VALUES(?,?,?,?)").run(
    uid,
    kind,
    id,
    new Date().toISOString(),
  );
}
