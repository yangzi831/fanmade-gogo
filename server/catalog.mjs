import { publicMaterial, publicUser, Problem } from "./rules.mjs";
import { hasEnded } from "./event-identity.mjs";

const publicScope = "m.published=1 AND c.published=1 AND e.published=1";
const joins =
  "FROM materials m JOIN users u ON u.id=m.creator_id JOIN events e ON e.id=m.event_id JOIN event_creators c ON c.event_id=e.id AND c.creator_id=m.creator_id";
function paging(query) {
  const limit = Number(query.limit ?? 24),
    offset = Number(query.offset ?? 0);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 48 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    throw new Problem(400, "分页参数无效（每页 1–48 条）");
  return { limit, offset };
}
function finish(rows, { limit, offset }, map = (r) => r) {
  return {
    items: rows.slice(0, limit).map(map),
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}
function search(where, params, expression, q) {
  const terms = String(q || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .slice(0, 160)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  for (const term of terms) {
    where.push(`lower(${expression}) LIKE ? ESCAPE '!'`);
    params.push("%" + term.replace(/[!%_]/g, "!$&") + "%");
  }
}
function kindFilter(where, params, expression, value) {
  if (value && value !== "全部") {
    where.push(expression + "=?");
    params.push(String(value));
  }
}
export function catalogMaterials(db, query = {}) {
  const page = paging(query),
    where = [publicScope],
    params = [];
  kindFilter(
    where,
    params,
    "CASE WHEN EXISTS(SELECT 1 FROM personal_collections p WHERE p.event_id=e.id) THEN '其他' ELSE e.kind END",
    query.kind,
  );
  if (query.category) {
    where.push("m.category=?");
    params.push(String(query.category));
  }
  if (query.mode) {
    where.push("(m.mode=? OR m.mode='both')");
    params.push(String(query.mode));
  }
  if (query.username) {
    where.push("u.username=?");
    params.push(String(query.username));
  }
  search(
    where,
    params,
    "m.name || ' ' || m.description || ' ' || u.nickname || ' ' || e.title || ' ' || e.city",
    query.q,
  );
  const rows = db
    .prepare(
      `SELECT m.*,u.username,u.nickname,u.avatar,u.bio,u.demo,u.is_admin,e.title AS event_title,e.date AS event_date,e.end_date AS event_end_date,e.city AS event_city,e.venue AS event_venue,e.session AS event_session,e.kind AS event_kind,EXISTS(SELECT 1 FROM personal_collections p WHERE p.event_id=e.id) AS personal ${joins} WHERE ${where.join(" AND ")} ORDER BY m.rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, page.limit + 1, page.offset);
  return finish(rows, page, (r) => {
    const {
      username,
      nickname,
      avatar,
      bio,
      demo,
      is_admin,
      event_title,
      event_date,
      event_end_date,
      event_city,
      event_venue,
      event_session,
      event_kind,
      personal,
      ...m
    } = r;
    const creator = publicUser({
      id: m.creator_id,
      username,
      nickname,
      avatar,
      bio,
      demo,
      is_admin,
    });
    return {
      material: publicMaterial(m),
      creator,
      event: personal
        ? null
        : {
            id: m.event_id,
            title: event_title,
            date: event_date,
            end_date: event_end_date,
            city: event_city,
            venue: event_venue,
            session: event_session,
            kind: event_kind,
          },
      scopeId: m.event_id,
      detailPath: personal
        ? `/u/${username}/m/${m.id}`
        : `/e/${m.event_id}/by/${username}/m/${m.id}`,
    };
  });
}
export function catalogEventPage(db, query = {}) {
  const page = paging(query),
    where = [
      "e.published=1",
      "NOT EXISTS(SELECT 1 FROM personal_collections p WHERE p.event_id=e.id)",
    ],
    params = [];
  kindFilter(where, params, "e.kind", query.kind);
  search(
    where,
    params,
    "e.title || ' ' || e.city || ' ' || e.venue || ' ' || e.date || ' ' || e.session",
    query.q,
  );
  search(where, params, "e.city", query.city);
  if (query.date) {
    where.push("e.date<=? AND COALESCE(NULLIF(e.end_date,''),e.date)>=?");
    params.push(String(query.date), String(query.date));
  }
  if (query.upcoming === "1") {
    const now = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16);
    where.push(
      "COALESCE(NULLIF(e.end_date,''),e.date) || 'T' || e.end_time >= ?",
    );
    params.push(now);
    where.push(
      `EXISTS(SELECT 1 FROM materials m JOIN event_creators c ON c.event_id=m.event_id AND c.creator_id=m.creator_id WHERE m.event_id=e.id AND m.published=1 AND c.published=1)`,
    );
  }
  const count =
    "FROM materials m JOIN event_creators c ON c.event_id=m.event_id AND c.creator_id=m.creator_id WHERE m.event_id=e.id AND m.published=1 AND c.published=1";
  const rows = db
    .prepare(
      `SELECT e.*,(SELECT COUNT(*) ${count}) AS material_count,(SELECT COUNT(DISTINCT m.creator_id) ${count}) AS creator_count FROM events e WHERE ${where.join(" AND ")} ORDER BY e.date,e.session,e.title,e.id LIMIT ? OFFSET ?`,
    )
    .all(...params, page.limit + 1, page.offset);
  return finish(rows, page, (e) => ({ ...e, ended: hasEnded(e) }));
}
export function catalogCreators(db, query = {}) {
  const page = paging(query),
    where = [],
    params = [];
  search(
    where,
    params,
    "u.nickname || ' ' || u.username || ' ' || u.bio",
    query.q,
  );
  const materialWhere = [publicScope, "m.creator_id=u.id"];
  kindFilter(
    materialWhere,
    params,
    "CASE WHEN EXISTS(SELECT 1 FROM personal_collections p WHERE p.event_id=e.id) THEN '其他' ELSE e.kind END",
    query.kind,
  );
  where.push(
    `EXISTS(SELECT 1 FROM materials m JOIN events e ON e.id=m.event_id JOIN event_creators c ON c.event_id=e.id AND c.creator_id=m.creator_id WHERE ${materialWhere.join(" AND ")})`,
  );
  const rows = db
    .prepare(
      `SELECT u.* FROM users u WHERE ${where.join(" AND ")} ORDER BY u.demo DESC,u.nickname,u.id LIMIT ? OFFSET ?`,
    )
    .all(...params, page.limit + 1, page.offset);
  return finish(rows, page, (u) => ({
    ...publicUser(u),
    previews: catalogMaterials(db, { username: u.username, limit: 3 }).items,
  }));
}
