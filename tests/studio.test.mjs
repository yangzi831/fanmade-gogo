import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { openDb } from "../server/db.mjs";
const dir = mkdtempSync(join(tmpdir(), "material-studio-test-"));
let a, b, db, alice, bob, event;
async function start() {
  const child = fork(new URL("./http-worker.mjs", import.meta.url), {
    env: { ...process.env, TEST_DATA_DIR: dir },
    execArgv: ["--experimental-sqlite"],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const port = await new Promise((resolve, reject) => {
    child.once("message", (v) => resolve(v.port));
    child.once("error", reject);
  });
  return { child, url: "http://127.0.0.1:" + port };
}
async function req(path, { body, cookie = alice, method, server = a } = {}) {
  const r = await fetch(server.url + "/api" + path, {
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
const mat = (overrides = {}) => ({
  id: randomUUID(),
  name: "测试物料",
  description: "作品简介",
  image: "/assets/postcard.svg",
  mode: "both",
  total: 10,
  per_person: 3,
  category: "明信片",
  size: "10 × 15 cm",
  medium: "纸",
  instructions: "门口见",
  deadline: "",
  paused: false,
  ...overrides,
});
const reserve = (id, overrides = {}) => ({
  eventId: event,
  kind: "free",
  items: [{ materialId: id, quantity: 1 }],
  nickname: "领取者",
  contact: randomUUID(),
  requestKey: randomUUID(),
  ...overrides,
});
const batch = (items, publish = true, cookie = alice) =>
  req("/admin/events/" + event + "/materials/batch", {
    cookie,
    body: { items, publish },
  });
const handoff = (id, overrides = {}) => ({
  kind: "free",
  requestKey: randomUUID(),
  items: [{ materialId: id, quantity: 1 }],
  ...overrides,
});
const postHandoff = (body, options = {}) =>
  req("/admin/events/" + event + "/handoffs", { body, ...options });
before(async () => {
  a = await start();
  b = await start();
  db = openDb(dir);
  alice = (
    await req("/auth/register", {
      body: {
        username: "studio_a",
        password: "ExamplePass2026!",
        nickname: "甲",
      },
    })
  ).cookie;
  bob = (
    await req("/auth/register", {
      body: {
        username: "studio_b",
        password: "ExamplePass2026!",
        nickname: "乙",
      },
    })
  ).cookie;
  event = (
    await req("/admin/events", {
      body: {
        title: "工作台联调演出",
        city: "上海",
        venue: "剧院",
        date: "2099-10-01",
        session: "晚场",
      },
    })
  ).data.id;
  await req("/admin/events/" + event + "/join", { cookie: bob, body: {} });
});
after(async () => {
  for (const server of [a, b])
    if (server) {
      server.child.send("stop");
      await new Promise((resolve) => server.child.once("exit", resolve));
    }
  db?.close();
  rmSync(dir, { recursive: true, force: true });
});
test("batch drafts persist privately, publish atomically, and retries never create duplicate materials", async () => {
  const items = [mat({ name: "" }), mat({ name: "第二件作品" })];
  assert.equal((await batch(items, false)).status, 200);
  assert.equal(
    (await req("/events/" + event + "/creators/studio_a", { cookie: null }))
      .data.materials.length,
    0,
  );
  assert.equal(
    (await req("/discover", { cookie: null })).data.events.some(
      (e) => e.id === event,
    ),
    false,
  );
  assert.equal(
    (await req("/reservations", { cookie: null, body: reserve(items[1].id) }))
      .status,
    409,
  );
  assert.equal((await batch(items, true)).status, 400);
  assert.equal(
    db
      .prepare("SELECT SUM(published) n FROM materials WHERE event_id=?")
      .get(event).n,
    0,
  );
  items[0].name = "第一件作品";
  assert.equal((await batch(items)).status, 200);
  assert.equal((await batch(items)).status, 200);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM materials WHERE event_id=?").get(event)
      .n,
    2,
  );
  assert.equal(
    (await req("/events/" + event + "/creators/studio_a")).data.materials
      .length,
    2,
  );
  assert.equal((await batch([mat(), mat({ total: -1 })])).status, 400);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM materials WHERE event_id=?").get(event)
      .n,
    2,
  );
  assert.equal((await batch([items[0]], true, bob)).status, 404);
});
test("pause and deadline stop new requests on server; previous reservations, idempotent retries and pending swaps survive", async () => {
  const m = mat({ total: 5 });
  await batch([m]);
  const body = reserve(m.id);
  const old = await req("/reservations", { body });
  assert.equal(old.status, 201);
  const swap = await req("/reservations", {
    body: reserve(m.id, { kind: "swap", offer: "我带来的贴纸" }),
  });
  assert.equal(swap.status, 201);
  assert.equal(
    (
      await req("/admin/materials/" + m.id + "/state", {
        method: "PATCH",
        body: { paused: true },
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/reservations", { body: reserve(m.id) })).status,
    409,
  );
  assert.equal((await req("/reservations", { body })).status, 200);
  await batch([{ ...m, paused: true, deadline: "2000-01-01T12:00:00+08:00" }]);
  let publicM = (
    await req("/events/" + event + "/creators/studio_a")
  ).data.materials.find((v) => v.id === m.id);
  assert.equal(publicM.closed_reason, "deadline");
  assert.equal(publicM.available, 4);
  assert.equal(
    (
      await req("/reservations", {
        body: reserve(m.id, { kind: "swap", offer: "新互换" }),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req("/admin/reservations/" + swap.data.reservation.id + "/accept", {
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req("/admin/reservations/" + old.data.reservation.id + "/collect", {
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/lookup/" + swap.data.token + "/cancel", { body: {} })).status,
    200,
  );
  await batch([m]);
  assert.equal(
    (await req("/reservations", { body: reserve(m.id) })).status,
    201,
  );
  assert.equal(
    (
      await req("/admin/materials/" + m.id + "/state", {
        cookie: bob,
        method: "PATCH",
        body: { paused: true },
      })
    ).status,
    404,
  );
});
test("manual handoff uses only unreserved stock; retry plus reserved pickup never double deducts", async () => {
  const m = mat({ total: 3 });
  await batch([m]);
  const order = await req("/reservations", {
    body: reserve(m.id, { items: [{ materialId: m.id, quantity: 2 }] }),
  });
  assert.equal(order.status, 201);
  assert.equal(
    (
      await postHandoff(
        handoff(m.id, { items: [{ materialId: m.id, quantity: 2 }] }),
      )
    ).status,
    409,
  );
  const body = handoff(m.id, {
    contact: "手动私密联系人",
    location: "交接地点",
  });
  const manual = await postHandoff(body);
  assert.equal(manual.status, 201);
  assert.equal((await postHandoff(body, { server: b })).status, 200);
  assert.equal((await postHandoff({ ...body, note: "改变内容" })).status, 409);
  assert.equal(
    (
      await req(
        "/admin/reservations/" + order.data.reservation.id + "/collect",
        { body: {} },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        "/admin/reservations/" + order.data.reservation.id + "/collect",
        { body: {} },
      )
    ).status,
    200,
  );
  assert.deepEqual(
    {
      ...db
        .prepare("SELECT total,reserved,collected FROM materials WHERE id=?")
        .get(m.id),
    },
    { total: 3, reserved: 0, collected: 3 },
  );
  assert.equal(
    (await req("/admin/events/" + event + "/handoffs", { cookie: bob })).data
      .length,
    0,
  );
  assert.equal(
    JSON.stringify(
      (await req("/events/" + event, { cookie: null })).data,
    ).includes("手动私密联系人"),
    false,
  );
  assert.equal((await postHandoff(handoff(m.id), { cookie: bob })).status, 404);
});
test("manual swap is immediate delivery, allows optional personal fields and still checks mode and whole order", async () => {
  const one = mat({ mode: "swap", total: 2 }),
    zero = mat({ mode: "swap", total: 0 });
  await batch([one, zero]);
  assert.equal((await postHandoff(handoff(one.id))).status, 400);
  assert.equal(
    (
      await postHandoff(
        handoff(one.id, {
          kind: "swap",
          items: [
            { materialId: one.id, quantity: 1 },
            { materialId: zero.id, quantity: 1 },
          ],
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    db.prepare("SELECT collected FROM materials WHERE id=?").get(one.id)
      .collected,
    0,
  );
  await req("/admin/materials/" + one.id + "/state", {
    method: "PATCH",
    body: { paused: true },
  });
  assert.equal(
    (await postHandoff(handoff(one.id, { kind: "swap" }))).status,
    201,
  );
});
test("two processes racing manual and online delivery for final unit cannot overallocate", async () => {
  const m = mat({ total: 1 });
  await batch([m]);
  const responses = await Promise.all([
    postHandoff(handoff(m.id), { server: a }),
    req("/reservations", { server: b, body: reserve(m.id) }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const row = db
    .prepare("SELECT total,reserved,collected FROM materials WHERE id=?")
    .get(m.id);
  assert.equal(row.reserved + row.collected, 1);
});
test("whole, subset and single public links refer to original creator and live stock; drafts stay private", async () => {
  const items = [
    mat({ name: "分享一" }),
    mat({ name: "分享二" }),
    mat({ name: "不分享" }),
  ];
  await batch(items);
  const share = await req("/admin/events/" + event + "/shares", {
    body: { materialIds: items.slice(0, 2).map((m) => m.id) },
  });
  assert.equal(share.status, 201);
  assert.ok(/^\/s\/[a-f0-9]{32}$/.test(share.data.path));
  const path = "/shares/" + share.data.id;
  let list = (await req(path, { cookie: null })).data;
  assert.equal(list.event.id, event);
  assert.equal(list.creator.username, "studio_a");
  assert.deepEqual(
    list.materials.map((m) => m.id),
    items.slice(0, 2).map((m) => m.id),
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM materials WHERE id IN (?,?)")
      .get(items[0].id, items[1].id).n,
    2,
  );
  await postHandoff(handoff(items[0].id));
  list = (await req(path, { server: b, cookie: null })).data;
  assert.equal(list.materials[0].available, 9);
  await batch([{ ...items[0], total: 20 }]);
  assert.equal(
    (await req(path, { cookie: null })).data.materials[0].available,
    19,
  );
  const single =
    "/events/" + event + "/creators/studio_a/materials/" + items[0].id;
  assert.equal((await req(single, { cookie: null })).data.materials.length, 1);
  assert.equal(
    (
      await req("/admin/events/" + event + "/shares", {
        cookie: bob,
        body: { materialIds: [items[0].id] },
      })
    ).status,
    404,
  );
  await batch([items[1]], false);
  assert.equal((await req(path, { cookie: null })).data.materials.length, 1);
  assert.equal(
    (
      await req(
        "/events/" + event + "/creators/studio_a/materials/" + items[1].id,
        { cookie: null },
      )
    ).status,
    404,
  );
  await req("/admin/events/" + event, {
    method: "PUT",
    body: { published: false, instructions: "" },
  });
  assert.equal((await req(path, { cookie: null })).status, 404);
});
