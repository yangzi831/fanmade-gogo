import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { openDb } from "../server/db.mjs";
const dir = mkdtempSync(join(tmpdir(), "little-materials-test-"));
let a, b, db;
let alice, bob, ea, eb, m1, m2, swap;
async function start() {
  const child = fork(new URL("./http-worker.mjs", import.meta.url), {
    env: { ...process.env, TEST_DATA_DIR: dir },
    execArgv: ["--experimental-sqlite"],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const port = await new Promise((resolve, reject) => {
    child.once("message", (d) => resolve(d.port));
    child.once("error", reject);
    child.once("exit", () => reject(new Error("Test server stopped")));
  });
  return { child, url: "http://127.0.0.1:" + port };
}
async function req(
  path,
  { body, cookie, method, server = a, headers = {} } = {},
) {
  const r = await fetch(server.url + "/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const eventBody = {
  title: "测试活动",
  date: "2026-11-07",
  location: "测试现场",
  city: "测试城市",
  venue: "测试场馆",
  session: "全天",
  acknowledgeDuplicates: true,
  instructions: "凭码领取",
  published: true,
};
async function material(event, cookie, overrides = {}) {
  const r = await req("/admin/events/" + event + "/materials", {
    cookie,
    body: {
      name: "测试贴纸",
      description: "仅测试",
      image: "/assets/sunset.svg",
      mode: "both",
      total: 10,
      per_person: 3,
      ...overrides,
    },
  });
  assert.equal(r.status, 201);
  return r.data.id;
}
const booking = (eventId, items, overrides = {}) => ({
  eventId,
  kind: "free",
  items: items.map(([materialId, quantity]) => ({ materialId, quantity })),
  nickname: "来领取的人",
  contact: randomUUID() + "@example.com",
  note: "私密备注",
  requestKey: randomUUID(),
  ...overrides,
});

before(async () => {
  a = await start();
  b = await start();
  db = openDb(dir);
  alice = (
    await req("/auth/register", {
      body: {
        username: "alice",
        password: "ExamplePass2026!",
        nickname: "制作人甲",
      },
    })
  ).cookie;
  bob = (
    await req("/auth/register", {
      body: {
        username: "bob",
        password: "ExamplePass2026!",
        nickname: "制作人乙",
      },
    })
  ).cookie;
  ea = (await req("/admin/events", { cookie: alice, body: eventBody })).data.id;
  eb = (
    await req("/admin/events", {
      cookie: bob,
      body: { ...eventBody, title: "乙的独立活动" },
    })
  ).data.id;
  m1 = await material(ea, alice);
  m2 = await material(ea, alice, { total: 0, name: "没有余量" });
  swap = await material(ea, alice, {
    mode: "swap",
    total: 2,
    name: "仅互换徽章",
  });
});
after(async () => {
  for (const s of [a, b])
    if (s) {
      s.child.send("stop");
      await new Promise((resolve) => s.child.once("exit", resolve));
    }
  db?.close();
  rmSync(dir, { recursive: true, force: true });
});
test("public pages are anonymous, creator-scoped, and omit private data", async () => {
  const publicA = await req("/users/alice", { cookie: bob });
  assert.equal(publicA.status, 200);
  assert.equal(publicA.data.creator.username, "alice");
  assert.equal(publicA.data.events.length, 1);
  assert.equal(publicA.data.events[0].id, ea);
  assert.equal(publicA.data.creator.password, undefined);
  const events = await req("/admin/events", { cookie: bob });
  assert.deepEqual(
    events.data.map((e) => e.id),
    [eb],
  );
  const event = await req("/events/" + ea);
  assert.equal(event.status, 200);
  assert.equal(JSON.stringify(event.data).includes("contact"), false);
  assert.equal(
    (await req("/admin/events/" + ea + "/reservations")).status,
    401,
  );
});
test("ownership enforced for events, materials, private lists and publication", async () => {
  for (const path of [
    "/admin/events/" + ea + "/reservations",
    "/admin/events/" + ea + "/materials",
  ])
    assert.equal((await req(path, { cookie: bob })).status, 404);
  assert.equal(
    (
      await req("/admin/events/" + ea, {
        cookie: bob,
        body: eventBody,
        method: "PUT",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await req("/admin/materials/" + m1, {
        cookie: bob,
        method: "PUT",
        body: {
          name: "偷改",
          description: "",
          image: "",
          total: 500,
          mode: "both",
          per_person: 1,
        },
      })
    ).status,
    404,
  );
  const cross = await req("/reservations", { body: booking(eb, [[m1, 1]]) });
  assert.equal(cross.status, 400);
});
test("shared catalog: empty search → join → publish → automatic homepage, with isolated owners", async () => {
  const body = {
    ...eventBody,
    title: "全站共享音乐会",
    city: "杭州",
    venue: "共享草坪",
    date: "2099-11-07",
    session: "18:30",
  };
  const created = await req("/admin/catalog", { cookie: alice, body });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(
    (
      await req("/admin/catalog", {
        cookie: bob,
        body: { ...body, title: "越权添加" },
      })
    ).status,
    403,
  );
  let found = (
    await req(
      "/events/search?q=" + encodeURIComponent("全站共享音乐会 杭州 18:30"),
    )
  ).data;
  assert.equal(found.length, 1);
  assert.equal(found[0].material_count, 0);
  assert.equal(
    (await req("/discover")).data.events.some((e) => e.id === id),
    false,
  );
  assert.equal(
    (await req("/admin/events", { cookie: alice })).data.some(
      (e) => e.id === id,
    ),
    false,
  );
  for (const cookie of [alice, bob]) {
    assert.equal(
      (await req("/admin/events/" + id + "/join", { cookie, body: {} })).status,
      200,
    );
    assert.equal(
      (await req("/admin/events/" + id + "/join", { cookie, body: {} })).status,
      200,
    );
  }
  const am = await material(id, alice, { name: "甲的共享贴纸" }),
    bm = await material(id, bob, { name: "乙的共享徽章" });
  const page = (await req("/events/" + id)).data;
  assert.equal(page.groups.length, 2);
  assert.deepEqual(
    page.groups.flatMap((g) => g.materials.map((m) => m.id)).sort(),
    [am, bm].sort(),
  );
  const home = (await req("/discover")).data.events.filter((e) => e.id === id);
  assert.equal(home.length, 1);
  assert.equal(home[0].creator_count, 2);
  assert.equal(home[0].material_count, 2);
  for (const [name, cookie, mine, other] of [
    ["alice", alice, am, bm],
    ["bob", bob, bm, am],
  ]) {
    const list = (await req("/events/" + id + "/creators/" + name)).data;
    assert.deepEqual(
      list.materials.map((m) => m.id),
      [mine],
    );
    assert.deepEqual(
      (await req("/admin/events/" + id + "/materials", { cookie })).data.map(
        (m) => m.id,
      ),
      [mine],
    );
    assert.equal(
      (
        await req("/admin/materials/" + other, {
          cookie,
          method: "PUT",
          body: {
            name: "越权",
            description: "",
            image: "",
            mode: "both",
            total: 20,
            per_person: 3,
          },
        })
      ).status,
      404,
    );
    assert.equal(
      (await req("/admin/catalog/" + id, { cookie: bob, method: "PUT", body }))
        .status,
      403,
    );
  }
  const beforeCount = db.prepare("SELECT COUNT(*) n FROM reservations").get().n;
  assert.equal(
    (
      await req("/reservations", {
        body: booking(id, [
          [am, 1],
          [bm, 1],
        ]),
      })
    ).status,
    400,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM reservations").get().n,
    beforeCount,
  );
  assert.equal(
    db.prepare("SELECT SUM(reserved) n FROM materials WHERE event_id=?").get(id)
      .n,
    0,
  );
  const order = await req("/reservations", { body: booking(id, [[bm, 1]]) });
  assert.equal(order.status, 201);
  assert.equal(
    (await req("/admin/events/" + id + "/reservations", { cookie: alice })).data
      .length,
    0,
  );
  assert.equal(
    (await req("/admin/events/" + id + "/reservations", { cookie: bob })).data
      .length,
    1,
  );
  assert.equal(
    (
      await req(
        "/admin/reservations/" + order.data.reservation.id + "/collect",
        { cookie: alice, body: {} },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await req(
        "/admin/reservations/" + order.data.reservation.id + "/collect",
        { cookie: bob, body: {} },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req("/admin/events/" + id, {
        cookie: alice,
        method: "PUT",
        body: { published: false, instructions: "甲的私有领取说明" },
      })
    ).status,
    200,
  );
  assert.equal((await req("/events/" + id)).data.groups.length, 1);
  assert.equal(
    (await req("/discover")).data.events.find((e) => e.id === id).creator_count,
    1,
  );
  assert.equal((await req("/events/" + id + "/creators/alice")).status, 404);
  assert.equal(
    (await req("/reservations", { body: booking(id, [[am, 1]]) })).status,
    404,
  );
  assert.equal(
    (
      await req("/admin/events/" + id, {
        cookie: bob,
        method: "PUT",
        body: { published: false, instructions: "乙的说明" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/discover")).data.events.some((e) => e.id === id),
    false,
  );
  assert.equal(
    (await req("/events/search?q=" + encodeURIComponent("全站共享音乐会")))
      .data[0].material_count,
    0,
  );
});

test("catalog identity includes city, venue, date and session; fuzzy confirmation and concurrent exact dedup", async () => {
  const body = {
    ...eventBody,
    title: "唯一场次演出",
    city: "上海",
    venue: "大剧院",
    session: "19:30",
    acknowledgeDuplicates: false,
  };
  assert.equal((await req("/admin/events", { cookie: bob, body })).status, 201);
  const normalized = {
    ...body,
    title: " 唯一场次 演出 ",
    city: " 上 海 ",
    acknowledgeDuplicates: true,
  };
  const matches = await req("/events/duplicates", {
    cookie: bob,
    body: normalized,
  });
  assert.equal(
    matches.data.some((e) => e.exact),
    true,
  );
  assert.equal(
    (await req("/admin/events", { cookie: bob, body: normalized })).status,
    409,
  );
  for (const change of [
    { city: "苏州" },
    { venue: "小剧场" },
    { date: "2026-11-08" },
    { session: "14:00" },
  ]) {
    const candidate = { ...body, ...change };
    const check = await req("/events/duplicates", {
      cookie: bob,
      body: candidate,
    });
    assert.equal(
      check.data.some((e) => e.exact),
      false,
    );
    assert.ok(check.data.length > 0);
    assert.equal(
      (await req("/admin/events", { cookie: bob, body: candidate })).status,
      409,
    );
    assert.equal(
      (
        await req("/admin/events", {
          cookie: bob,
          body: { ...candidate, acknowledgeDuplicates: true },
        })
      ).status,
      201,
    );
  }
  const concurrent = {
    ...body,
    title: "并发创建的共享活动",
    venue: "另一场馆",
  };
  const results = await Promise.all([
    req("/admin/events", { cookie: alice, body: concurrent, server: a }),
    req("/admin/events", { cookie: bob, body: concurrent, server: b }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM events WHERE title=?")
      .get(concurrent.title).n,
    1,
  );
});

test("end time and metadata edits update discovery automatically without deleting searchable activities", async () => {
  const body = { ...eventBody, title: "已经结束的现场", date: "2000-01-01" };
  const id = (await req("/admin/events", { cookie: alice, body })).data.id;
  await material(id, alice);
  assert.equal(
    (await req("/discover")).data.events.some((e) => e.id === id),
    false,
  );
  const result = (
    await req("/events/search?q=" + encodeURIComponent(body.title))
  ).data;
  assert.equal(result[0].ended, true);
  assert.equal(result[0].material_count, 1);
  const edited = { ...body, title: "未来的同一现场", date: "2099-01-01" };
  assert.equal(
    (
      await req("/admin/catalog/" + id, {
        cookie: alice,
        method: "PUT",
        body: edited,
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/discover")).data.events.find((e) => e.id === id).title,
    edited.title,
  );
  assert.equal(
    (await req("/events/search?q=" + encodeURIComponent(body.title))).data
      .length,
    0,
  );
});
test("a multi-material reservation is atomic if one item is unavailable", async () => {
  const before = db
    .prepare("SELECT reserved FROM materials WHERE id=?")
    .get(m1).reserved;
  const r = await req("/reservations", {
    body: booking(ea, [
      [m1, 1],
      [m2, 1],
    ]),
  });
  assert.equal(r.status, 409);
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(m1).reserved,
    before,
  );
});
test("duplicate concurrent submission is idempotent and changed payload is rejected", async () => {
  const payload = booking(ea, [[m1, 1]]);
  const responses = await Promise.all([
    req("/reservations", { body: payload }),
    req("/reservations", { body: payload, server: b }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  assert.equal(responses[0].data.token, responses[1].data.token);
  assert.equal(
    responses[0].data.reservation.id,
    responses[1].data.reservation.id,
  );
  assert.equal(
    (await req("/reservations", { body: { ...payload, note: "改过" } })).status,
    409,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM reservations WHERE request_key=?")
      .get(payload.requestKey).n,
    1,
  );
});
test("two independent server processes race for the last unit without overselling", async () => {
  const id = await material(ea, alice, { total: 1, per_person: 1 });
  const responses = await Promise.all([
    req("/reservations", { body: booking(ea, [[id, 1]]) }),
    req("/reservations", { body: booking(ea, [[id, 1]]), server: b }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(id).reserved,
    1,
  );
});
test("cancellation releases all reservations once; collection transfers stock once", async () => {
  const id = await material(ea, alice, { total: 4 });
  const first = await req("/reservations", { body: booking(ea, [[id, 2]]) });
  assert.equal(first.status, 201);
  const { reservation: r, token } = first.data;
  assert.equal(
    (
      await req("/admin/reservations/" + r.id + "/collect", {
        cookie: bob,
        body: {},
      })
    ).status,
    404,
  );
  assert.equal((await req("/lookup/" + r.code)).status, 404);
  assert.equal(
    (await req("/lookup/" + randomUUID().replaceAll("-", "").repeat(2))).status,
    404,
  );
  assert.equal(
    (await req("/lookup/" + token + "/cancel", { body: {} })).status,
    200,
  );
  assert.equal(
    (await req("/lookup/" + token + "/cancel", { body: {} })).status,
    200,
  );
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(id).reserved,
    0,
  );
  const next = await req("/reservations", { body: booking(ea, [[id, 2]]) });
  for (let n = 0; n < 2; n++)
    assert.equal(
      (
        await req(
          "/admin/reservations/" + next.data.reservation.id + "/collect",
          { cookie: alice, body: {} },
        )
      ).status,
      200,
    );
  assert.deepEqual(
    {
      ...db
        .prepare("SELECT reserved,collected FROM materials WHERE id=?")
        .get(id),
    },
    { reserved: 0, collected: 2 },
  );
  assert.equal(
    (await req("/lookup/" + next.data.token + "/cancel", { body: {} })).status,
    409,
  );
});
test("swaps reserve only on acceptance; acceptance checks all quantities atomically", async () => {
  const id = await material(ea, alice, { total: 1, mode: "both" });
  const offered = await req("/reservations", {
    body: booking(
      ea,
      [
        [id, 1],
        [swap, 1],
      ],
      { kind: "swap", offer: "手作明信片" },
    ),
  });
  assert.equal(offered.status, 201);
  assert.equal(offered.data.reservation.status, "pending");
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(id).reserved,
    0,
  );
  const taken = await req("/reservations", { body: booking(ea, [[id, 1]]) });
  assert.equal(taken.status, 201);
  assert.equal(
    (
      await req(
        "/admin/reservations/" + offered.data.reservation.id + "/accept",
        { body: {}, cookie: alice },
      )
    ).status,
    409,
  );
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(swap).reserved,
    0,
  );
  await req("/lookup/" + taken.data.token + "/cancel", { body: {} });
  assert.equal(
    (
      await req(
        "/admin/reservations/" + offered.data.reservation.id + "/accept",
        { body: {}, cookie: alice },
      )
    ).status,
    200,
  );
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(swap).reserved,
    1,
  );
  await req("/lookup/" + offered.data.token + "/cancel", { body: {} });
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(swap).reserved,
    0,
  );
  const rejected = await req("/reservations", {
    body: booking(ea, [[swap, 1]], { kind: "swap", offer: "自制贴纸" }),
  });
  assert.equal(
    (
      await req(
        "/admin/reservations/" + rejected.data.reservation.id + "/reject",
        { cookie: alice, body: {} },
      )
    ).status,
    200,
  );
  assert.equal(
    db.prepare("SELECT reserved FROM materials WHERE id=?").get(swap).reserved,
    0,
  );
});
test("limits count normalized contact cumulatively, including pending swaps", async () => {
  const id = await material(ea, alice, { total: 10, per_person: 2 });
  assert.equal(
    (
      await req("/reservations", {
        body: booking(ea, [[id, 1]], { contact: " TEST@example.com " }),
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await req("/reservations", {
        body: booking(ea, [[id, 2]], { contact: "test@example.com" }),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req("/reservations", {
        body: booking(ea, [
          [id, 1],
          [id, 1],
        ]),
      })
    ).status,
    400,
  );
  assert.equal(
    (await req("/reservations", { body: booking(ea, [[id, -1]]) })).status,
    400,
  );
  assert.equal(
    (await req("/reservations", { body: booking(ea, [[swap, 1]]) })).status,
    400,
  );
});
test("editing cannot reduce stock below allocated quantities; drafts cannot be reserved", async () => {
  const id = await material(eb, bob, { total: 2 });
  const result = await req("/reservations", { body: booking(eb, [[id, 2]]) });
  assert.equal(result.status, 201);
  assert.equal(
    (
      await req("/admin/materials/" + id, {
        cookie: bob,
        method: "PUT",
        body: {
          name: "原物料",
          description: "",
          image: "",
          mode: "both",
          total: 1,
          per_person: 2,
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req("/admin/events/" + eb, {
        cookie: bob,
        method: "PUT",
        body: { ...eventBody, published: false },
      })
    ).status,
    200,
  );
  assert.equal((await req("/events/" + eb)).status, 200);
  assert.equal((await req("/events/" + eb + "/creators/bob")).status, 404);
  assert.equal(
    (await req("/reservations", { body: booking(eb, [[id, 1]]) })).status,
    404,
  );
  assert.equal((await req("/lookup/" + result.data.token)).status, 200);
});
test("upload validation and guest exchange attachment privacy", async () => {
  await req("/admin/events/" + ea + "/join", { cookie: bob, body: {} });
  const form = new FormData();
  form.append(
    "image",
    new Blob(['<svg onload="alert(1)"></svg>'], { type: "image/svg+xml" }),
    "evil.svg",
  );
  let res = await fetch(a.url + "/api/uploads", { method: "POST", body: form });
  assert.equal(res.status, 400);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPQ2BL1H4QZYAwASzAI1cjohR0AAAAASUVORK5CYII=",
    "base64",
  );
  const image = new FormData();
  image.append("image", new Blob([png], { type: "image/png" }), "test.png");
  res = await fetch(a.url + "/api/uploads", { method: "POST", body: image });
  assert.equal(res.status, 201);
  const { url } = await res.json();
  const guestCookie = res.headers.get("set-cookie")?.split(";")[0];
  assert.equal((await fetch(a.url + url)).status, 404);
  const booked = await req("/reservations", {
    cookie: guestCookie,
    body: booking(ea, [[swap, 1]], {
      kind: "swap",
      offer: "仅双方可见",
      offerImage: url,
    }),
  });
  assert.equal(booked.status, 201);
  assert.equal((await fetch(a.url + url)).status, 404);
  assert.equal(
    (await fetch(a.url + url, { headers: { Cookie: bob } })).status,
    404,
  );
  assert.equal(
    (await fetch(a.url + url, { headers: { Cookie: alice } })).status,
    200,
  );
  assert.equal(
    (await fetch(a.url + url + "?access=" + booked.data.token)).status,
    200,
  );
});
test("cross-origin writes are denied and logout invalidates server session", async () => {
  assert.equal(
    (
      await req("/reservations", {
        body: {},
        headers: { Origin: "https://attacker.example" },
      })
    ).status,
    403,
  );
  await req("/auth/logout", { cookie: bob, body: {} });
  assert.equal((await req("/admin/events", { cookie: bob })).status, 401);
  const login = await req("/auth/login", {
    body: { username: "bob", password: "ExamplePass2026!" },
  });
  assert.equal(login.status, 200);
  assert.equal(
    (await req("/auth/login", { body: { username: "bob", password: "wrong" } }))
      .status,
    401,
  );
  assert.equal(
    (
      await req("/auth/login", {
        body: { username: "nobody", password: "wrong" },
      })
    ).status,
    401,
  );
});
