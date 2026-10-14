import { createHash, randomBytes, randomUUID } from "node:crypto";
import { transaction } from "./db.mjs";
import { closure } from "./availability.mjs";
export class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const hash = (s) => createHash("sha256").update(s).digest("hex");
export const contactKey = (s) =>
  hash(s.trim().normalize("NFKC").toLowerCase().replace(/\s/g, ""));
export const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  nickname: u.nickname,
  avatar: u.avatar,
  bio: u.bio,
  demo: !!u.demo,
  is_admin: !!u.is_admin,
});
export const publicMaterial = (m) => ({
  ...m,
  available: m.total - m.reserved - m.collected,
  closed_reason: closure(m),
});
export function readReservation(db, id) {
  const r = db
    .prepare(
      "SELECT id,event_id,creator_id,kind,status,nickname,contact,note,note_image,code,created_at FROM reservations WHERE id=?",
    )
    .get(id);
  if (!r) throw new Problem(404, "找不到这份预约");
  r.items = db
    .prepare(
      "SELECT i.material_id,i.quantity,m.name,m.image FROM reservation_items i JOIN materials m ON m.id=i.material_id WHERE reservation_id=?",
    )
    .all(id);
  r.event = db
    .prepare(
      "SELECT e.id,e.title,e.date,e.city,e.venue,e.session,e.location,c.instructions FROM events e JOIN event_creators c ON c.event_id=e.id WHERE e.id=? AND c.creator_id=?",
    )
    .get(r.event_id, r.creator_id);
  r.creator = publicUser(
    db.prepare("SELECT * FROM users WHERE id=?").get(r.creator_id),
  );
  r.event.personal = !!db
    .prepare("SELECT 1 FROM personal_collections WHERE event_id=?")
    .get(r.event_id);
  const recipient = db
    .prepare(
      "SELECT u.* FROM users u JOIN reservations r ON r.recipient_id=u.id WHERE r.id=?",
    )
    .get(id);
  r.recipient = recipient ? publicUser(recipient) : null;
  r.exchange =
    db
      .prepare(
        "SELECT offer,image FROM exchange_applications WHERE reservation_id=?",
      )
      .get(id) || null;
  return r;
}
export function createReservation(
  db,
  input,
  recipientId = null,
  checkAttachment = () => {},
) {
  const fingerprint = hash(JSON.stringify(input));
  // Derived from an unguessable client key: retry returns the same secret, while only its hash is stored.
  const token = hash("reservation:" + input.requestKey);
  return transaction(db, () => {
    const existing = db
      .prepare("SELECT id,request_hash FROM reservations WHERE request_key=?")
      .get(input.requestKey);
    if (existing) {
      if (existing.request_hash !== fingerprint)
        throw new Problem(409, "此提交凭证已用于其他内容，请重新提交");
      return {
        reservation: readReservation(db, existing.id),
        token,
        replayed: true,
      };
    }
    checkAttachment(input.noteImage || "");
    if (input.kind === "swap") checkAttachment(input.offerImage || "");
    const resolvedId =
      db
        .prepare("SELECT event_id FROM event_aliases WHERE alias_id=?")
        .get(input.eventId)?.event_id || input.eventId;
    const event = db
      .prepare("SELECT * FROM events WHERE id=? AND published=1")
      .get(resolvedId);
    if (!event) throw new Problem(404, "活动不存在或未公开");
    const first = db
      .prepare("SELECT creator_id FROM materials WHERE id=? AND event_id=?")
      .get(input.items[0].materialId, event.id);
    if (!first) throw new Problem(400, "物料不属于本次活动");
    const creatorId = first.creator_id;
    if (input.creatorId && input.creatorId !== creatorId)
      throw new Problem(400, "物料不属于指定制作人");
    if (
      !db
        .prepare(
          "SELECT 1 FROM event_creators WHERE event_id=? AND creator_id=? AND published=1",
        )
        .get(event.id, creatorId)
    )
      throw new Problem(404, "制作人的物料清单未公开");
    const ids = new Set();
    const key = contactKey(input.contact);
    for (const item of input.items) {
      if (ids.has(item.materialId))
        throw new Problem(400, "同一物料只能选择一次");
      ids.add(item.materialId);
      const m = db
        .prepare("SELECT * FROM materials WHERE id=? AND event_id=?")
        .get(item.materialId, event.id);
      if (!m) throw new Problem(400, "物料不属于本次活动");
      if (m.creator_id !== creatorId)
        throw new Problem(400, "每份预约只能包含同一制作人的物料，请分别预约");
      const closed = closure(m);
      if (closed)
        throw new Problem(
          409,
          closed === "draft"
            ? "物料尚未发布"
            : closed === "deadline"
              ? `${m.name}已截止预约`
              : `${m.name}已暂停领取`,
        );
      if (m.mode !== "both" && m.mode !== input.kind)
        throw new Problem(400, `${m.name}不支持本次领取方式`);
      const previous = db
        .prepare(
          "SELECT COALESCE(SUM(i.quantity),0) AS n FROM reservation_items i JOIN reservations r ON r.id=i.reservation_id WHERE i.material_id=? AND r.contact_key=? AND r.status IN ('pending','reserved','collected')",
        )
        .get(m.id, key).n;
      if (previous + item.quantity > m.per_person)
        throw new Problem(
          409,
          `${m.name}：同一联系方式累计限领 ${m.per_person} 份（含待确认互换）`,
        );
      if (
        input.kind === "free" &&
        m.total - m.reserved - m.collected < item.quantity
      )
        throw new Problem(409, `${m.name}余量不足，请调整数量`);
    }
    const id = randomUUID();
    const code = randomBytes(5).toString("hex").toUpperCase();
    db.prepare(
      "INSERT INTO reservations(id,event_id,kind,status,nickname,contact,contact_key,note,code,token_hash,request_key,request_hash,created_at,creator_id,recipient_id,note_image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      event.id,
      input.kind,
      input.kind === "free" ? "reserved" : "pending",
      input.nickname,
      input.contact,
      key,
      input.note,
      code,
      hash(token),
      input.requestKey,
      fingerprint,
      new Date().toISOString(),
      creatorId,
      recipientId,
      input.noteImage || "",
    );
    for (const i of input.items) {
      db.prepare("INSERT INTO reservation_items VALUES(?,?,?)").run(
        id,
        i.materialId,
        i.quantity,
      );
      if (input.kind === "free")
        db.prepare("UPDATE materials SET reserved=reserved+? WHERE id=?").run(
          i.quantity,
          i.materialId,
        );
    }
    if (input.kind === "swap")
      db.prepare("INSERT INTO exchange_applications VALUES(?,?,?)").run(
        id,
        input.offer,
        input.offerImage,
      );
    return { reservation: readReservation(db, id), token, replayed: false };
  });
}
export function transition(db, id, action) {
  return transaction(db, () => {
    const r = db.prepare("SELECT * FROM reservations WHERE id=?").get(id);
    if (!r) throw new Problem(404, "预约不存在");
    const target = {
      accept: "reserved",
      reject: "rejected",
      cancel: "cancelled",
      collect: "collected",
    }[action];
    if (r.status === target) return readReservation(db, id);
    if (
      !(
        {
          accept: ["pending"],
          reject: ["pending"],
          cancel: ["pending", "reserved"],
          collect: ["reserved"],
        }[action] || []
      ).includes(r.status)
    )
      throw new Problem(409, "当前状态不能执行此操作");
    const items = db
      .prepare(
        "SELECT i.*,m.total,m.reserved,m.collected,m.name FROM reservation_items i JOIN materials m ON m.id=i.material_id WHERE reservation_id=?",
      )
      .all(id);
    for (const i of items) {
      if (action === "accept") {
        if (i.total - i.reserved - i.collected < i.quantity)
          throw new Problem(409, `${i.name}余量不足，无法确认互换`);
        db.prepare("UPDATE materials SET reserved=reserved+? WHERE id=?").run(
          i.quantity,
          i.material_id,
        );
      } else if (r.status === "reserved") {
        db.prepare(
          "UPDATE materials SET reserved=reserved-?,collected=collected+? WHERE id=?",
        ).run(i.quantity, action === "collect" ? i.quantity : 0, i.material_id);
      }
    }
    db.prepare("UPDATE reservations SET status=? WHERE id=?").run(target, id);
    return readReservation(db, id);
  });
}
