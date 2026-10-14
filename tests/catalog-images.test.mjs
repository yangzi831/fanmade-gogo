import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { openDb } from "../server/db.mjs";
import { prepareImage } from "../server/images.mjs";
import {
  catalogMaterials,
  catalogCreators,
  catalogEventPage,
} from "../server/catalog.mjs";

test("server creates uncropped compressed images and thumbnails, strips metadata and rejects malformed images", async () => {
  const wide = await sharp({
    create: {
      width: 3200,
      height: 800,
      channels: 4,
      background: { r: 12, g: 120, b: 240, alpha: 0.5 },
    },
  })
    .withMetadata()
    .png()
    .toBuffer();
  const image = await prepareImage(wide);
  assert.equal(image.width, 1600);
  assert.equal(image.height, 400);
  const full = await sharp(image.full).metadata(),
    thumb = await sharp(image.thumb).metadata();
  assert.equal(full.format, "webp");
  assert.equal(full.exif, undefined);
  assert.equal(thumb.width, 480);
  assert.equal(thumb.height, 120);
  assert.ok(image.full.length < wide.length);
  const tall = await prepareImage(
    await sharp({
      create: { width: 600, height: 2400, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer(),
  );
  assert.equal(tall.width, 400);
  assert.equal(tall.height, 1600);
  await assert.rejects(prepareImage(Buffer.from("<svg><rect /></svg>")), {
    status: 400,
  });
  await assert.rejects(prepareImage(Buffer.from([255, 216, 255, 1, 2, 3])), {
    status: 400,
  });
});

test("database pagination filters before paging, preserves visibility and includes searchable empty events", () => {
  const dir = mkdtempSync(join(tmpdir(), "gogo-catalog-")),
    db = openDb(dir);
  try {
    db.exec(`INSERT INTO users(id,username,password,nickname) VALUES('a','alice','private-password','甲'),('b','bob','secret','乙');
      INSERT INTO events(id,owner_id,title,date,end_date,location,instructions,kind) VALUES('e','a','剧场演出','2099-01-01','2099-01-01','','','剧场'),('empty','a','空音乐节','2099-01-02','2099-01-02','','','音乐节'),('ended','a','已结束','2000-01-01','2000-01-01','','','音乐节');
      INSERT INTO event_creators(event_id,creator_id) VALUES('e','a'),('e','b');`);
    const insert = db.prepare(
      "INSERT INTO materials(id,event_id,creator_id,name,description,image,mode,total,per_person,category,published) VALUES(?,'e',?,?,'说明','','both',10,2,'贴纸',?)",
    );
    for (let i = 0; i < 55; i++) insert.run("m" + i, "a", "编号贴纸 " + i, 1);
    insert.run("private", "a", "私密草稿", 0);
    db.prepare(
      "UPDATE event_creators SET published=0 WHERE creator_id='b'",
    ).run();
    insert.run("hidden", "b", "隐藏清单", 1);
    let offset = 0,
      ids = [];
    do {
      const page = catalogMaterials(db, {
        kind: "剧场",
        category: "贴纸",
        mode: "free",
        limit: 24,
        offset,
      });
      assert.ok(page.items.length <= 24);
      assert.ok(
        page.items.every(
          (x) => x.event.kind === "剧场" && x.creator.username === "alice",
        ),
      );
      assert.ok(!JSON.stringify(page).includes("private-password"));
      ids.push(...page.items.map((x) => x.material.id));
      offset = page.nextOffset;
    } while (offset !== null);
    assert.equal(ids.length, 55);
    assert.equal(new Set(ids).size, 55);
    assert.equal(catalogMaterials(db, { q: "编号贴纸 54" }).items.length, 1);
    assert.equal(catalogMaterials(db, { q: "%" }).items.length, 0);
    assert.equal(catalogMaterials(db, { kind: "音乐节" }).items.length, 0);
    assert.throws(() => catalogMaterials(db, { limit: 999 }), { status: 400 });
    assert.deepEqual(
      catalogEventPage(db, { upcoming: "1" }).items.map((e) => e.id),
      ["e"],
    );
    assert.equal(
      catalogEventPage(db, { q: "空音乐节" }).items[0].material_count,
      0,
    );
    const creators = catalogCreators(db, { kind: "剧场" }).items;
    assert.equal(creators.length, 1);
    assert.equal(creators[0].previews.length, 3);
    assert.equal(catalogCreators(db, { kind: "音乐节" }).items.length, 0);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("v5 demo rename preserves user content, inventory, identifiers and only creates one backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "gogo-practical-"));
  let db = openDb(dir);
  try {
    db.exec(`INSERT INTO users(id,username,password,nickname,demo) VALUES('a','fixture','original-password','演示',1),('b','real','keep-password','本人',0);
      INSERT INTO events(id,owner_id,title,date,location,instructions,demo,kind) VALUES('e','a','在秋天，听一场日落','2099-01-01','','',1,'后摇'),('real','b','在秋天，听一场日落','2099-01-02','','',0,'音乐剧');
      INSERT INTO materials(id,event_id,creator_id,name,description,image,mode,total,per_person,reserved,collected) VALUES('m','e','a','把日落贴在身上','','','free',10,3,2,1),('real-m','real','b','把日落贴在身上','','','free',10,3,0,0);
      PRAGMA user_version=4;`);
    db.close();
    db = openDb(dir);
    assert.equal(
      db.prepare("SELECT title FROM events WHERE id='e'").get().title,
      "杭州西湖音乐节（演示）",
    );
    assert.equal(
      db.prepare("SELECT kind FROM events WHERE id='real'").get().kind,
      "剧场",
    );
    assert.equal(
      db.prepare("SELECT title FROM events WHERE id='real'").get().title,
      "在秋天，听一场日落",
    );
    assert.equal(
      db.prepare("SELECT name FROM materials WHERE id='real-m'").get().name,
      "把日落贴在身上",
    );
    assert.deepEqual(
      {
        ...db
          .prepare(
            "SELECT total,reserved,collected FROM materials WHERE id='m'",
          )
          .get(),
      },
      { total: 10, reserved: 2, collected: 1 },
    );
    assert.equal(
      db.prepare("SELECT password FROM users WHERE id='b'").get().password,
      "keep-password",
    );
    db.close();
    db = openDb(dir);
    assert.equal(
      readdirSync(dir).filter((x) => x.startsWith("before-practical-catalog-"))
        .length,
      1,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
