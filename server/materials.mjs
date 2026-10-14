import { randomUUID, randomBytes } from "node:crypto";
import { transaction } from "./db.mjs";
import { Problem, hash } from "./rules.mjs";

// Caller validates the input and every uploaded image. This transaction owns all stock writes.
export function saveMaterials(db, eventId, creatorId, items, publish) {
  return transaction(db, () => {
    const ids = new Set();
    for (const d of items) {
      if (ids.has(d.id)) throw new Problem(400, "物料不能重复");
      ids.add(d.id);
      if (publish && !d.name.trim())
        throw new Problem(400, "发布前请填写每件物料名称");
      const old = db.prepare("SELECT * FROM materials WHERE id=?").get(d.id);
      if (old && (old.creator_id !== creatorId || old.event_id !== eventId))
        throw new Problem(404, "找不到可管理的物料");
      if (old && d.total < old.reserved + old.collected)
        throw new Problem(409, `${d.name}：总量不能小于已预留与已领取之和`);
      const values = [
        d.name,
        d.description,
        d.image,
        d.mode,
        d.total,
        d.per_person,
        d.category,
        d.size,
        d.medium,
        d.instructions,
        d.deadline,
        +d.paused,
        publish === undefined ? (old?.published ?? 1) : +publish,
      ];
      if (old)
        db.prepare(
          "UPDATE materials SET name=?,description=?,image=?,mode=?,total=?,per_person=?,category=?,size=?,medium=?,instructions=?,deadline=?,paused=?,published=? WHERE id=?",
        ).run(...values, d.id);
      else
        db.prepare(
          "INSERT INTO materials(name,description,image,mode,total,per_person,category,size,medium,instructions,deadline,paused,published,id,event_id,creator_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(...values, d.id, eventId, creatorId);
    }
    return { ids: [...ids] };
  });
}
export function manualHandoff(db, eventId, creatorId, d) {
  return transaction(db, () => {
    const fingerprint = hash(JSON.stringify({ eventId, ...d }));
    const old = db
      .prepare("SELECT * FROM manual_handoffs WHERE request_key=?")
      .get(d.requestKey);
    if (old) {
      if (old.creator_id !== creatorId || old.request_hash !== fingerprint)
        throw new Problem(409, "此登记凭证已用于其他内容");
      return { id: old.id, replayed: true };
    }
    const ids = new Set();
    for (const i of d.items) {
      if (ids.has(i.materialId)) throw new Problem(400, "同一物料只能登记一次");
      ids.add(i.materialId);
      const m = db
        .prepare(
          "SELECT * FROM materials WHERE id=? AND event_id=? AND creator_id=? AND published=1",
        )
        .get(i.materialId, eventId, creatorId);
      if (!m) throw new Problem(404, "找不到可发放的物料");
      if (m.mode !== "both" && m.mode !== d.kind)
        throw new Problem(400, `${m.name}不支持本次发放方式`);
      if (m.total - m.reserved - m.collected < i.quantity)
        throw new Problem(409, `${m.name}未预留库存不足；已有预约请标记领取`);
    }
    const id = randomUUID();
    db.prepare("INSERT INTO manual_handoffs VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
      id,
      eventId,
      creatorId,
      d.kind,
      d.nickname,
      d.contact,
      d.location,
      d.note,
      d.requestKey,
      fingerprint,
      new Date().toISOString(),
    );
    for (const i of d.items) {
      db.prepare("INSERT INTO manual_handoff_items VALUES(?,?,?)").run(
        id,
        i.materialId,
        i.quantity,
      );
      db.prepare("UPDATE materials SET collected=collected+? WHERE id=?").run(
        i.quantity,
        i.materialId,
      );
    }
    return { id, replayed: false };
  });
}
export function handoffs(db, eventId, creatorId) {
  return db
    .prepare(
      "SELECT id,kind,nickname,contact,location,note,created_at FROM manual_handoffs WHERE event_id=? AND creator_id=? ORDER BY created_at DESC",
    )
    .all(eventId, creatorId)
    .map((r) => ({
      ...r,
      items: db
        .prepare(
          "SELECT i.material_id,i.quantity,m.name FROM manual_handoff_items i JOIN materials m ON m.id=i.material_id WHERE i.handoff_id=?",
        )
        .all(r.id),
    }));
}
export function createShare(db, eventId, creatorId, ids) {
  if (new Set(ids).size !== ids.length)
    throw new Problem(400, "分享物料不能重复");
  for (const id of ids)
    if (
      !db
        .prepare(
          "SELECT 1 FROM materials WHERE id=? AND event_id=? AND creator_id=? AND published=1",
        )
        .get(id, eventId, creatorId)
    )
      throw new Problem(404, "只能分享自己已发布的物料");
  const id = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO share_lists VALUES(?,?,?,?,?)").run(
    id,
    eventId,
    creatorId,
    JSON.stringify(ids),
    new Date().toISOString(),
  );
  return { id, path: "/s/" + id };
}
