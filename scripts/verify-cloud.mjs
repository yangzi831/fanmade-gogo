// Writes labelled QA data to the real project. Credentials stay in ignored output/.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const children = [],
  results = [],
  suffix = Date.now().toString(36);
const accounts = ["publisher", "recipient"].map((role) => ({
  username: "qa_" + role + "_" + suffix,
  password: randomBytes(20).toString("base64url"),
  nickname: role === "publisher" ? "验收贴纸盒" : "验收领取人",
}));
async function start() {
  const child = fork(new URL("../server/cloud/index.mjs", import.meta.url), {
    env: { ...process.env, CLOUD_PORT: "0" },
    execArgv: [],
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  children.push(child);
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("云端测试服务启动超时，请检查配置和网络")),
      35000,
    );
    child.once("message", (data) => {
      clearTimeout(timeout);
      resolve(data.port);
    });
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("测试服务无法启动"));
    });
    child.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error("云端连接或建表未完成，服务启动失败"));
    });
  });
  return "http://127.0.0.1:" + port;
}
async function stop() {
  await Promise.all(
    children.splice(0).map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) return resolve();
          child.once("exit", resolve);
          child.kill();
        }),
    ),
  );
}
async function req(
  origin,
  path,
  { cookie, body, method, expected = 200 } = {},
) {
  const response = await fetch(origin + "/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    path +
      " 返回 " +
      response.status +
      "，期望 " +
      expected +
      "：" +
      (data.error || ""),
  );
  return { data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
async function upload(origin, cookie, color) {
  const bytes = await sharp({
    create: { width: 3200, height: 800, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append(
    "image",
    new Blob([bytes], { type: "image/png" }),
    "QA-image.png",
  );
  const response = await fetch(origin + "/api/uploads", {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  assert.equal(response.status, 201, "真实 Storage 上传失败");
  const data = await response.json();
  assert.equal(data.width, 1600);
  assert.equal(data.height, 400);
  return data.url;
}
try {
  if (
    ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"].some(
      (key) => !process.env[key] || /YOUR_|PROJECT_REF/.test(process.env[key]),
    )
  )
    throw new Error("请先填写 .env.cloud 并执行 npm run cloud:init");
  const origins = await Promise.all([start(), start()]);
  const a = await req(origins[0], "/auth/register", {
    body: accounts[0],
    expected: 201,
  });
  const b = await req(origins[1], "/auth/register", {
    body: accounts[1],
    expected: 201,
  });
  mkdirSync("output", { recursive: true });
  writeFileSync(
    "output/cloud-test-accounts.json",
    JSON.stringify({ createdAt: new Date().toISOString(), accounts }, null, 2),
  );
  a.cookie = (
    await req(origins[0], "/auth/login", { body: accounts[0] })
  ).cookie;
  b.cookie = (
    await req(origins[1], "/auth/login", { body: accounts[1] })
  ).cookie;
  const event = (
    await req(origins[0], "/admin/events", {
      cookie: a.cookie,
      body: {
        title: "云端验收活动（测试）" + suffix,
        city: "测试城市",
        venue: "测试场馆",
        date: "2099-01-01",
        session: "测试场次",
        kind: "活动",
        instructions: "仅用于云端验收",
      },
      expected: 201,
    })
  ).data.id;
  const eventPath = "/admin/events/" + event;
  await req(origins[1], eventPath + "/join", { cookie: b.cookie, body: {} });
  const publicImage = await upload(origins[0], a.cookie, "#2e806f");
  const privateImage = await upload(origins[1], b.cookie, "#f09988");
  const fields = {
    name: "云端验收贴纸（测试）",
    description: "多人库存验收",
    image: publicImage,
    mode: "both",
    total: 4,
    per_person: 4,
    category: "贴纸",
  };
  const material = (
    await req(origins[0], eventPath + "/materials", {
      cookie: a.cookie,
      body: fields,
      expected: 201,
    })
  ).data.id;
  await req(origins[1], "/admin/materials/" + material, {
    cookie: b.cookie,
    method: "PUT",
    body: fields,
    expected: 404,
  });
  const listing = "/events/" + event + "/creators/" + accounts[0].username;
  const stock = async (origin) =>
    (await req(origin, listing)).data.materials.find((m) => m.id === material);
  assert.equal((await fetch(origins[1] + publicImage)).status, 200);
  assert.equal((await fetch(origins[0] + privateImage)).status, 404);
  const booking = (overrides = {}) => ({
    eventId: event,
    kind: "free",
    nickname: "验收领取人",
    contact: randomUUID(),
    note: "私密验收备注",
    noteImage: privateImage,
    items: [{ materialId: material, quantity: 1 }],
    requestKey: randomUUID(),
    ...overrides,
  });
  const input = booking();
  const reservation = (
    await req(origins[1], "/reservations", {
      cookie: b.cookie,
      body: input,
      expected: 201,
    })
  ).data;
  await req(origins[0], "/reservations", { cookie: b.cookie, body: input });
  assert.equal((await stock(origins[0])).reserved, 1);
  for (const cookie of [a.cookie, b.cookie])
    assert.equal(
      (
        await fetch(origins[0] + privateImage + "?size=thumb", {
          headers: { Cookie: cookie },
        })
      ).status,
      200,
    );
  await req(origins[0], "/account/records/" + reservation.reservation.id, {
    cookie: a.cookie,
  });
  await req(origins[1], "/account/records/" + reservation.reservation.id, {
    cookie: b.cookie,
  });
  const publicData = JSON.stringify(
    (await req(origins[0], "/catalog/materials")).data,
  );
  assert.ok(
    !publicData.includes(input.contact) && !publicData.includes(privateImage),
  );
  const collect =
    "/admin/reservations/" + reservation.reservation.id + "/collect";
  await req(origins[0], collect, { cookie: a.cookie, body: {} });
  await req(origins[1], collect, { cookie: a.cookie, body: {} });
  assert.equal((await stock(origins[1])).collected, 1);
  assert.equal((await stock(origins[1])).reserved, 0);
  const swap = (
    await req(origins[1], "/reservations", {
      cookie: b.cookie,
      body: booking({
        kind: "swap",
        offer: "验收互换徽章",
        offerImage: privateImage,
      }),
      expected: 201,
    })
  ).data.reservation;
  assert.equal((await stock(origins[0])).reserved, 0);
  await req(origins[0], "/admin/reservations/" + swap.id + "/accept", {
    cookie: a.cookie,
    body: {},
  });
  assert.equal((await stock(origins[1])).reserved, 1);
  await req(origins[1], "/account/records/" + swap.id + "/cancel", {
    cookie: b.cookie,
    body: {},
  });
  assert.equal((await stock(origins[0])).reserved, 0);
  results.push(
    "双账号登录、共享活动、上传、物料权限、图文申请、幂等、领取和互换取消、库存同步通过",
  );
  const last = (
    await req(origins[0], eventPath + "/materials", {
      cookie: a.cookie,
      body: { ...fields, name: "最后一份验收徽章（测试）", total: 1 },
      expected: 201,
    })
  ).data.id;
  const inputs = [a, b].map(() =>
    booking({ noteImage: "", items: [{ materialId: last, quantity: 1 }] }),
  );
  const race = await Promise.all(
    [a, b].map((user, i) =>
      fetch(origins[i] + "/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: user.cookie },
        body: JSON.stringify(inputs[i]),
      }),
    ),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  const winner = await race.find((r) => r.status === 201).json();
  await req(
    origins[0],
    "/admin/reservations/" + winner.reservation.id + "/cancel",
    { cookie: a.cookie, body: {} },
  );
  results.push(
    "两个独立 Node 进程争最后一份：一成功、一库存不足；取消释放通过",
  );
  await stop();
  const restarted = await start(),
    current = await stock(restarted);
  assert.equal(current.collected, 1);
  assert.equal(current.reserved, 0);
  assert.equal((await fetch(restarted + publicImage)).status, 200);
  assert.equal((await fetch(restarted + privateImage)).status, 404);
  await req(restarted, "/account/records/" + reservation.reservation.id, {
    cookie: b.cookie,
  });
  results.push("进程重启后账号会话、活动物料、记录、库存、Storage 图片保留");
  writeFileSync(
    "output/cloud-verification.json",
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        backend: "Supabase PostgreSQL + private Storage",
        scope: "本机两个独立进程，尚非 Netlify 部署验收",
        results,
      },
      null,
      2,
    ),
  );
  results.forEach((result) => console.log(result));
  console.log(
    "账号在忽略提交的 output/cloud-test-accounts.json；测试活动和物料带（测试）标记。",
  );
} catch (error) {
  console.error(error.message || "云端验收未通过");
  process.exitCode = 1;
} finally {
  await stop();
}
