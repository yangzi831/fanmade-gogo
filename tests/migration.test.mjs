import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../server/db.mjs";
import { eventGroups, creatorListing } from "../server/events.mjs";
import { readReservation, transition } from "../server/rules.mjs";

test("legacy database migration preserves credentials, stock, private orders, unpublished listings and old links", () => {
  const dir = mkdtempSync(join(tmpdir(), "materials-migrate-"));
  let db;
  try {
    db = new DatabaseSync(join(dir, "materials.sqlite"));
    db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE,password TEXT,nickname TEXT,avatar TEXT DEFAULT '',bio TEXT DEFAULT '',demo INTEGER DEFAULT 0);
    CREATE TABLE events(id TEXT PRIMARY KEY,owner_id TEXT,title TEXT,date TEXT,location TEXT,instructions TEXT,theme TEXT DEFAULT 'sage',published INTEGER DEFAULT 1,demo INTEGER DEFAULT 0);
    CREATE TABLE materials(id TEXT PRIMARY KEY,event_id TEXT,name TEXT,description TEXT,image TEXT,mode TEXT,total INTEGER,per_person INTEGER,reserved INTEGER DEFAULT 0,collected INTEGER DEFAULT 0);
    CREATE TABLE reservations(id TEXT PRIMARY KEY,event_id TEXT,kind TEXT,status TEXT,nickname TEXT,contact TEXT,contact_key TEXT,note TEXT,code TEXT,token_hash TEXT,request_key TEXT,request_hash TEXT,created_at TEXT);
    INSERT INTO users(id,username,password,nickname) VALUES('a','legacy_a','preserved-password-hash','甲'),('b','legacy_b','other-password-hash','乙');
    INSERT INTO events(id,owner_id,title,date,location,instructions,published) VALUES('e1','a','同一场演出','2099-01-01','上海 · 大剧院','甲的领取点',1),('e2','b','同一场演出','2099-01-01','上海 · 大剧院','乙的领取点',0),('e3','a','另一场演出','2099-01-02','杭州 · 草坪','另一场领取点',1);
    INSERT INTO materials(id,event_id,name,description,image,mode,total,per_person,reserved,collected) VALUES('m1','e1','甲贴纸','','','free',10,3,0,0),('m2','e2','乙徽章','','','both',10,3,2,1);
    INSERT INTO reservations VALUES('r1','e2','free','reserved','旧领取者','private-contact','contact-hash','private-note','CODE123','token-hash','request-key','request-hash','2026-01-01');`);
    db.close();
    db = openDb(dir);
    db.prepare("INSERT INTO reservation_items VALUES(?,?,?)").run(
      "r1",
      "m2",
      2,
    );
    assert.equal(
      db.prepare("SELECT password FROM users WHERE id=?").get("a").password,
      "preserved-password-hash",
    );
    assert.equal(
      db.prepare("SELECT is_admin FROM users WHERE id=?").get("a").is_admin,
      1,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM events").get().n, 2);
    assert.equal(
      db
        .prepare("SELECT event_id FROM event_aliases WHERE alias_id=?")
        .get("e2").event_id,
      "e1",
    );
    assert.equal(eventGroups(db, "e2").event.id, "e1");
    assert.equal(eventGroups(db, "e2").groups.length, 1);
    assert.equal(creatorListing(db, "e2", "legacy_a").materials[0].id, "m1");
    assert.throws(() => creatorListing(db, "e1", "legacy_b"), /未公开/);
    const order = readReservation(db, "r1");
    assert.equal(order.creator_id, "b");
    assert.equal(order.event_id, "e1");
    assert.equal(order.event.instructions, "乙的领取点");
    assert.equal(order.contact, "private-contact");
    transition(db, "r1", "collect");
    transition(db, "r1", "collect");
    assert.deepEqual(
      {
        ...db
          .prepare(
            "SELECT reserved,collected,creator_id FROM materials WHERE id=?",
          )
          .get("m2"),
      },
      { reserved: 0, collected: 3, creator_id: "b" },
    );
    assert.equal(
      readdirSync(dir).filter((s) => s.startsWith("before-shared-events-"))
        .length,
      1,
    );
    db.close();
    db = openDb(dir);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM event_creators").get().n,
      3,
    );
    assert.equal(
      readdirSync(dir).filter((s) => s.startsWith("before-shared-events-"))
        .length,
      1,
    );
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
