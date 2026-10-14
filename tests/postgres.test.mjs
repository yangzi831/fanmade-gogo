import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openPostgres } from "../server/cloud/postgres.mjs";
import { createCatalogEvent, joinEvent } from "../server/events.mjs";
import { saveMaterials, manualHandoff } from "../server/materials.mjs";
import {
  createReservation,
  transition,
  readReservation,
} from "../server/rules.mjs";
import {
  catalogMaterials,
  catalogCreators,
  catalogEventPage,
} from "../server/catalog.mjs";
import { personalCollection } from "../server/accounts.mjs";

test("PostgreSQL-compatible engine runs actual schema, inventory, retries, permissions and private catalog projections", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gogo-postgres-")),
    db = openPostgres({ testDatabaseDir: join(dir, "pg") });
  try {
    db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    db.exec(
      readFileSync("supabase/migrations/202610140001_initial.sql", "utf8"),
    );
    db.prepare(
      "INSERT INTO users(id,username,password,nickname) VALUES(?,?,?,?)",
    ).run("a", "alice", "secret", "甲");
    db.prepare(
      "INSERT INTO users(id,username,password,nickname) VALUES(?,?,?,?)",
    ).run("b", "bob", "secret", "乙");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      "hash",
      "a",
      Date.now() + 7 * 86400000,
    );
    assert.ok(
      db.prepare("SELECT expires FROM sessions").get().expires > Date.now(),
    );
    const event = createCatalogEvent(
      db,
      {
        title: "剧场",
        city: "上海",
        venue: "A",
        date: "2099-01-01",
        end_date: "2099-01-01",
        end_time: "23:59",
        session: "晚场",
        theme: "sage",
        kind: "剧场",
      },
      "a",
      { join: true },
    ).id;
    joinEvent(db, event, "b");
    joinEvent(db, event, "b");
    const m = {
      id: randomUUID(),
      name: "徽章",
      description: "内容",
      image: "/assets/badge.svg",
      mode: "both",
      total: 4,
      per_person: 3,
      category: "徽章",
      size: "58mm",
      medium: "铁",
      instructions: "门口见",
      deadline: "",
      paused: false,
    };
    saveMaterials(db, event, "a", [m], true);
    const input = {
      eventId: event,
      creatorId: "a",
      kind: "free",
      nickname: "领取者",
      contact: "private-contact",
      note: "private-note",
      items: [{ materialId: m.id, quantity: 2 }],
      requestKey: randomUUID(),
      offer: "",
      offerImage: "",
    };
    const r = createReservation(db, input, "b");
    assert.equal(r.reservation.status, "reserved");
    assert.equal(
      createReservation(db, input, "b").reservation.id,
      r.reservation.id,
    );
    assert.throws(() => saveMaterials(db, event, "b", [m], true), {
      status: 404,
    });
    assert.throws(
      () =>
        createReservation(db, {
          ...input,
          requestKey: randomUUID(),
          contact: "another",
          items: [{ materialId: m.id, quantity: 3 }],
        }),
      { status: 409 },
    );
    manualHandoff(db, event, "a", {
      kind: "free",
      requestKey: randomUUID(),
      nickname: "",
      contact: "",
      location: "",
      note: "",
      items: [{ materialId: m.id, quantity: 1 }],
    });
    transition(db, r.reservation.id, "collect");
    transition(db, r.reservation.id, "collect");
    let row = db
      .prepare("SELECT reserved,collected FROM materials WHERE id=?")
      .get(m.id);
    assert.deepEqual(row, { reserved: 0, collected: 3 });
    assert.equal(
      readReservation(db, r.reservation.id).recipient.username,
      "bob",
    );
    const swap = createReservation(
      db,
      {
        ...input,
        requestKey: randomUUID(),
        contact: "swap-contact",
        kind: "swap",
        offer: "我的贴纸",
        items: [{ materialId: m.id, quantity: 1 }],
      },
      "b",
    );
    transition(db, swap.reservation.id, "accept");
    transition(db, swap.reservation.id, "cancel");
    assert.equal(
      db.prepare("SELECT reserved FROM materials WHERE id=?").get(m.id)
        .reserved,
      0,
    );
    assert.equal(
      catalogMaterials(db, { kind: "剧场" }).items[0].material.available,
      1,
    );
    assert.equal(catalogCreators(db).items.length, 1);
    assert.equal(
      catalogEventPage(db, { upcoming: "1" }).items[0].creator_count,
      1,
    );
    assert.equal(
      JSON.stringify(catalogMaterials(db)).includes("private-contact"),
      false,
    );
    const personal = personalCollection(db, "b");
    assert.equal(personalCollection(db, "b").id, personal.id);
    assert.equal(catalogEventPage(db).items.length, 1);
    db.prepare("INSERT OR IGNORE INTO user_favorites VALUES(?,?,?,?)").run(
      "b",
      "material",
      m.id,
      "2099",
    );
    assert.equal(
      db
        .prepare("INSERT OR IGNORE INTO user_favorites VALUES(?,?,?,?)")
        .run("b", "material", m.id, "2099").changes,
      0,
    );
    assert.equal(db.prepare("SELECT '?' AS literal").get().literal, "?");
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
