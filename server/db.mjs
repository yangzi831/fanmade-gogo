import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { eventIdentity } from "./event-identity.mjs";
import { updateDemoContent } from "./demo-content.mjs";
export function openDb(dir = process.env.DATA_DIR || "./data") {
  const { DatabaseSync } = createRequire(resolve("package.json"))(
    "node:sqlite",
  );
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(resolve(dir, "materials.sqlite"));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, nickname TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', demo INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, date TEXT NOT NULL, location TEXT NOT NULL, instructions TEXT NOT NULL, theme TEXT NOT NULL DEFAULT 'sage', published INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS materials(id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), name TEXT NOT NULL, description TEXT NOT NULL, image TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('free','swap','both')), total INTEGER NOT NULL CHECK(total>=0), per_person INTEGER NOT NULL CHECK(per_person>0), reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0), collected INTEGER NOT NULL DEFAULT 0 CHECK(collected>=0), CHECK(reserved+collected<=total));
  CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), kind TEXT NOT NULL CHECK(kind IN ('free','swap')), status TEXT NOT NULL CHECK(status IN ('pending','reserved','collected','cancelled','rejected')), nickname TEXT NOT NULL, contact TEXT NOT NULL, contact_key TEXT NOT NULL, note TEXT NOT NULL, code TEXT UNIQUE NOT NULL, token_hash TEXT UNIQUE NOT NULL, request_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reservation_items(reservation_id TEXT NOT NULL REFERENCES reservations(id), material_id TEXT NOT NULL REFERENCES materials(id), quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(reservation_id,material_id));
  CREATE TABLE IF NOT EXISTS exchange_applications(reservation_id TEXT PRIMARY KEY REFERENCES reservations(id), offer TEXT NOT NULL, image TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS uploads(filename TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS event_owner ON events(owner_id);
  CREATE INDEX IF NOT EXISTS reservation_event ON reservations(event_id);
  CREATE INDEX IF NOT EXISTS reservation_contact ON reservations(contact_key,event_id);
  CREATE INDEX IF NOT EXISTS item_material ON reservation_items(material_id);
  `);
  migrateSharedEvents(db, dir);
  migrateMaterialStudio(db, dir);
  migrateUnifiedAccount(db, dir);
  migrateDiscovery(db, dir);
  migratePracticalCatalog(db, dir);
  migratePrivateNotes(db, dir);
  return db;
}
function migratePrivateNotes(db, dir) {
  if (db.prepare("PRAGMA user_version").get().user_version >= 6) return;
  if (db.prepare("SELECT 1 FROM users LIMIT 1").get())
    db.prepare("VACUUM INTO ?").run(
      resolve(dir, `before-private-notes-${Date.now()}.sqlite`),
    );
  transaction(db, () => {
    for (const [table, column] of [
      ["reservations", "note_image"],
      ["uploads", "guest_hash"],
    ]) {
      if (
        !db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((c) => c.name === column)
      )
        db.exec(
          `ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`,
        );
    }
    db.exec("PRAGMA user_version=6");
  });
}
function migratePracticalCatalog(db, dir) {
  if (db.prepare("PRAGMA user_version").get().user_version >= 5) return;
  if (db.prepare("SELECT 1 FROM users LIMIT 1").get())
    db.prepare("VACUUM INTO ?").run(
      resolve(dir, `before-practical-catalog-${Date.now()}.sqlite`),
    );
  transaction(db, () => {
    if (db.prepare("PRAGMA user_version").get().user_version >= 5) return;
    db.exec(
      "UPDATE events SET kind='音乐节' WHERE kind='后摇'; UPDATE events SET kind='剧场' WHERE kind='音乐剧';",
    );
    updateDemoContent(db);
    db.exec("PRAGMA user_version=5");
  });
}
function migrateDiscovery(db, dir) {
  if (db.prepare("PRAGMA user_version").get().user_version >= 4) return;
  if (db.prepare("SELECT 1 FROM users LIMIT 1").get())
    db.prepare("VACUUM INTO ?").run(
      resolve(dir, `before-discovery-${Date.now()}.sqlite`),
    );
  transaction(db, () => {
    if (db.prepare("PRAGMA user_version").get().user_version >= 4) return;
    db.exec(`ALTER TABLE events ADD COLUMN kind TEXT NOT NULL DEFAULT '其他';
      ALTER TABLE events ADD COLUMN poster TEXT NOT NULL DEFAULT '';
      ALTER TABLE events ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE user_favorites(user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('material','event','creator')),target_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,kind,target_id));
      PRAGMA user_version=4;`);
  });
}
function migrateUnifiedAccount(db, dir) {
  if (db.prepare("PRAGMA user_version").get().user_version >= 3) return;
  if (db.prepare("SELECT 1 FROM users LIMIT 1").get())
    db.prepare("VACUUM INTO ?").run(
      resolve(dir, `before-unified-account-${Date.now()}.sqlite`),
    );
  transaction(db, () => {
    if (db.prepare("PRAGMA user_version").get().user_version >= 3) return;
    db.exec(`ALTER TABLE reservations ADD COLUMN recipient_id TEXT REFERENCES users(id);
      CREATE INDEX reservation_recipient ON reservations(recipient_id,created_at);
      CREATE TABLE personal_collections(creator_id TEXT PRIMARY KEY REFERENCES users(id),event_id TEXT UNIQUE NOT NULL REFERENCES events(id));
      PRAGMA user_version=3;`);
  });
}
function migrateMaterialStudio(db, dir) {
  if (db.prepare("PRAGMA user_version").get().user_version >= 2) return;
  if (db.prepare("SELECT 1 FROM materials LIMIT 1").get())
    db.prepare("VACUUM INTO ?").run(
      resolve(dir, `before-material-studio-${Date.now()}.sqlite`),
    );
  transaction(db, () => {
    if (db.prepare("PRAGMA user_version").get().user_version >= 2) return;
    db.exec(`ALTER TABLE materials ADD COLUMN category TEXT NOT NULL DEFAULT '其他';
      ALTER TABLE materials ADD COLUMN size TEXT NOT NULL DEFAULT '';
      ALTER TABLE materials ADD COLUMN medium TEXT NOT NULL DEFAULT '';
      ALTER TABLE materials ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
      ALTER TABLE materials ADD COLUMN deadline TEXT NOT NULL DEFAULT '';
      ALTER TABLE materials ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE materials ADD COLUMN published INTEGER NOT NULL DEFAULT 1;
      UPDATE materials SET category=CASE WHEN name LIKE '%贴纸%' THEN '贴纸' WHEN name LIKE '%徽章%' THEN '徽章' WHEN name LIKE '%明信片%' OR image LIKE '%postcard%' THEN '明信片' ELSE '其他' END;
      CREATE TABLE manual_handoffs(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id),creator_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('free','swap')),nickname TEXT NOT NULL DEFAULT '',contact TEXT NOT NULL DEFAULT '',location TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',request_key TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE manual_handoff_items(handoff_id TEXT NOT NULL REFERENCES manual_handoffs(id),material_id TEXT NOT NULL REFERENCES materials(id),quantity INTEGER NOT NULL CHECK(quantity>0),PRIMARY KEY(handoff_id,material_id));
      CREATE TABLE share_lists(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id),creator_id TEXT NOT NULL REFERENCES users(id),material_ids TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX handoff_owner ON manual_handoffs(event_id,creator_id);
      PRAGMA user_version=2;`);
  });
}
function migrateSharedEvents(db, dir) {
  if (db.prepare("PRAGMA user_version").get().user_version >= 1) return;
  // Keep a consistent database snapshot before migrating existing user data.
  if (db.prepare("SELECT COUNT(*) AS n FROM events").get().n > 0) {
    db.prepare("VACUUM INTO ?").run(
      resolve(dir, `before-shared-events-${Date.now()}.sqlite`),
    );
  }
  transaction(db, () => {
    if (db.prepare("PRAGMA user_version").get().user_version >= 1) return;
    db.exec(`
      ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE events ADD COLUMN city TEXT NOT NULL DEFAULT '';
      ALTER TABLE events ADD COLUMN venue TEXT NOT NULL DEFAULT '';
      ALTER TABLE events ADD COLUMN session TEXT NOT NULL DEFAULT '全天';
      ALTER TABLE events ADD COLUMN end_date TEXT NOT NULL DEFAULT '';
      ALTER TABLE events ADD COLUMN end_time TEXT NOT NULL DEFAULT '23:59';
      ALTER TABLE events ADD COLUMN identity_key TEXT;
      ALTER TABLE materials ADD COLUMN creator_id TEXT REFERENCES users(id);
      ALTER TABLE reservations ADD COLUMN creator_id TEXT REFERENCES users(id);
      CREATE TABLE event_creators(event_id TEXT NOT NULL REFERENCES events(id),creator_id TEXT NOT NULL REFERENCES users(id),instructions TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(event_id,creator_id));
      CREATE TABLE event_aliases(alias_id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id));
      INSERT INTO event_creators SELECT id,owner_id,instructions,published FROM events;
      UPDATE materials SET creator_id=(SELECT owner_id FROM events WHERE id=materials.event_id);
      UPDATE reservations SET creator_id=(SELECT owner_id FROM events WHERE id=reservations.event_id);
      UPDATE users SET is_admin=1 WHERE id=(SELECT id FROM users ORDER BY rowid LIMIT 1);
    `);
    const seen = new Map();
    for (const e of db.prepare("SELECT * FROM events ORDER BY rowid").all()) {
      const parts = e.location
        .split("·")
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = {
        ...e,
        city: parts.length > 1 ? parts[0] : "待补充",
        venue: parts.length > 1 ? parts.slice(1).join(" · ") : e.location,
        session: "全天",
        end_date: e.date,
      };
      const key = eventIdentity(updated),
        canonical = seen.get(key);
      if (canonical) {
        db.prepare(
          "INSERT OR IGNORE INTO event_creators SELECT ?,creator_id,instructions,published FROM event_creators WHERE event_id=?",
        ).run(canonical, e.id);
        db.prepare("DELETE FROM event_creators WHERE event_id=?").run(e.id);
        db.prepare("UPDATE materials SET event_id=? WHERE event_id=?").run(
          canonical,
          e.id,
        );
        db.prepare("UPDATE reservations SET event_id=? WHERE event_id=?").run(
          canonical,
          e.id,
        );
        db.prepare("INSERT INTO event_aliases VALUES(?,?)").run(
          e.id,
          canonical,
        );
        db.prepare("DELETE FROM events WHERE id=?").run(e.id);
      } else {
        seen.set(key, e.id);
        db.prepare(
          "UPDATE events SET city=?,venue=?,session=?,end_date=?,identity_key=?,published=1,instructions='' WHERE id=?",
        ).run(
          updated.city,
          updated.venue,
          updated.session,
          updated.end_date,
          key,
          e.id,
        );
      }
    }
    db.exec(`CREATE UNIQUE INDEX event_identity ON events(identity_key);
      CREATE INDEX material_creator ON materials(event_id,creator_id);
      CREATE INDEX reservation_creator ON reservations(event_id,creator_id);
      CREATE INDEX membership_creator ON event_creators(creator_id,event_id);
      PRAGMA user_version=1;`);
  });
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
