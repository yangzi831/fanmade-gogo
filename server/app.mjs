import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import multer from "multer";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";
import { openDb, transaction } from "./db.mjs";
import {
  Problem,
  hash,
  publicUser,
  publicMaterial,
  createReservation,
  readReservation,
  transition,
} from "./rules.mjs";
import {
  catalogEvents,
  duplicateEvents,
  createCatalogEvent,
  joinEvent,
  getEvent,
  resolveEventId,
  creatorListing,
  eventGroups,
} from "./events.mjs";
import { eventIdentity } from "./event-identity.mjs";
import { prepareImage, diskImageStore, thumbName } from "./images.mjs";
import {
  catalogMaterials,
  catalogEventPage,
  catalogCreators,
} from "./catalog.mjs";
import { favorites, setFavorite } from "./favorites.mjs";
import {
  personalCollection,
  browseMaterials,
  accountRecords,
  participantRecord,
} from "./accounts.mjs";
import {
  saveMaterials,
  manualHandoff,
  handoffs,
  createShare,
} from "./materials.mjs";
const text = z.string().trim().min(1).max(200);
const image = z
  .string()
  .max(300)
  .refine(
    (v) =>
      !v ||
      /^\/assets\/[a-z0-9-]+\.svg$/.test(v) ||
      /^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(v),
    "请使用本站上传的图片",
  );
const profile = z.object({
  nickname: text.max(40),
  bio: z.string().trim().max(500),
  avatar: image,
});
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, "无效日期");
const eventSchema = z
  .object({
    title: text.max(100),
    city: text.max(60),
    venue: text.max(160),
    date: dateSchema,
    session: text.max(80).default("全天"),
    end_date: dateSchema.optional(),
    end_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default("23:59"),
    theme: z.enum(["sage", "peach", "lilac"]).default("sage"),
    kind: z.enum(["音乐节", "剧场", "演唱会", "活动", "其他"]).default("其他"),
    acknowledgeDuplicates: z.boolean().default(false),
  })
  .transform((d) => ({ ...d, end_date: d.end_date || d.date }))
  .refine((d) => d.end_date >= d.date, "结束日期不能早于活动日期");
const listingSchema = z.object({
  instructions: z.string().trim().max(3000).default(""),
  published: z.boolean().default(true),
});
const materialSchema = z.object({
  name: z.string().trim().max(100),
  description: z.string().trim().max(3000),
  image,
  mode: z.enum(["free", "swap", "both"]),
  total: z.number().int().min(0).max(100000),
  per_person: z.number().int().min(1).max(100),
  category: z
    .enum(["贴纸", "明信片", "徽章", "应援牌", "其他"])
    .default("其他"),
  size: z.string().trim().max(100).default(""),
  medium: z.string().trim().max(100).default(""),
  instructions: z.string().trim().max(3000).default(""),
  deadline: z
    .union([z.literal(""), z.iso.datetime({ offset: true })])
    .default(""),
  paused: z.boolean().default(false),
});
const reservationSchema = z
  .object({
    eventId: z.string().uuid(),
    creatorId: z.string().uuid().optional(),
    kind: z.enum(["free", "swap"]),
    nickname: text.max(40),
    contact: text.max(150),
    note: z.string().trim().max(1000).default(""),
    noteImage: image.default(""),
    items: z
      .array(
        z.object({
          materialId: z.string().uuid(),
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .min(1)
      .max(50),
    requestKey: z.string().uuid(),
    offer: z.string().trim().max(2000).default(""),
    offerImage: image.default(""),
  })
  .refine(
    (v) => v.kind !== "swap" || v.offer.length > 0,
    "请填写用于互换的物料说明",
  );
export function createApp({
  dataDir = process.env.DATA_DIR || "./data",
  db = openDb(dataDir),
  production = process.env.NODE_ENV === "production",
  imageStore,
} = {}) {
  const app = express();
  // Netlify's serverless-http adapter may not populate req.socket.remoteAddress,
  // so Express cannot always derive req.ip. Keep rate limiting functional while
  // still separating callers when Netlify forwards a client address.
  const rateLimitKey = (req) => {
    const forwarded = req.get("x-nf-client-connection-ip") ||
      req.get("x-forwarded-for")?.split(",")[0]?.trim();
    return ipKeyGenerator(req.ip || forwarded || "netlify");
  };
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  const uploads = resolve(dataDir, "uploads");
  mkdirSync(uploads, { recursive: true });
  const store = imageStore || diskImageStore(uploads);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      const allowed = process.env.APP_ORIGIN
        ? [process.env.APP_ORIGIN]
        : ["http://localhost:5173", "http://localhost:3001"];
      if (
        (origin && !allowed.includes(origin)) ||
        req.get("sec-fetch-site") === "cross-site"
      )
        return next(new Problem(403, "请求来源不受信任"));
    }
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 200,
      keyGenerator: rateLimitKey,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "操作太频繁，请稍后再试" },
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    keyGenerator: rateLimitKey,
    message: { error: "登录或注册尝试过多，请稍后再试" },
  });
  const writeLimit = rateLimit({
    windowMs: 60000,
    limit: 25,
    keyGenerator: rateLimitKey,
    message: { error: "提交太频繁，请稍后重试" },
  });
  function getUser(req) {
    const token = req.cookies.session;
    if (!token) return null;
    return (
      db
        .prepare(
          "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
        )
        .get(hash(token), Date.now()) || null
    );
  }
  function auth(req, res, next) {
    req.user = getUser(req);
    if (!req.user) return next(new Problem(401, "请先登录账号"));
    next();
  }
  function ownedEvent(id, uid) {
    const e = db
      .prepare(
        "SELECT e.*,c.instructions,c.published FROM events e JOIN event_creators c ON c.event_id=e.id WHERE e.id=? AND c.creator_id=?",
      )
      .get(resolveEventId(db, id), uid);
    if (!e) throw new Problem(404, "找不到可管理的活动");
    return e;
  }
  function ownedReservation(id, uid) {
    const r = db
      .prepare("SELECT id FROM reservations WHERE id=? AND creator_id=?")
      .get(id, uid);
    if (!r) throw new Problem(404, "找不到可管理的预约");
    return r;
  }
  function checkImage(path, uid) {
    if (!path.startsWith("/uploads/")) return;
    const u = db
      .prepare("SELECT * FROM uploads WHERE filename=? AND user_id=?")
      .get(path.split("/").pop(), uid);
    if (!u) throw new Problem(403, "只能使用自己上传的图片");
  }
  function session(res, uid) {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(token),
      uid,
      Date.now() + 7 * 86400000,
    );
    res.cookie("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      maxAge: 7 * 86400000,
      path: "/",
    });
  }
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/config", (req, res) =>
    res.json({
      demo: !!db.prepare("SELECT 1 FROM users WHERE demo=1 LIMIT 1").get(),
    }),
  );
  app.get("/api/me", (req, res) => {
    const u = getUser(req);
    res.json({ user: u ? publicUser(u) : null });
  });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const d = z
      .object({
        username: z.string().regex(/^[a-z0-9_-]{3,30}$/),
        password: z.string().min(10).max(128),
        nickname: text.max(40),
      })
      .parse(req.body);
    const password = await bcrypt.hash(d.password, 12);
    if (db.prepare("SELECT id FROM users WHERE username=?").get(d.username))
      throw new Problem(409, "用户名已被使用");
    const id = randomUUID();
    transaction(db, () => {
      const first = !db.prepare("SELECT 1 FROM users LIMIT 1").get();
      db.prepare(
        "INSERT INTO users(id,username,password,nickname,is_admin) VALUES(?,?,?,?,?)",
      ).run(id, d.username, password, d.nickname, +first);
    });
    session(res, id);
    res
      .status(201)
      .json(publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(id)));
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const d = z
      .object({ username: text, password: z.string().min(1).max(128) })
      .parse(req.body);
    const u = db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(d.username);
    if (
      !(await bcrypt.compare(
        d.password,
        u?.password ||
          "$2b$12$C6UzMDM.H6dfI/f/IKcEe.CqejJPKkHpzpnQXGxSpslGLPJJZqM2q",
      ))
    )
      throw new Problem(401, "用户名或密码不正确");
    if (!u) throw new Problem(401, "用户名或密码不正确");
    session(res, u.id);
    res.json(publicUser(u));
  });
  app.post("/api/auth/logout", (req, res) => {
    if (req.cookies.session)
      db.prepare("DELETE FROM sessions WHERE token=?").run(
        hash(req.cookies.session),
      );
    res.clearCookie("session", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: production,
    });
    res.json({ ok: true });
  });
  app.put("/api/me", auth, (req, res) => {
    const d = profile.parse(req.body);
    checkImage(d.avatar, req.user.id);
    db.prepare("UPDATE users SET nickname=?,bio=?,avatar=? WHERE id=?").run(
      d.nickname,
      d.bio,
      d.avatar,
      req.user.id,
    );
    res.json(
      publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id)),
    );
  });
  app.get("/api/discover", (req, res) =>
    res.json({
      creators: db
        .prepare(
          "SELECT u.* FROM users u WHERE EXISTS(SELECT 1 FROM materials m JOIN events e ON e.id=m.event_id JOIN event_creators c ON c.event_id=m.event_id AND c.creator_id=m.creator_id WHERE m.creator_id=u.id AND m.published=1 AND c.published=1 AND e.published=1) ORDER BY u.demo DESC,u.nickname",
        )
        .all()
        .map(publicUser),
      events: catalogEvents(db, { upcomingWithMaterials: true }),
    }),
  );
  app.get("/api/catalog/materials", (req, res) =>
    res.json(catalogMaterials(db, req.query)),
  );
  app.get("/api/catalog/events", (req, res) =>
    res.json(catalogEventPage(db, req.query)),
  );
  app.get("/api/catalog/creators", (req, res) =>
    res.json(catalogCreators(db, req.query)),
  );
  app.get("/api/events/search", (req, res) =>
    res.json(
      catalogEvents(db, {
        q: String(req.query.q || ""),
        city: String(req.query.city || ""),
        date: String(req.query.date || ""),
      }),
    ),
  );
  app.get("/api/featured-events", (req, res) =>
    res.json(
      catalogEvents(db)
        .filter((e) => e.featured > 0 && !e.ended)
        .sort((a, b) => b.featured - a.featured),
    ),
  );
  app.get("/api/account/favorites", auth, (req, res) =>
    res.json(favorites(db, req.user.id)),
  );
  for (const method of ["put", "delete"])
    app[method]("/api/account/favorites/:kind/:id", auth, (req, res) => {
      const kind = z
        .enum(["material", "event", "creator"])
        .parse(req.params.kind);
      setFavorite(db, req.user.id, kind, req.params.id, method === "put");
      res.json({ saved: method === "put" });
    });
  app.get("/api/materials", (req, res) =>
    res.json(
      browseMaterials(db, {
        q: String(req.query.q || ""),
        category: String(req.query.category || ""),
        mode: String(req.query.mode || ""),
        username: String(req.query.username || ""),
      }),
    ),
  );
  app.post("/api/account/collection", auth, (req, res) =>
    res.json(personalCollection(db, req.user.id)),
  );
  app.get("/api/users/:username/collection", (req, res) => {
    const row = db
      .prepare(
        "SELECT p.event_id FROM personal_collections p JOIN users u ON u.id=p.creator_id WHERE u.username=?",
      )
      .get(req.params.username);
    if (!row) throw new Problem(404, "发布者还没有日常物料清单");
    res.json(creatorListing(db, row.event_id, req.params.username));
  });
  app.get("/api/account/records", auth, (req, res) =>
    res.json(
      accountRecords(
        db,
        req.user.id,
        req.query.direction === "sent" ? "sent" : "received",
      ),
    ),
  );
  app.get("/api/account/records/:id", auth, (req, res) =>
    res.json(participantRecord(db, req.params.id, req.user.id)),
  );
  app.post("/api/account/records/:id/cancel", auth, (req, res) => {
    participantRecord(db, req.params.id, req.user.id);
    res.json(transition(db, req.params.id, "cancel"));
  });
  app.post("/api/account/claims", auth, (req, res) => {
    const d = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(req.body);
    const result = transaction(db, () => {
      const row = db
        .prepare("SELECT id,recipient_id FROM reservations WHERE token_hash=?")
        .get(hash(d.token));
      if (!row) throw new Problem(404, "查询链接无效");
      if (row.recipient_id && row.recipient_id !== req.user.id)
        throw new Problem(409, "这份记录已关联其他账号");
      db.prepare("UPDATE reservations SET recipient_id=? WHERE id=?").run(
        req.user.id,
        row.id,
      );
      return { id: row.id };
    });
    res.json(result);
  });
  app.post("/api/events/duplicates", auth, (req, res) =>
    res.json(
      duplicateEvents(
        db,
        eventSchema.parse(req.body),
        String(req.body.excludeId || ""),
      ),
    ),
  );
  app.get("/api/users/:username", (req, res) => {
    const u = db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(req.params.username);
    if (!u) throw new Problem(404, "制作人不存在");
    res.json({
      creator: publicUser(u),
      events: db
        .prepare(
          "SELECT e.*,c.instructions,c.published,? AS creator_username FROM events e JOIN event_creators c ON c.event_id=e.id WHERE c.creator_id=? AND c.published=1 AND e.published=1 AND NOT EXISTS(SELECT 1 FROM personal_collections p WHERE p.event_id=e.id) AND EXISTS(SELECT 1 FROM materials m WHERE m.event_id=e.id AND m.creator_id=c.creator_id AND m.published=1) ORDER BY e.date",
        )
        .all(u.username, u.id),
      materials: browseMaterials(db, { username: u.username }),
    });
  });
  app.get("/api/events/:id/creators/:username", (req, res) =>
    res.json(creatorListing(db, req.params.id, req.params.username)),
  );
  app.get(
    "/api/events/:id/creators/:username/materials/:materialId",
    (req, res) => {
      const list = creatorListing(db, req.params.id, req.params.username);
      list.materials = list.materials.filter(
        (m) => m.id === req.params.materialId,
      );
      if (!list.materials.length) throw new Problem(404, "物料不存在或未发布");
      res.json(list);
    },
  );
  app.get("/api/shares/:id", (req, res) => {
    const share = db
      .prepare(
        "SELECT s.*,u.username FROM share_lists s JOIN users u ON u.id=s.creator_id WHERE s.id=?",
      )
      .get(req.params.id);
    if (!share) throw new Problem(404, "分享清单不存在");
    const list = creatorListing(db, share.event_id, share.username),
      ids = JSON.parse(share.material_ids);
    list.materials = list.materials.filter((m) => ids.includes(m.id));
    res.json({ ...list, share_id: share.id });
  });
  app.get("/api/events/:id", (req, res) =>
    res.json(eventGroups(db, req.params.id)),
  );
  app.post("/api/reservations", writeLimit, (req, res) => {
    const d = reservationSchema.parse(req.body);
    const user = getUser(req);
    const result = createReservation(db, d, user?.id || null, (path) => {
      if (!path) return;
      if (!path.startsWith("/uploads/"))
        throw new Problem(400, "请上传本次申请的图片");
      const upload = db
        .prepare("SELECT user_id,guest_hash FROM uploads WHERE filename=?")
        .get(path.split("/").pop());
      const guest = req.cookies.guest_upload;
      if (
        !upload ||
        (!(user && upload.user_id === user.id) &&
          !(guest && upload.guest_hash && upload.guest_hash === hash(guest)))
      )
        throw new Problem(403, "只能附上自己上传的图片，请重新上传");
    });
    res.status(result.replayed ? 200 : 201).json(result);
  });
  function secretReservation(token) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Problem(404, "查询链接无效");
    const r = db
      .prepare("SELECT id FROM reservations WHERE token_hash=?")
      .get(hash(token));
    if (!r) throw new Problem(404, "查询链接无效");
    return r.id;
  }
  app.get("/api/lookup/:token", (req, res) =>
    res.json(readReservation(db, secretReservation(req.params.token))),
  );
  app.post("/api/lookup/:token/cancel", (req, res) =>
    res.json(transition(db, secretReservation(req.params.token), "cancel")),
  );
  function adminOnly(req, res, next) {
    if (!req.user.is_admin)
      return next(new Problem(403, "只有站点管理员可以修改共享活动资料"));
    next();
  }
  app.get("/api/admin/catalog", auth, (req, res) =>
    res.json(
      catalogEvents(db, {
        q: String(req.query.q || ""),
        includeHidden: !!req.user.is_admin,
      }),
    ),
  );
  // Site admins may add an empty catalog event without joining or publishing materials.
  app.post("/api/admin/catalog", auth, adminOnly, (req, res) =>
    res
      .status(201)
      .json(createCatalogEvent(db, eventSchema.parse(req.body), req.user.id)),
  );
  app.put("/api/admin/catalog/:id", auth, adminOnly, (req, res) => {
    const id = resolveEventId(db, req.params.id),
      d = eventSchema.parse(req.body);
    transaction(db, () => {
      if (
        !db
          .prepare(
            "SELECT id FROM events WHERE id=? AND NOT EXISTS(SELECT 1 FROM personal_collections WHERE event_id=events.id)",
          )
          .get(id)
      )
        throw new Problem(404, "活动不存在");
      const candidates = duplicateEvents(db, d, id);
      if (candidates.some((e) => e.exact))
        throw new Problem(409, "已存在相同活动，请使用已有记录");
      if (candidates.length && !d.acknowledgeDuplicates)
        throw new Problem(409, "存在可能重复的活动，请先核对并确认");
      db.prepare(
        "UPDATE events SET title=?,city=?,venue=?,date=?,session=?,end_date=?,end_time=?,location=?,theme=?,identity_key=?,kind=? WHERE id=?",
      ).run(
        d.title,
        d.city,
        d.venue,
        d.date,
        d.session,
        d.end_date,
        d.end_time,
        d.city + " · " + d.venue,
        d.theme,
        eventIdentity(d),
        d.kind,
        id,
      );
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/events", auth, (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT e.*,c.instructions,c.published,e.published AS catalog_published,EXISTS(SELECT 1 FROM personal_collections p WHERE p.event_id=e.id) AS personal FROM events e JOIN event_creators c ON c.event_id=e.id WHERE c.creator_id=? ORDER BY e.date,e.session",
        )
        .all(req.user.id),
    ),
  );
  // A creator can propose a new shared event; duplicate detection is always enforced.
  app.post("/api/admin/events", auth, (req, res) =>
    res.status(201).json(
      createCatalogEvent(db, eventSchema.parse(req.body), req.user.id, {
        join: true,
      }),
    ),
  );
  app.post("/api/admin/events/:id/join", auth, (req, res) =>
    res.json({ id: joinEvent(db, req.params.id, req.user.id) }),
  );
  app.put("/api/admin/events/:id", auth, (req, res) => {
    const e = ownedEvent(req.params.id, req.user.id),
      d = listingSchema.parse(req.body);
    db.prepare(
      "UPDATE event_creators SET instructions=?,published=? WHERE event_id=? AND creator_id=?",
    ).run(d.instructions, +d.published, e.id, req.user.id);
    res.json({ ok: true });
  });
  app.get("/api/admin/events/:id/materials", auth, (req, res) => {
    const e = ownedEvent(req.params.id, req.user.id);
    res.json(
      db
        .prepare(
          "SELECT * FROM materials WHERE event_id=? AND creator_id=? ORDER BY rowid",
        )
        .all(e.id, req.user.id)
        .map(publicMaterial),
    );
  });
  app.post("/api/admin/events/:id/materials/batch", auth, (req, res) => {
    const e = ownedEvent(req.params.id, req.user.id);
    const d = z
      .object({
        publish: z.boolean(),
        items: z
          .array(materialSchema.extend({ id: z.string().uuid() }))
          .min(1)
          .max(50),
      })
      .parse(req.body);
    for (const m of d.items) checkImage(m.image, req.user.id);
    res.json(saveMaterials(db, e.id, req.user.id, d.items, d.publish));
  });
  app.post("/api/admin/events/:id/materials", auth, (req, res) => {
    const e = ownedEvent(req.params.id, req.user.id),
      d = materialSchema.parse(req.body);
    checkImage(d.image, req.user.id);
    const id = randomUUID();
    saveMaterials(db, e.id, req.user.id, [{ ...d, id }], true);
    res.status(201).json({ id });
  });
  app.put("/api/admin/materials/:id", auth, (req, res) => {
    const m = db
      .prepare("SELECT * FROM materials WHERE id=? AND creator_id=?")
      .get(req.params.id, req.user.id);
    if (!m) throw new Problem(404, "找不到可管理的物料");
    const d = materialSchema.parse(req.body);
    checkImage(d.image, req.user.id);
    saveMaterials(db, m.event_id, req.user.id, [{ ...d, id: m.id }]);
    res.json({ ok: true });
  });
  app.patch("/api/admin/materials/:id/state", auth, (req, res) => {
    const d = z.object({ paused: z.boolean() }).parse(req.body);
    const result = db
      .prepare("UPDATE materials SET paused=? WHERE id=? AND creator_id=?")
      .run(+d.paused, req.params.id, req.user.id);
    if (!result.changes) throw new Problem(404, "找不到可管理的物料");
    res.json({ ok: true });
  });
  app.get("/api/admin/events/:id/handoffs", auth, (req, res) => {
    const e = ownedEvent(req.params.id, req.user.id);
    res.json(handoffs(db, e.id, req.user.id));
  });
  app.post("/api/admin/events/:id/handoffs", auth, (req, res) => {
    const e = ownedEvent(req.params.id, req.user.id);
    const d = z
      .object({
        requestKey: z.string().uuid(),
        kind: z.enum(["free", "swap"]),
        nickname: z.string().trim().max(40).default(""),
        contact: z.string().trim().max(150).default(""),
        location: z.string().trim().max(200).default(""),
        note: z.string().trim().max(1000).default(""),
        items: z
          .array(
            z.object({
              materialId: z.string().uuid(),
              quantity: z.number().int().min(1).max(100000),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(req.body);
    const result = manualHandoff(db, e.id, req.user.id, d);
    res.status(result.replayed ? 200 : 201).json(result);
  });
  app.post("/api/admin/events/:id/shares", auth, (req, res) => {
    const e = ownedEvent(req.params.id, req.user.id);
    const d = z
      .object({ materialIds: z.array(z.string().uuid()).min(1).max(50) })
      .parse(req.body);
    if (
      !db
        .prepare(
          "SELECT 1 FROM event_creators WHERE event_id=? AND creator_id=? AND published=1",
        )
        .get(e.id, req.user.id)
    )
      throw new Problem(409, "请先公开你的清单");
    res.status(201).json(createShare(db, e.id, req.user.id, d.materialIds));
  });
  app.get("/api/admin/events/:id/reservations", auth, (req, res) => {
    const e = ownedEvent(req.params.id, req.user.id);
    res.json(
      db
        .prepare(
          "SELECT id FROM reservations WHERE event_id=? AND creator_id=? ORDER BY created_at DESC",
        )
        .all(e.id, req.user.id)
        .map((r) => readReservation(db, r.id)),
    );
  });
  app.post("/api/admin/reservations/:id/:action", auth, (req, res) => {
    ownedReservation(req.params.id, req.user.id);
    if (!["accept", "reject", "cancel", "collect"].includes(req.params.action))
      throw new Problem(400, "操作无效");
    res.json(transition(db, req.params.id, req.params.action));
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  app.post(
    "/api/uploads",
    writeLimit,
    (req, res, next) => {
      req.user = getUser(req);
      next();
    },
    upload.single("image"),
    async (req, res) => {
      if (!req.file) throw new Problem(400, "请选择图片");
      const { full, thumb, width, height } = await prepareImage(
        req.file.buffer,
      );
      const filename = randomUUID() + ".webp",
        small = thumbName(filename);
      const guest = req.user
        ? ""
        : /^[a-f0-9]{64}$/.test(req.cookies.guest_upload || "")
          ? req.cookies.guest_upload
          : randomBytes(32).toString("hex");
      try {
        await store.put(filename, full);
        await store.put(small, thumb);
        db.prepare(
          "INSERT INTO uploads(filename,user_id,created_at,guest_hash) VALUES(?,?,?,?)",
        ).run(
          filename,
          req.user?.id || null,
          new Date().toISOString(),
          guest ? hash(guest) : "",
        );
      } catch (e) {
        await Promise.allSettled([store.remove(filename), store.remove(small)]);
        throw e;
      }
      if (guest)
        res.cookie("guest_upload", guest, {
          httpOnly: true,
          sameSite: "lax",
          secure: production,
          maxAge: 7 * 86400000,
          path: "/",
        });
      res.status(201).json({
        url: "/uploads/" + filename,
        thumbnail: "/uploads/" + filename + "?size=thumb",
        width,
        height,
        bytes: full.length,
        thumbnailBytes: thumb.length,
      });
    },
  );
  app.get("/uploads/:filename", async (req, res) => {
    const name = req.params.filename;
    if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(name))
      throw new Problem(404, "图片不存在");
    const upload = db
      .prepare("SELECT * FROM uploads WHERE filename=?")
      .get(name);
    if (!upload) throw new Problem(404, "图片不存在");
    // Guest exchange attachments and draft creator uploads are private, even if their filename is known.
    const url = "/uploads/" + name;
    const published = db
      .prepare(
        "SELECT 1 FROM materials m JOIN events e ON e.id=m.event_id JOIN event_creators c ON c.event_id=m.event_id AND c.creator_id=m.creator_id WHERE m.image=? AND m.published=1 AND e.published=1 AND c.published=1 UNION SELECT 1 FROM users WHERE avatar=? LIMIT 1",
      )
      .get(url, url);
    const user = getUser(req);
    let allowed =
      !!published ||
      !!(user && upload.user_id === user.id) ||
      !!(
        upload.guest_hash &&
        req.cookies.guest_upload &&
        upload.guest_hash === hash(req.cookies.guest_upload)
      );
    const attached = db
      .prepare(
        "SELECT r.id,r.creator_id AS owner_id,r.recipient_id,r.token_hash FROM reservations r WHERE r.note_image=? UNION SELECT r.id,r.creator_id AS owner_id,r.recipient_id,r.token_hash FROM exchange_applications x JOIN reservations r ON r.id=x.reservation_id WHERE x.image=?",
      )
      .all(url, url);
    if (
      user &&
      attached.some((r) => r.owner_id === user.id || r.recipient_id === user.id)
    )
      allowed = true;
    const bearer = req.get("x-reservation-token") || req.query.access;
    if (
      typeof bearer === "string" &&
      attached.some((r) => r.token_hash === hash(bearer))
    )
      allowed = true;
    if (!allowed) throw new Problem(404, "图片不存在");
    const small =
      req.query.size === "thumb" ? await store.get(thumbName(name)) : null;
    const bytes = small || (await store.get(name));
    if (!bytes) throw new Problem(404, "图片不存在");
    res.set(
      "Cache-Control",
      published ? "public, max-age=300" : "private, no-store",
    );
    res.type(small ? "webp" : name.split(".").pop()).send(bytes);
  });
  app.use("/assets", express.static(resolve("public/assets")));
  if (existsSync(resolve("dist/index.html"))) {
    app.use(express.static(resolve("dist")));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api/"))
        return next(new Problem(404, "接口不存在"));
      res.sendFile(resolve("dist/index.html"));
    });
  }
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("；"),
      });
    if (err instanceof multer.MulterError)
      return res
        .status(400)
        .json({ error: "图片上传失败：请使用不超过 5 MB 的单张图片" });
    if (
      err.code === "23505" ||
      err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      String(err.message).includes("UNIQUE constraint")
    )
      return res.status(409).json({ error: "此记录已存在，请刷新后重试" });
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({
      error: err.status ? err.message : "服务器暂时无法处理，请稍后重试",
    });
  });
  return { app, db };
}
