import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { fork } from "node:child_process";
import { openDb } from "../server/db.mjs";
import { installCanFeature } from "../server/feature-can.mjs";

const dir = mkdtempSync(join(tmpdir(), "gogo-accounts-"));
let child, origin, db, a, b, c, event, material, personal;
async function req(path, { body, cookie, method } = {}) {
  const r = await fetch(origin + "/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const booking = (overrides = {}) => ({
  eventId: event,
  kind: "free",
  nickname: "粉丝",
  contact: randomUUID(),
  note: "私密备注",
  items: [{ materialId: material, quantity: 1 }],
  requestKey: randomUUID(),
  ...overrides,
});
const fields = {
  name: "账号共享测试贴纸",
  description: "真的来自数据库",
  image: "/assets/postcard.svg",
  mode: "both",
  total: 30,
  per_person: 5,
  category: "贴纸",
};
before(async () => {
  child = fork(new URL("./http-worker.mjs", import.meta.url), {
    env: { ...process.env, TEST_DATA_DIR: dir },
    execArgv: ["--experimental-sqlite"],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  origin =
    "http://127.0.0.1:" +
    (await new Promise((resolve, reject) => {
      child.once("message", (v) => resolve(v.port));
      child.once("error", reject);
    }));
  db = openDb(dir);
  const register = async (username) =>
    req("/auth/register", {
      body: { username, password: "ExamplePass2026!", nickname: username },
    });
  a = await register("account_a");
  b = await register("account_b");
  c = await register("account_c");
  event = (
    await req("/admin/events", {
      cookie: a.cookie,
      body: {
        title: "共享演出",
        city: "上海",
        venue: "大剧院",
        date: "2099-01-01",
        session: "晚场",
      },
    })
  ).data.id;
  await req("/admin/events/" + event + "/join", { cookie: b.cookie, body: {} });
  material = (
    await req("/admin/events/" + event + "/materials", {
      cookie: a.cookie,
      body: fields,
    })
  ).data.id;
});
after(async () => {
  if (child) {
    const done = new Promise((r) => child.once("exit", r));
    child.kill();
    await done;
  }
  db?.close();
  rmSync(dir, { recursive: true, force: true });
});

test("one account can publish and receive; both views reference the same private record", async () => {
  const offered = (
    await req("/admin/events/" + event + "/materials", {
      cookie: b.cookie,
      body: { ...fields, name: "乙的徽章" },
    })
  ).data.id;
  const r = await req("/reservations", {
    cookie: b.cookie,
    body: booking({ recipient_id: c.data.id }),
  });
  assert.equal(r.status, 201);
  const id = r.data.reservation.id;
  const received = await req("/account/records", { cookie: b.cookie });
  assert.equal(received.data[0].id, id);
  assert.equal(received.data[0].recipient.id, b.data.id);
  assert.equal(
    (await req("/account/records?direction=sent", { cookie: a.cookie })).data[0]
      .id,
    id,
  );
  assert.equal(
    (await req("/account/records/" + id, { cookie: c.cookie })).status,
    404,
  );
  assert.equal(
    (
      await req("/account/records/" + id + "/cancel", {
        cookie: c.cookie,
        body: {},
      })
    ).status,
    404,
  );
  assert.equal((await req("/account/records")).status, 401);
  const other = await req("/reservations", {
    cookie: a.cookie,
    body: booking({ items: [{ materialId: offered, quantity: 1 }] }),
  });
  assert.equal(other.status, 201);
  assert.ok(
    (
      await req("/account/records?direction=sent", { cookie: b.cookie })
    ).data.some((v) => v.id === other.data.reservation.id),
  );
  await req("/admin/reservations/" + id + "/collect", {
    cookie: a.cookie,
    body: {},
  });
  assert.equal(
    (await req("/account/records/" + id, { cookie: b.cookie })).data.status,
    "collected",
  );
  assert.equal(
    (
      await req("/account/records?direction=sent", { cookie: a.cookie })
    ).data.find((v) => v.id === id).status,
    "collected",
  );
});

test("guest records require explicit secret claim; nickname/contact do not establish ownership", async () => {
  const body = booking({ nickname: "account_b" }),
    guest = await req("/reservations", { body });
  const id = guest.data.reservation.id;
  assert.equal(
    (await req("/account/records/" + id, { cookie: b.cookie })).status,
    404,
  );
  assert.equal(
    (
      await req("/account/claims", {
        cookie: b.cookie,
        body: { token: randomBytes(32).toString("hex") },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await req("/account/claims", {
        cookie: b.cookie,
        body: { token: guest.data.token },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req("/account/claims", {
        cookie: c.cookie,
        body: { token: guest.data.token },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req("/account/claims", {
        cookie: b.cookie,
        body: { token: guest.data.token },
      })
    ).status,
    200,
  );
  const retry = await req("/reservations", { cookie: c.cookie, body });
  assert.equal(retry.status, 200);
  assert.equal(
    db.prepare("SELECT recipient_id FROM reservations WHERE id=?").get(id)
      .recipient_id,
    b.data.id,
  );
  const before = db
    .prepare("SELECT reserved FROM materials WHERE id=?")
    .get(material).reserved;
  assert.equal(
    (
      await req("/account/records/" + id + "/cancel", {
        cookie: b.cookie,
        body: {},
      })
    ).status,
    200,
  );
  await req("/account/records/" + id + "/cancel", {
    cookie: b.cookie,
    body: {},
  });
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(material)
      .reserved,
    before - 1,
  );
});

test("no-activity materials have stable public links and isolated stock, without polluting shared events", async () => {
  const first = await req("/account/collection", {
    cookie: a.cookie,
    body: {},
  });
  personal = first.data.id;
  assert.equal(first.data.personal, true);
  assert.equal(
    (await req("/account/collection", { cookie: a.cookie, body: {} })).data.id,
    personal,
  );
  const item = await req("/admin/events/" + personal + "/materials", {
    cookie: a.cookie,
    body: { ...fields, name: "日常物料" },
  });
  assert.equal(item.status, 201);
  const m = item.data.id;
  const cards = (await req("/materials?q=" + encodeURIComponent("日常物料")))
    .data;
  assert.equal(cards[0].event, null);
  assert.equal(cards[0].detailPath, `/u/account_a/m/${m}`);
  assert.equal(cards[0].material.contact, undefined);
  assert.equal(cards[0].material.token_hash, undefined);
  assert.equal(JSON.stringify(cards).includes("私密备注"), false);
  const profile = (await req("/users/account_a", { cookie: b.cookie })).data;
  assert.ok(profile.materials.some((v) => v.material.id === m));
  assert.ok(!profile.events.some((v) => v.id === personal));
  assert.ok(!(await req("/events/search")).data.some((v) => v.id === personal));
  assert.equal((await req("/events/" + personal)).status, 404);
  assert.equal(
    (
      await req("/admin/events/" + personal + "/join", {
        cookie: b.cookie,
        body: {},
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await req("/admin/events/" + personal + "/materials", {
        cookie: b.cookie,
        body: fields,
      })
    ).status,
    404,
  );
  assert.equal(
    (await req("/users/account_a/collection")).data.materials[0].id,
    m,
  );
  const r = await req("/reservations", {
    cookie: b.cookie,
    body: booking({
      eventId: personal,
      items: [{ materialId: m, quantity: 1 }],
    }),
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.reservation.event.personal, true);
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(m).reserved,
    1,
  );
});

test("discovery honors material and creator visibility; requester login never changes public profile owner", async () => {
  const pub = await req("/materials?username=account_a", { cookie: b.cookie });
  assert.ok(pub.data.length > 0);
  assert.ok(pub.data.every((v) => v.creator.id === a.data.id));
  const draft = { ...fields, id: randomUUID(), name: "绝不公开草稿" };
  await req("/admin/events/" + event + "/materials/batch", {
    cookie: a.cookie,
    body: { publish: false, items: [draft] },
  });
  assert.equal(
    (await req("/materials?q=" + encodeURIComponent(draft.name))).data.length,
    0,
  );
  await req("/admin/events/" + personal, {
    cookie: a.cookie,
    method: "PUT",
    body: { published: false, instructions: "" },
  });
  assert.ok(
    !(await req("/materials?username=account_a")).data.some(
      (v) => v.scopeId === personal,
    ),
  );
  assert.equal((await req("/users/account_a/collection")).status, 404);
});

test("private exchange image allows both account participants and denies other users", async () => {
  const form = new FormData();
  form.append(
    "image",
    new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPQ2BL1H4QZYAwASzAI1cjohR0AAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      { type: "image/png" },
    ),
    "offer.png",
  );
  const uploaded = await fetch(origin + "/api/uploads", {
    method: "POST",
    headers: { Cookie: b.cookie },
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const { url } = await uploaded.json();
  const record = await req("/reservations", {
    cookie: b.cookie,
    body: booking({ kind: "swap", offer: "我的互换图片", offerImage: url }),
  });
  assert.equal(record.status, 201);
  for (const [cookie, status] of [
    [a.cookie, 200],
    [b.cookie, 200],
    [c.cookie, 404],
    [null, 404],
  ]) {
    assert.equal(
      (await fetch(origin + url, { headers: cookie ? { Cookie: cookie } : {} }))
        .status,
      status,
    );
    assert.equal(
      (
        await fetch(origin + url + "?size=thumb", {
          headers: cookie ? { Cookie: cookie } : {},
        })
      ).status,
      status,
    );
  }
});

test("favorites persist per account, retries are idempotent and unpublished material stays private", async () => {
  const item = (
    await req("/admin/events/" + event + "/materials", {
      cookie: a.cookie,
      body: { ...fields, name: "收藏权限测试" },
    })
  ).data.id;
  assert.equal(
    (
      await req(`/account/favorites/material/${item}`, {
        method: "PUT",
        body: {},
      })
    ).status,
    401,
  );
  const stock = {
    ...db
      .prepare("SELECT total,reserved,collected FROM materials WHERE id=?")
      .get(item),
  };
  await Promise.all(
    [1, 2].map(() =>
      req(`/account/favorites/material/${item}`, {
        cookie: b.cookie,
        method: "PUT",
        body: {},
      }),
    ),
  );
  await req(`/account/favorites/event/${event}`, {
    cookie: b.cookie,
    method: "PUT",
    body: {},
  });
  await req(`/account/favorites/creator/${a.data.id}`, {
    cookie: b.cookie,
    method: "PUT",
    body: {},
  });
  const saved = (await req("/account/favorites", { cookie: b.cookie })).data;
  assert.deepEqual(saved.materialIds, [item]);
  assert.equal(saved.materials[0].creator.id, a.data.id);
  assert.equal(saved.events[0].id, event);
  assert.equal(saved.creators[0].id, a.data.id);
  assert.equal(JSON.stringify(saved).includes("私密备注"), false);
  assert.equal(saved.creators[0].password, undefined);
  assert.equal(
    (await req("/account/favorites", { cookie: a.cookie })).data.materialIds
      .length,
    0,
  );
  await req(`/account/favorites/material/${item}`, {
    cookie: c.cookie,
    method: "DELETE",
    body: {},
  });
  assert.equal(
    (await req("/account/favorites", { cookie: b.cookie })).data.materialIds
      .length,
    1,
  );
  db.prepare("UPDATE materials SET published=0 WHERE id=?").run(item);
  assert.equal(
    (await req("/account/favorites", { cookie: b.cookie })).data.materials
      .length,
    0,
  );
  assert.equal(
    (
      await req(`/account/favorites/material/${item}`, {
        cookie: c.cookie,
        method: "PUT",
        body: {},
      })
    ).status,
    404,
  );
  await req(`/account/favorites/material/${item}`, {
    cookie: b.cookie,
    method: "DELETE",
    body: {},
  });
  assert.equal(
    (await req("/account/favorites", { cookie: b.cookie })).data.materialIds
      .length,
    0,
  );
  assert.deepEqual(
    {
      ...db
        .prepare("SELECT total,reserved,collected FROM materials WHERE id=?")
        .get(item),
    },
    stock,
  );
});

test("private note images stay between both participants and cannot be attached by another uploader", async () => {
  const form = new FormData();
  form.append(
    "image",
    new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPQ2BL1H4QZYAwASzAI1cjohR0AAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      { type: "image/png" },
    ),
    "note.png",
  );
  const uploaded = await fetch(origin + "/api/uploads", {
    method: "POST",
    headers: { Cookie: b.cookie },
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const { url } = await uploaded.json();
  const input = booking({ noteImage: url });
  const before = db
    .prepare("SELECT reserved FROM materials WHERE id=?")
    .get(material).reserved;
  assert.equal(
    (await req("/reservations", { cookie: c.cookie, body: input })).status,
    403,
  );
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(material)
      .reserved,
    before,
  );
  const record = await req("/reservations", { cookie: b.cookie, body: input });
  assert.equal(record.status, 201);
  assert.equal(record.data.reservation.note_image, url);
  for (const [cookie, status] of [
    [a.cookie, 200],
    [b.cookie, 200],
    [c.cookie, 404],
    [null, 404],
  ]) {
    assert.equal(
      (await fetch(origin + url, { headers: cookie ? { Cookie: cookie } : {} }))
        .status,
      status,
    );
    assert.equal(
      (
        await fetch(origin + url + "?size=thumb", {
          headers: cookie ? { Cookie: cookie } : {},
        })
      ).status,
      status,
    );
  }
  assert.equal(
    (await fetch(origin + url + "?access=" + record.data.token)).status,
    200,
  );
  assert.ok(
    !JSON.stringify((await req("/catalog/materials")).data).includes(url),
  );
  await req("/account/records/" + record.data.reservation.id + "/cancel", {
    cookie: b.cookie,
    body: {},
  });
});

test("featured CAN import is idempotent and creates a real searchable empty event without inventory copies", async () => {
  const count = db.prepare("SELECT count(*) n FROM materials").get().n;
  const id = installCanFeature(db, a.data.id);
  assert.equal(installCanFeature(db, a.data.id), id);
  const found = (
    await req("/events/search?q=" + encodeURIComponent("Can Festival PT.2"))
  ).data;
  assert.equal(found.length, 1);
  assert.equal(found[0].id, id);
  assert.equal(found[0].kind, "音乐节");
  assert.equal(found[0].material_count, 0);
  assert.equal(found[0].poster, "/assets/can-festival-2026-pt2.jpg");
  assert.equal(found[0].end_date, "2026-10-18");
  assert.equal(db.prepare("SELECT count(*) n FROM materials").get().n, count);
  assert.equal((await req("/events/" + id)).data.groups.length, 0);
  const created = await req("/admin/events", {
    cookie: a.cookie,
    body: {
      title: "同名不同场测试",
      city: "北京",
      venue: "A剧场",
      date: "2099-12-01",
      kind: "剧场",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(
    (await req("/events/" + created.data.id)).data.event.kind,
    "剧场",
  );
});

test("v2 upgrade backs up and preserves existing business rows, credentials and inventory", () => {
  const temp = mkdtempSync(join(tmpdir(), "gogo-v2-"));
  let conn;
  try {
    conn = openDb(temp);
    conn
      .prepare(
        "INSERT INTO users(id,username,password,nickname) VALUES('u','old_user','original-hash','旧用户')",
      )
      .run();
    conn.exec(`INSERT INTO events(id,owner_id,title,date,location,instructions) VALUES('e','u','原活动','2099-01-01','上海','原说明');
      INSERT INTO event_creators(event_id,creator_id) VALUES('e','u');
      INSERT INTO materials(id,event_id,creator_id,name,description,image,mode,total,per_person,reserved,collected) VALUES('m','e','u','旧物料','','','free',10,3,2,1);
      INSERT INTO reservations(id,event_id,creator_id,kind,status,nickname,contact,contact_key,note,code,token_hash,request_key,request_hash,created_at) VALUES('r','e','u','free','reserved','旧领取人','private','key','旧备注','CODE','hash','request','fingerprint','2026-01-01');
      INSERT INTO reservation_items VALUES('r','m',2);`);
    conn.exec(
      "DROP TABLE user_favorites; ALTER TABLE events DROP COLUMN kind; ALTER TABLE events DROP COLUMN poster; ALTER TABLE events DROP COLUMN featured; DROP INDEX reservation_recipient; DROP TABLE personal_collections; ALTER TABLE reservations DROP COLUMN recipient_id; PRAGMA user_version=2;",
    );
    conn.close();
    conn = openDb(temp);
    assert.equal(conn.prepare("PRAGMA user_version").get().user_version, 6);
    assert.equal(
      conn.prepare("SELECT password FROM users").get().password,
      "original-hash",
    );
    assert.deepEqual(
      {
        ...conn
          .prepare(
            "SELECT total,reserved,collected FROM materials WHERE id='m'",
          )
          .get(),
      },
      { total: 10, reserved: 2, collected: 1 },
    );
    assert.equal(
      conn.prepare("SELECT note FROM reservations WHERE id='r'").get().note,
      "旧备注",
    );
    assert.equal(
      conn.prepare("SELECT recipient_id FROM reservations WHERE id='r'").get()
        .recipient_id,
      null,
    );
    assert.equal(
      conn
        .prepare(
          "SELECT quantity FROM reservation_items WHERE reservation_id='r'",
        )
        .get().quantity,
      2,
    );
    assert.equal(
      conn.prepare("SELECT count(*) n FROM personal_collections").get().n,
      0,
    );
    assert.equal(
      readdirSync(temp).filter((v) => v.startsWith("before-unified-account-"))
        .length,
      1,
    );
    conn.close();
    conn = openDb(temp);
    assert.equal(
      readdirSync(temp).filter((v) => v.startsWith("before-unified-account-"))
        .length,
      1,
    );
  } finally {
    conn?.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
