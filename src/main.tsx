import React, {
  useEffect,
  useState,
  useRef,
  createContext,
  useContext,
  FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useParams,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  MapPin,
  CalendarDays,
  Plus,
  Minus,
  X,
  Check,
  Ticket,
  Package,
  SlidersHorizontal,
  Share2,
  Copy,
  QrCode,
  LogOut,
  Menu,
  Heart,
  LoaderCircle,
  Search,
  CheckCircle2,
  Settings2,
  ExternalLink,
  ImagePlus,
  RefreshCw,
  Compass,
  Calendar,
  NotebookPen,
  UserRound,
  Bookmark,
  ChevronRight,
} from "lucide-react";
import QRCode from "qrcode";
import {
  api,
  upload,
  modes,
  statuses,
  dateLabel,
  newRequestKey,
  Creator,
  Event,
  Material,
  Reservation,
  MaterialEntry,
} from "./api";
import { MaterialStudio, ManualHandoffs } from "./material-studio";
import { ShareStudio } from "./share-studio";
import { PublicMaterialCard, MaterialFacts } from "./material-ui";
import { categories, materialClosure, materialStatus } from "./api";
import "./styles.css";
import "./studio.css";
import "./shell.css";
import "./reference.css";
import { FavoritesProvider } from "./favorites";
import {
  ReferenceHeader,
  ReferenceDiscover,
  ReferenceMy,
  ReferenceSaved,
  ReferenceRecords,
  ReferenceRecordPage,
} from "./reference-pages";
const Context = createContext<{
  user: Creator | null;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  ready: boolean;
}>({ user: null, refresh: async () => {}, notify: () => {}, ready: false });
function useApp() {
  return useContext(Context);
}
function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) {
      setData(null);
      setError("");
      return;
    }
    let live = true;
    setError("");
    setData(null);
    api<T>(path)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path, revision]);
  return { data, error, reload: () => setRevision((n) => n + 1) };
}
function State({ error }: { error?: string }) {
  return (
    <div className="state">
      {error ? (
        <>
          <span>暂时没有找到</span>
          <p>{error}</p>
          <Link to="/" className="button outline">
            返回首页
          </Link>
        </>
      ) : (
        <>
          <LoaderCircle className="spin" />
          <p>正在准备物料…</p>
        </>
      )}
    </div>
  );
}
function App() {
  const [user, setUser] = useState<Creator | null>(null),
    [toast, setToast] = useState(""),
    [ready, setReady] = useState(false);
  const location = useLocation();
  const refresh = async () => {
    try {
      setUser((await api("/me")).user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <Context.Provider value={{ user, refresh, notify: setToast, ready }}>
      <FavoritesProvider userId={user?.id} notify={setToast}>
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/events" element={<ActivityPage />} />
            <Route path="/me" element={<MyPage />} />
            <Route path="/me/profile" element={<MyPage profileOpen />} />
            <Route path="/me/saved" element={<SavedPage />} />
            <Route path="/manage" element={<Admin />} />
            <Route path="/publish" element={<PublishPage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/records/:recordId" element={<AccountRecordPage />} />
            <Route path="/u/:username" element={<Profile />} />
            <Route path="/u/:username/collection" element={<EventPage />} />
            <Route path="/u/:username/m/:materialId" element={<EventPage />} />
            <Route path="/e/:eventId" element={<CatalogEventPage />} />
            <Route path="/e/:eventId/by/:username" element={<EventPage />} />
            <Route
              path="/e/:eventId/by/:username/m/:materialId"
              element={<EventPage />}
            />
            <Route path="/s/:shareId" element={<EventPage />} />
            <Route
              path="/e/:eventId/by/:username/checkout"
              element={<Checkout />}
            />
            <Route path="/e/:eventId/checkout" element={<LegacyCheckout />} />
            <Route path="/r/:token" element={<Lookup />} />
            <Route path="/lookup" element={<LookupEntry />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/admin/*" element={<LegacyAdminRedirect />} />
            <Route path="*" element={<State error="这个页面不存在" />} />
          </Routes>
        </main>
        <Footer />
        {toast && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            {toast}
          </div>
        )}
      </FavoritesProvider>
    </Context.Provider>
  );
}
function Header() {
  return <ReferenceHeader />;
}

function Footer() {
  return (
    <footer>
      <Link to="/" className="footer-brand">
        <Package size={18} /> fanMade GoGo!
      </Link>
      <p>
        因为喜欢，所以分享。<span>让每一份心意，都有一场相遇。</span>
      </p>
      <small>Made by fans. Shared with fans.</small>
    </footer>
  );
}
function ActivityPage() {
  return <ReferenceDiscover activities />;
}

function ArrowDownIcon() {
  return <ArrowRight size={17} style={{ transform: "rotate(90deg)" }} />;
}
function Avatar({ user, large = false }: { user: Creator; large?: boolean }) {
  return user.avatar ? (
    <img
      className={"avatar " + (large ? "large" : "")}
      src={user.avatar}
      alt={user.nickname}
    />
  ) : (
    <span className={"avatar fallback " + (large ? "large" : "")}>
      {user.nickname.slice(0, 1)}
    </span>
  );
}
function EventCard({ event: e }: { event: Event }) {
  const { user } = useApp();
  return (
    <article className={"event-card " + e.theme}>
      <Link
        to={
          e.creator_username
            ? creatorPath(e.id, e.creator_username)
            : "/e/" + e.id
        }
      >
        <div className="event-art">
          <span className="event-type">
            {e.theme === "lilac" ? "THEATRE DIARY" : "LIVE MOMENTS"}
          </span>
          <span className="event-big">
            {e.theme === "lilac" ? (
              <>
                好戏
                <br />
                <i>未完待续</i>
              </>
            ) : e.theme === "peach" ? (
              <>
                晚风
                <br />
                <i>装进口袋</i>
              </>
            ) : (
              <>
                日落
                <br />
                <i>正在发生</i>
              </>
            )}
          </span>
          <img
            src={
              e.theme === "lilac"
                ? "/assets/theatre.svg"
                : e.theme === "peach"
                  ? "/assets/notes.svg"
                  : "/assets/sunset.svg"
            }
            alt="活动物料插画"
          />
          <span className="event-date">
            {e.date.slice(5).replace("-", " / ")} <ArrowUpRight size={20} />
          </span>
        </div>
        <div className="event-info">
          <div className="event-meta">
            {e.demo ? <span>演示活动</span> : <span>物料预约</span>}
            <span>
              {e.creator_username
                ? "制作人物料清单"
                : `${e.creator_count || 0} 位制作人 · ${e.material_count || 0} 件物料`}
            </span>
          </div>
          <h3>{e.title}</h3>
          <p>
            <MapPin size={14} />
            {e.location}
          </p>
          <div className="event-card-bottom">
            <span>
              {e.date} · {e.session}
            </span>
            <span>
              {e.ended ? "已结束 · 查看" : "去看看"} <ArrowRight size={15} />
            </span>
          </div>
        </div>
      </Link>
      {e.material_count === 0 && (
        <Link className="event-first-link" to={publishLink(e.id, user)}>
          发布第一份物料 <Plus size={14} />
        </Link>
      )}
    </article>
  );
}
function Profile() {
  const { username = "" } = useParams();
  const { data, error } = useLoad<{
    creator: Creator;
    events: Event[];
    materials: MaterialEntry[];
  }>("/users/" + username);
  const [scope, setScope] = useState("all");
  if (!data) return <State error={error} />;
  const shown = data.materials.filter(
    (v) =>
      scope === "all" ||
      (scope === "personal" ? !v.event : v.event?.id === scope),
  );
  return (
    <div className="container">
      <div className="breadcrumb">
        <Link to="/">发现</Link> / 公开物料主页
      </div>
      <section className="profile-hero">
        <Avatar user={data.creator} large />
        <div>
          <span className="eyebrow">
            MADE BY {data.creator.username.toUpperCase()}
          </span>
          <h1>
            {data.creator.nickname}
            <span className="subtle">@{data.creator.username}</span>
          </h1>
          <p>{data.creator.bio || "每一份物料，都有自己的故事。"}</p>
          {data.creator.demo && (
            <small className="demo-label">演示用户 · 物料来自数据库</small>
          )}
        </div>
        <ShareButton path={"/u/" + username} />
      </section>
      <div className="section-title">
        <h2>
          公开物料 <span className="serif">Made with love.</span>
        </h2>
        <span className="subtle">{shown.length} 件物料</span>
      </div>
      <label className="field profile-scope">
        <span>按活动浏览</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">全部物料</option>
          <option value="personal">未关联活动</option>
          {data.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} · {e.city} · {e.date} · {e.session}
            </option>
          ))}
        </select>
      </label>
      <div className="material-grid">
        {shown.map((v) => (
          <PublicMaterialCard
            key={v.material.id}
            material={v.material}
            creator={data.creator}
            detailPath={v.detailPath}
          />
        ))}
      </div>
      {!shown.length && (
        <div className="empty">这些物料还在准备，期待下一次见面。</div>
      )}
    </div>
  );
}
function ShareButton({
  path,
  label = "分享",
}: {
  path: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false),
    [qr, setQr] = useState("");
  const { notify } = useApp();
  const url = window.location.origin + path;
  useEffect(() => {
    if (open)
      QRCode.toDataURL(url, {
        width: 280,
        margin: 2,
        color: { dark: "#244d3c", light: "#fffdf7" },
      }).then(setQr);
  }, [open, url]);
  return (
    <>
      <button className="button outline small" onClick={() => setOpen(true)}>
        <Share2 size={16} /> {label}
      </button>
      {open && (
        <Modal title="把这份喜欢，分享出去" close={() => setOpen(false)}>
          <div className="share-panel">
            {qr && <img src={qr} alt="分享二维码" />}
            <p className="subtle">扫码打开这张物料页面</p>
            <div className="copy-box">{url}</div>
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  notify("链接已复制");
                } catch {
                  notify("请长按上方链接复制");
                }
              }}
            >
              <Copy size={16} />
              复制链接
            </button>
            {qr && (
              <a
                className="button outline"
                download="小小物料-分享.png"
                href={qr}
              >
                <QrCode size={16} />
                保存二维码
              </a>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const modalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const els = focusable(),
          first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <section
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" aria-label="关闭" onClick={close}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
type Cart = {
  kind: "free" | "swap";
  items: Record<string, number>;
  requestKey: string;
};
function getCart(id: string): Cart {
  try {
    return (
      JSON.parse(sessionStorage.getItem("cart:" + id) || "null") || {
        kind: "free",
        items: {},
        requestKey: newRequestKey(),
      }
    );
  } catch {
    return { kind: "free", items: {}, requestKey: newRequestKey() };
  }
}
function creatorPath(eventId: string, username: string) {
  return `/e/${encodeURIComponent(eventId)}/by/${encodeURIComponent(username)}`;
}
function publishLink(eventId: string, user: Creator | null) {
  const next = "/publish?event=" + encodeURIComponent(eventId);
  return user ? next : "/login?next=" + encodeURIComponent(next);
}
type EventGroup = { event: Event; creator: Creator; materials: Material[] };
function CatalogEventPage() {
  const { eventId = "" } = useParams(),
    { user } = useApp();
  const { data, error } = useLoad<{ event: Event; groups: EventGroup[] }>(
    "/events/" + eventId,
  );
  const [creator, setCreator] = useState(""),
    [category, setCategory] = useState(""),
    [mode, setMode] = useState(""),
    [posterOpen, setPosterOpen] = useState(false);
  useClock();
  if (!data) return <State error={error} />;
  const { event: e, groups } = data;
  const shown = groups
    .flatMap((g) => g.materials.map((m) => ({ m, creator: g.creator })))
    .filter(
      (v) =>
        (!creator || v.creator.id === creator) &&
        (!category || v.m.category === category) &&
        (!mode || v.m.mode === mode || v.m.mode === "both"),
    );
  return (
    <div className="container event-page">
      <div className="breadcrumb">
        <Link to="/">发现物料</Link> / 活动现场
      </div>
      <section className={"event-heading catalog-heading " + e.theme}>
        <div>
          <span className="eyebrow">ONE STAGE, MANY LITTLE STORIES</span>
          <h1>{e.title}</h1>
          <div className="event-heading-meta">
            <span>
              <CalendarDays size={16} />
              {e.date}
              {e.end_date !== e.date ? " — " + e.end_date : ""} · {e.session}
            </span>
            <span>
              <MapPin size={16} />
              {e.city} · {e.venue}
            </span>
          </div>
          {e.demo > 0 && (
            <span className="demo-label">演示活动 · 示例内容来自数据库</span>
          )}
          {e.ended && <p>本场已结束，仍可浏览物料。</p>}
        </div>
        <ShareButton path={"/e/" + e.id} />
      </section>
      {e.poster && (
        <button
          className="event-poster-strip"
          onClick={() => setPosterOpen(true)}
          aria-label="查看活动完整海报"
        >
          <img src={e.poster} alt={e.title + "海报"} />
          <span>
            <b>{e.title}</b>
            <small>查看完整竖版海报 ↗</small>
          </span>
        </button>
      )}
      {posterOpen && (
        <Modal title={e.title + " · 海报"} close={() => setPosterOpen(false)}>
          <img
            className="full-poster"
            src={e.poster}
            alt={e.title + "完整海报"}
          />
        </Modal>
      )}
      <div className="section-title catalog-intro">
        <div>
          <h2>这一场，遇见彼此的喜欢</h2>
          <p className="subtle">
            {groups.length} 位制作人 · {shown.length} 件物料
          </p>
        </div>
        <Link className="button outline" to={publishLink(e.id, user)}>
          ＋ {groups.length ? "我也来发布物料" : "发布第一份物料"}
        </Link>
      </div>
      <div className="event-browser-layout">
        <aside className="event-filters">
          <h3>
            <SlidersHorizontal size={17} /> 找一份喜欢
          </h3>
          <label className="field">
            <span>制作人</span>
            <select
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
            >
              <option value="">全部制作人</option>
              {groups.map((g) => (
                <option key={g.creator.id} value={g.creator.id}>
                  {g.creator.nickname} @{g.creator.username}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>物料类型</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">全部类型</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>领取方式</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="">全部方式</option>
              <option value="free">可免费领取</option>
              <option value="swap">可申请互换</option>
            </select>
          </label>
          <p className="fine-print">
            不同制作人分别预约。点击作品查看完整图片和领取说明。
          </p>
        </aside>
        <section>
          <div className="material-grid">
            {shown.map(({ m, creator: c }) => (
              <PublicMaterialCard
                key={m.id}
                material={m}
                creator={c}
                detailPath={creatorPath(e.id, c.username) + "/m/" + m.id}
              />
            ))}
          </div>
          {shown.length === 0 && (
            <div className="empty">
              <Package size={34} />
              <h2>{groups.length ? "换个筛选条件看看" : "等待第一份心意"}</h2>
              <p>
                {groups.length
                  ? "没有匹配的物料。"
                  : "这场活动尚无公开物料，可以发布第一份物料。"}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
function useClock() {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
}
function LegacyCheckout() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const { data, error } = useLoad<{ event: Event; groups: EventGroup[] }>(
    "/events/" + eventId,
  );
  useEffect(() => {
    if (!data) return;
    const old = getCart(eventId),
      ids = Object.keys(old.items);
    const group = ids.length
      ? data.groups.find((g) =>
          ids.every((id) => g.materials.some((m) => m.id === id)),
        )
      : data.groups.length === 1
        ? data.groups[0]
        : null;
    if (group) {
      const key = "cart:" + eventId + ":" + group.creator.username;
      if (ids.length && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, JSON.stringify(old));
        sessionStorage.removeItem("cart:" + eventId);
      }
      navigate(creatorPath(eventId, group.creator.username) + "/checkout", {
        replace: true,
      });
    } else navigate("/e/" + eventId, { replace: true });
  }, [data, eventId, navigate]);
  return <State error={error} />;
}
function EventPage() {
  const {
    eventId = "",
    username = "",
    shareId = "",
    materialId = "",
  } = useParams();
  const source = shareId
    ? "/shares/" + shareId
    : eventId
      ? "/events/" + eventId + "/creators/" + username
      : "/users/" + username + "/collection";
  const { user } = useApp();
  const [shareOpen, setShareOpen] = useState(false);
  useClock();

  const { data, error } = useLoad<{
    event: Event;
    creator: Creator;
    materials: Material[];
  }>(source);
  const cartKey = shareId
      ? "share:" + shareId
      : (eventId || data?.event.id || "personal") + ":" + username,
    base = creatorPath(
      data?.event.id || eventId,
      data?.creator.username || username,
    );
  const [cart, setCart] = useState<Cart>(() => getCart(cartKey));
  useEffect(() => {
    setCart(getCart(cartKey));
  }, [cartKey]);
  useEffect(() => {
    const m = data?.materials.find((v) => v.id === materialId);
    if (!m || m.mode === "both") return;
    setCart((current) => {
      if (Object.keys(current.items).length || current.kind === m.mode)
        return current;
      const next: Cart = {
        ...current,
        kind: m.mode as "free" | "swap",
        requestKey: newRequestKey(),
      };
      sessionStorage.setItem("cart:" + cartKey, JSON.stringify(next));
      return next;
    });
  }, [data, materialId, cartKey]);
  const navigate = useNavigate();
  const update = (next: Cart) => {
    setCart(next);
    sessionStorage.setItem("cart:" + cartKey, JSON.stringify(next));
  };
  if (!data) return <State error={error} />;
  const { event: e, creator, materials } = data;
  const publicBase = e.personal
    ? "/u/" + creator.username + "/collection"
    : base;
  const detailPath = (id: string) =>
    e.personal ? "/u/" + creator.username + "/m/" + id : base + "/m/" + id;
  const count = Object.values(cart.items).reduce((a, b) => a + b, 0);
  const visible = materialId
    ? materials.filter((m) => m.id === materialId)
    : materials;
  const compatible = visible.filter(
    (m) => m.mode === "both" || m.mode === cart.kind,
  );
  const adjust = (m: Material, n: number) => {
    if (materialClosure(m) && n > (cart.items[m.id] || 0)) return;
    const items = { ...cart.items };
    n = Math.max(
      0,
      Math.min(
        n,
        m.per_person,
        cart.kind === "free" ? m.available : m.per_person,
      ),
    );
    if (n) items[m.id] = n;
    else delete items[m.id];
    update({ ...cart, items, requestKey: newRequestKey() });
  };
  return (
    <div className="container event-page">
      <div className="breadcrumb">
        <Link to="/">发现物料</Link> /{" "}
        <Link to={"/u/" + creator.username}>{creator.nickname}的主页</Link> /
        {!e.personal && (
          <>
            <Link to={"/e/" + e.id}>本场全部发布者</Link> /{" "}
          </>
        )}
        物料清单
      </div>
      <section className={"event-heading " + e.theme}>
        <div>
          <Link className="creator-mini" to={"/u/" + creator.username}>
            <Avatar user={creator} />
            {creator.nickname}的公开物料主页 <ArrowUpRight size={14} />
          </Link>
          <span className="eyebrow">A LITTLE GIFT FOR OUR NEXT MEETING</span>
          <h1>{e.title}</h1>
          {!e.personal && (
            <div className="event-heading-meta">
              <span>
                <CalendarDays size={16} />
                {e.date} · {e.session}
              </span>
              <span>
                <MapPin size={16} />
                {e.location}
              </span>
            </div>
          )}
          {e.demo > 0 && (
            <span className="demo-label">演示活动 · 可完整试用预约流程</span>
          )}
        </div>
        <div className="heading-art">
          <img
            src={
              e.theme === "lilac"
                ? "/assets/theatre.svg"
                : "/assets/postcard.svg"
            }
            alt="本场活动物料示意"
          />
        </div>
        <button
          className="button outline small"
          onClick={() => setShareOpen(true)}
        >
          <Share2 size={16} />
          分享清单／卡片
        </button>
      </section>
      <div className="instructions">
        <Ticket size={21} />
        <div>
          <strong>现场见面指南</strong>
          <p>{e.instructions || "制作人尚未填写，请留意更新。"}</p>
        </div>
      </div>
      <section className="section">
        <div className="section-title">
          <div>
            <span className="eyebrow">LITTLE THINGS, JUST FOR YOU</span>
            <h2>
              挑一点喜欢 <span className="serif">Take a little love.</span>
            </h2>
          </div>
          <span className="subtle">
            {materialId ? "单件物料详情" : `共 ${materials.length} 件原创物料`}
          </span>
        </div>
        <div className="materials-toolbar">
          <div className="tabs">
            <button
              className={cart.kind === "free" ? "active" : ""}
              onClick={() =>
                update({
                  kind: "free",
                  items: {},
                  requestKey: newRequestKey(),
                })
              }
            >
              免费领取
            </button>
            <button
              className={cart.kind === "swap" ? "active" : ""}
              onClick={() =>
                update({
                  kind: "swap",
                  items: {},
                  requestKey: newRequestKey(),
                })
              }
            >
              物料互换
            </button>
          </div>
          <span className="subtle">
            <SlidersHorizontal size={14} />
            {cart.kind === "free"
              ? "选好物料，一次预约"
              : "提交申请，由制作人确认"}
          </span>
        </div>
        {materialId && visible[0] && (
          <section className="single-material-detail panel">
            <img
              className="single-art"
              src={visible[0].image || "/assets/notes.svg"}
              alt={visible[0].name}
            />
            <div>
              <Link to={publicBase} className="text-button">
                ← 查看制作人完整清单
              </Link>
              <h2>{visible[0].name}</h2>
              <p>{visible[0].description}</p>
              <MaterialFacts material={visible[0]} />
              <div className="single-actions">
                <Quantity
                  value={cart.items[visible[0].id] || 0}
                  max={
                    materialClosure(visible[0]) ||
                    (visible[0].mode !== "both" &&
                      visible[0].mode !== cart.kind)
                      ? 0
                      : cart.kind === "free"
                        ? Math.min(visible[0].per_person, visible[0].available)
                        : visible[0].per_person
                  }
                  onChange={(n) => adjust(visible[0], n)}
                />
                <button
                  className="button outline"
                  onClick={() => setShareOpen(true)}
                >
                  分享这件物料
                </button>
              </div>
            </div>
          </section>
        )}
        {!materialId && (
          <div className="material-grid">
            {compatible.map((m) => (
              <PublicMaterialCard
                key={m.id}
                material={m}
                creator={creator}
                detailPath={detailPath(m.id)}
              >
                <Quantity
                  value={cart.items[m.id] || 0}
                  max={
                    materialClosure(m)
                      ? 0
                      : cart.kind === "free"
                        ? Math.min(m.per_person, m.available)
                        : m.per_person
                  }
                  onChange={(n) => adjust(m, n)}
                />
              </PublicMaterialCard>
            ))}
          </div>
        )}
        {compatible.length === 0 && !materialId && (
          <div className="empty">
            这里还没有可{cart.kind === "free" ? "领取" : "互换"}
            的物料，换个方式看看。
          </div>
        )}
      </section>
      <div className="gentle-note">
        <Heart size={17} />
        <span>每一份都是用心制作。请按需预约，把喜欢留给更多同频的人。</span>
      </div>
      {count > 0 && (
        <div className="cart-bar">
          <div>
            <span className="cart-icon">
              <Package size={23} />
              <b>{count}</b>
            </span>
            <div>
              <strong>带走 {Object.keys(cart.items).length} 件小小喜欢</strong>
              <small>
                {cart.kind === "free"
                  ? "预约成功即预留，现场出示领取码"
                  : "等待制作人确认后预留库存"}
              </small>
            </div>
          </div>
          <button
            className="button"
            onClick={() => {
              sessionStorage.setItem(
                "cart:" + e.id + ":" + creator.username,
                JSON.stringify(cart),
              );
              navigate(base + "/checkout");
            }}
          >
            {cart.kind === "free" ? "填写预约" : "申请互换"}
            <ArrowRight size={18} />
          </button>
        </div>
      )}
      {materialId && visible.length === 0 && (
        <div className="empty">这件物料暂未公开。</div>
      )}
      {shareOpen && (
        <ShareStudio
          creator={creator}
          event={e}
          materials={materials}
          initialIds={
            materialId
              ? [materialId]
              : shareId
                ? materials.map((m) => m.id)
                : undefined
          }
          allowSelection={user?.id === creator.id}
          existingPath={shareId ? "/s/" + shareId : undefined}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
function Quantity({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="quantity">
      <button
        aria-label="减少数量"
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={15} />
      </button>
      <span aria-live="polite">{value}</span>
      <button
        aria-label="增加数量"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Checkout() {
  const { eventId = "", username = "" } = useParams();
  const cartKey = eventId + ":" + username,
    base = creatorPath(eventId, username);
  const { data, error } = useLoad<{
    event: Event;
    materials: Material[];
    creator: Creator;
  }>("/events/" + eventId + "/creators/" + username);
  const [cart] = useState(() => getCart(cartKey));
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [offerImage, setOfferImage] = useState(""),
    [noteImage, setNoteImage] = useState(""),
    [noteUploading, setNoteUploading] = useState(false),
    [uploading, setUploading] = useState(false),
    [preview, setPreview] = useState("");
  const navigate = useNavigate();
  const items = data?.materials.filter((m) => cart.items[m.id] > 0) || [];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const result = await api("/reservations", {
        eventId,
        creatorId: data!.creator.id,
        kind: cart.kind,
        nickname: f.get("nickname"),
        contact: f.get("contact"),
        note: f.get("note"),
        offer: f.get("offer") || "",
        offerImage,
        noteImage,
        items: items.map((m) => ({
          materialId: m.id,
          quantity: cart.items[m.id],
        })),
        requestKey: cart.requestKey,
      });
      sessionStorage.removeItem("cart:" + cartKey);
      navigate("/r/" + result.token, { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <State error={error} />;
  return (
    <div className="container narrow">
      <Link to={base} className="back">
        <ArrowLeft size={16} /> 返回调整物料
      </Link>
      <div className="page-heading">
        <span className="eyebrow">ONE STEP CLOSER TO MEETING</span>
        <h1>
          {cart.kind === "free" ? "预约一份小小喜欢" : "带着你的喜欢，来交换"}
        </h1>
        <p>不用注册。留下一点信息，方便现场找到彼此。</p>
      </div>
      {items.length === 0 ? (
        <div className="empty">
          还没有选择物料。<Link to={base}>去挑选 →</Link>
        </div>
      ) : (
        <div className="checkout-grid">
          <form className="panel" onSubmit={submit}>
            <h2>你的领取信息</h2>
            <Field label="昵称 *">
              <input
                name="nickname"
                required
                maxLength={40}
                placeholder="现场怎么称呼你？"
                autoComplete="nickname"
              />
            </Field>
            <Field
              label="联系方式 *"
              hint="例如微信号、手机号或邮箱。仅制作人和持有查询链接的你可见。"
            >
              <input
                name="contact"
                required
                maxLength={150}
                placeholder="方便制作人联系你的方式"
                autoComplete="off"
              />
            </Field>
            {cart.kind === "swap" && (
              <>
                <Field label="你准备的互换物料 *">
                  <textarea
                    name="offer"
                    required
                    maxLength={2000}
                    rows={4}
                    placeholder="介绍一下你的物料、数量与想交换的内容…"
                  />
                </Field>
                <Field
                  label="互换物料图片（选填）"
                  hint="JPG / PNG / WebP，最大 5 MB。图片仅本次申请双方可见。"
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      setErr("");
                      try {
                        setOfferImage(await upload(file));
                        setPreview(URL.createObjectURL(file));
                      } catch (e) {
                        setErr((e as Error).message);
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                  {preview && (
                    <img
                      className="upload-thumb"
                      src={preview}
                      alt="互换物料预览"
                    />
                  )}
                </Field>
              </>
            )}
            <Field label="想对制作人说的话（选填）">
              <textarea
                name="note"
                maxLength={1000}
                rows={3}
                placeholder="预计到场时间，或一句小小的留言…"
              />
            </Field>
            <Field
              label="备注图片（选填）"
              hint="仅本次申请双方可见，不能用作公开分享图。"
            >
              <ImageUpload
                value={noteImage}
                onChange={setNoteImage}
                onError={setErr}
                onBusy={setNoteUploading}
              />
            </Field>
            <label className="consent">
              <input type="checkbox" required />
              我会按需预约，并在无法到场时主动取消。
            </label>
            {err && (
              <div className="error" role="alert">
                {err}
              </div>
            )}
            <button
              className="button full"
              disabled={busy || uploading || noteUploading}
            >
              {busy ? <LoaderCircle className="spin" size={18} /> : null}
              {busy
                ? "正在提交…"
                : uploading || noteUploading
                  ? "图片上传中…"
                  : cart.kind === "free"
                    ? "确认预约"
                    : "提交互换申请"}
              <ArrowRight size={17} />
            </button>
            <p className="fine-print">
              提交后请保存专属查询链接，后续可查看进度或取消预约。
            </p>
          </form>
          <aside className="panel checkout-summary">
            <span className="eyebrow">YOUR LITTLE COLLECTION</span>
            <h2>{data.event.title}</h2>
            <p className="subtle">
              {data.creator.nickname} @{data.creator.username} 的物料清单
            </p>
            {items.map((m) => (
              <div className="summary-item" key={m.id}>
                <img src={m.image || "/assets/notes.svg"} alt="" />
                <span>
                  {m.name}
                  <small>{modes[m.mode]}</small>
                </span>
                <b>×{cart.items[m.id]}</b>
              </div>
            ))}
            <p className="subtle">
              {cart.kind === "free"
                ? "预约成功后立即预留库存，凭领取码在现场核对。"
                : "互换申请需要制作人确认；确认前不预留库存，可能因余量不足无法通过。"}
            </p>
            <p className="fine-print">
              限领按同一活动、物料与规范化后的联系方式累计校验。免登录无法完全防止更换联系方式后重复领取。
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
function LookupEntry() {
  const [value, setValue] = useState(""),
    [error, setError] = useState("");
  const navigate = useNavigate();
  return (
    <div className="container narrow">
      <div className="page-heading center">
        <Ticket size={35} />
        <h1>找回你的那份喜欢</h1>
        <p>粘贴预约成功时保存的专属查询链接。</p>
      </div>
      <form
        className="panel lookup-entry"
        onSubmit={(e) => {
          e.preventDefault();
          const match = value.match(/(?:\/r\/)?([a-f0-9]{64})(?:[?#].*)?$/);
          if (match) navigate("/r/" + match[1]);
          else
            setError(
              "请输入完整查询链接，或 64 位查询凭证；领取码不能用于查询。",
            );
        }}
      >
        <Field label="专属查询链接">
          <input
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://…/r/你的专属凭证"
          />
        </Field>
        {error && <p className="error">{error}</p>}
        <button className="button full">
          <Search size={17} /> 查询预约
        </button>
        <p className="fine-print">
          请妥善保管链接，持有链接的人可以查看和取消预约。领取码只用于现场核对，不能找回查询链接；若丢失，请联系制作人。
        </p>
      </form>
    </div>
  );
}
function Lookup() {
  const { token = "", recordId = "" } = useParams();
  const { notify, user } = useApp();
  const { data, error, reload } = useLoad<Reservation>(
    recordId
      ? user
        ? "/account/records/" + recordId
        : null
      : "/lookup/" + token,
  );
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [confirm, setConfirm] = useState(false);
  if (recordId && !user)
    return (
      <GuestPanel
        title="登录查看交接记录"
        next={"/records/" + recordId}
        description="这份记录仅交接双方登录后可查看。"
      />
    );
  if (!data) return <State error={error} />;
  return (
    <div className="container narrow result-page">
      <div className="page-heading center">
        <span className={"result-icon " + data.status}>
          <Check size={30} />
        </span>
        <span className="eyebrow">A LITTLE LOVE, RESERVED FOR YOU</span>
        <h1>
          {data.status === "reserved"
            ? "这份喜欢，为你留好了"
            : statuses[data.status]}
        </h1>
        <p>
          {data.status === "pending"
            ? "制作人会查看你的互换申请，请稍后通过此链接查看。"
            : data.status === "reserved"
              ? "把领取码带到现场，就能找到属于你的那份小小心意。"
              : "你可以在下面查看本次预约的明细。"}
        </p>
      </div>
      <div className="result-ticket panel">
        <div className="row spread">
          <strong>{data.event.title}</strong>
          <span className={"status " + data.status}>
            {statuses[data.status]}
          </span>
        </div>
        <div className="pickup-code">
          <span>现场领取码</span>
          <strong>{data.code}</strong>
          <small>由制作人登录后台核对后标记领取</small>
        </div>
        <div className="ticket-cut" />
        {data.items.map((i) => (
          <div key={i.material_id} className="summary-item">
            <img src={i.image || "/assets/notes.svg"} alt="" />
            <span>{i.name}</span>
            <b>×{i.quantity}</b>
          </div>
        ))}
        <dl className="details">
          <dt>制作人</dt>
          <dd>
            <Link
              to={
                data.event.personal
                  ? "/u/" + data.creator.username + "/collection"
                  : creatorPath(data.event_id, data.creator.username)
              }
            >
              {data.creator.nickname} @{data.creator.username}
            </Link>
          </dd>
          <dt>预约人</dt>
          <dd>{data.nickname}</dd>
          <dt>联系方式</dt>
          <dd>{data.contact}</dd>
          <dt>活动时间</dt>
          <dd>
            {data.event.personal
              ? "未关联活动，按领取说明交接"
              : `${data.event.date} · ${data.event.session}`}
          </dd>
          <dt>领取地点</dt>
          <dd>{data.event.location || "请查看领取说明或联系发布者"}</dd>
          {data.note && (
            <>
              <dt>留言</dt>
              <dd>{data.note}</dd>
            </>
          )}
        </dl>
        {data.note_image && (
          <img
            className="upload-thumb"
            src={data.note_image + (token ? "?access=" + token : "")}
            alt="私密备注图片"
          />
        )}
        <div className="instructions compact">
          <MapPin size={18} />
          <p>
            {data.event.instructions || "制作人尚未填写领取说明，请留意更新。"}
          </p>
        </div>
        {data.exchange && (
          <div className="exchange-offer">
            <h3>你提供的互换物料</h3>
            <p>{data.exchange.offer}</p>
            {data.exchange.image && (
              <img
                src={data.exchange.image + "?access=" + token}
                className="upload-thumb"
                alt="互换物料"
              />
            )}
          </div>
        )}
      </div>
      <div className="panel save-link">
        <Copy size={21} />
        <div>
          <strong>
            {recordId ? "记录已保存在账号内" : "保存查询链接，下次直接回来"}
          </strong>
          <p>
            {recordId
              ? "只有交接双方登录后可访问此记录，刷新即可查看最新状态。"
              : "链接包含私密凭证，请勿公开转发。刷新页面即可查看最新状态。"}
          </p>
        </div>
        <button
          className="button small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.href);
              notify(
                recordId
                  ? "账号记录链接已复制"
                  : "专属查询链接已复制，请妥善保存",
              );
            } catch {
              notify("请从地址栏复制当前链接");
            }
          }}
        >
          复制链接
        </button>
      </div>
      {token && user && (
        <button
          className="button outline"
          onClick={async () => {
            try {
              const r = await api("/account/claims", { token });
              location.assign("/records/" + r.id);
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        >
          保存到“我领取的”
        </button>
      )}
      <div className="row center">
        <button className="button outline" onClick={reload}>
          <RefreshCw size={16} />
          刷新状态
        </button>
        {["pending", "reserved"].includes(data.status) && (
          <button
            className="text-button danger"
            onClick={() => setConfirm(true)}
          >
            取消本次预约
          </button>
        )}
      </div>
      {confirm && (
        <Modal title="确认取消本次预约？" close={() => setConfirm(false)}>
          <div className="detail-body">
            <p>本次所有物料将一起取消，已预留的库存会释放。之后可重新预约。</p>
            {err && <p className="error">{err}</p>}
            <button
              className="button danger-bg full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(
                    recordId
                      ? "/account/records/" + recordId + "/cancel"
                      : "/lookup/" + token + "/cancel",
                    {},
                  );
                  setConfirm(false);
                  reload();
                  notify("预约已取消");
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认取消
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Home() {
  return <ReferenceDiscover />;
}

function GuestPanel({
  title,
  next,
  description,
}: {
  title: string;
  next: string;
  description?: string;
}) {
  const { ready } = useApp();
  if (!ready) return <State />;
  return (
    <div className="container guest-page">
      <div className="panel">
        <UserRound size={34} />
        <h1>{title}</h1>
        <p>{description || "一个账号，就可以发布、领取和交换物料。"}</p>
        <Link className="button" to={"/login?next=" + encodeURIComponent(next)}>
          登录／注册
        </Link>
        <Link className="text-button" to="/">
          先去发现物料 →
        </Link>
      </div>
    </div>
  );
}

function MyPage({ profileOpen = false }: { profileOpen?: boolean }) {
  const { user, refresh } = useApp(),
    navigate = useNavigate();
  const [editing, setEditing] = useState(profileOpen);
  if (!user)
    return (
      <GuestPanel title="我的" next={profileOpen ? "/me/profile" : "/me"} />
    );
  return (
    <>
      <ReferenceMy
        user={user}
        edit={() => setEditing(true)}
        share={
          <ShareButton path={"/u/" + user.username} label="分享我的主页" />
        }
        logout={async () => {
          await api("/auth/logout", {});
          await refresh();
          navigate("/me");
        }}
      />
      {editing && (
        <ProfileEditor
          close={() => {
            setEditing(false);
            if (profileOpen) navigate("/me", { replace: true });
          }}
        />
      )}
    </>
  );
}

function SavedPage() {
  const { user } = useApp();
  return user ? (
    <ReferenceSaved />
  ) : (
    <GuestPanel title="我的收藏" next="/me/saved" />
  );
}

function LegacyAdminRedirect() {
  const loc = useLocation(),
    target = new URLSearchParams(loc.search).get("event");
  return (
    <Navigate
      replace
      to={target ? "/publish?event=" + encodeURIComponent(target) : "/manage"}
    />
  );
}

function PublishPage() {
  const { user, notify } = useApp(),
    navigate = useNavigate(),
    loc = useLocation();
  const target = new URLSearchParams(loc.search).get("event");
  const [event, setEvent] = useState<Event | null>(null),
    [error, setError] = useState(""),
    [picker, setPicker] = useState(false);
  useEffect(() => {
    if (!user) return;
    let live = true;
    async function load() {
      try {
        let value: Event;
        if (target) {
          await api("/admin/events/" + target + "/join", {});
          value = (await api<Event[]>("/admin/events")).find(
            (v) => v.id === target,
          )!;
          if (!value) throw Error("活动不可用");
        } else value = await api("/account/collection", {});
        if (live) setEvent(value);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [user?.id, target]);
  if (!user)
    return (
      <GuestPanel
        title="发布你的第一份物料"
        next={"/publish" + loc.search}
        description="登录后直接填写物料。不需要开店，也不需要切换身份。"
      />
    );
  if (!event) return <State error={error} />;
  return (
    <div className="container publish-page">
      <Link className="back" to="/me">
        <ArrowLeft size={18} />
        返回我的
      </Link>
      <MaterialStudio
        inline
        event={event}
        onChooseEvent={() => setPicker(true)}
        onClose={() => navigate("/manage")}
        onSaved={() => {
          notify("物料已发布");
          navigate("/manage?scope=" + event.id);
        }}
      />
      {error && <p className="error">{error}</p>}
      {picker && (
        <div className="publish-event-picker">
          <EventPicker
            management={false}
            close={() => setPicker(false)}
            onJoin={async (id) => {
              try {
                await api("/admin/events/" + id + "/join", {});
                const events = await api<Event[]>("/admin/events");
                setEvent(events.find((e) => e.id === id)!);
                setPicker(false);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
          <button
            className="button personal-choice"
            onClick={async () => {
              setEvent(await api("/account/collection", {}));
              setPicker(false);
            }}
          >
            不关联活动，发布日常物料
          </button>
        </div>
      )}
    </div>
  );
}

function RecordsPage() {
  const { user, notify } = useApp();
  return user ? (
    <ReferenceRecords user={user} notify={notify} />
  ) : (
    <GuestPanel title="领取与交换记录" next="/records" />
  );
}
function AccountRecordPage() {
  const { user, notify } = useApp(),
    { recordId } = useParams();
  return user ? (
    <ReferenceRecordPage id={recordId!} user={user} notify={notify} />
  ) : (
    <GuestPanel title="查看记录" next={"/records/" + recordId} />
  );
}

function ReceivedRecords() {
  const { data, error, reload } = useLoad<Reservation[]>(
    "/account/records?direction=received",
  );
  const [filter, setFilter] = useState("active"),
    [query, setQuery] = useState("");
  if (!data) return <State error={error} />;
  const shown = data.filter(
    (r) =>
      (filter === "all" ||
        (filter === "active"
          ? ["pending", "reserved"].includes(r.status)
          : filter === "completed"
            ? r.status === "collected"
            : ["rejected", "cancelled"].includes(r.status))) &&
      [r.creator.nickname, r.event.title, r.code, ...r.items.map((i) => i.name)]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="record-filters">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="搜索我领取的记录"
            placeholder="搜物料、发布者或领取码"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="领取记录状态"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="active">待处理／待领取</option>
          <option value="completed">已完成</option>
          <option value="closed">已取消／已拒绝</option>
          <option value="all">全部记录</option>
        </select>
        <button className="button outline" onClick={reload}>
          <RefreshCw size={17} />
          刷新
        </button>
      </div>
      <div className="received-record-grid">
        {shown.map((r) => (
          <article className="panel received-record" key={r.id}>
            <div className="row spread">
              <div className="row">
                <Avatar user={r.creator} />
                <b>{r.creator.nickname}</b>
              </div>
              <span className={"status " + r.status}>
                {r.kind === "swap" && r.status === "reserved"
                  ? "待交换"
                  : r.kind === "swap" && r.status === "collected"
                    ? "已交换"
                    : statuses[r.status]}
              </span>
            </div>
            <p>{r.event.personal ? "日常物料" : r.event.title}</p>
            <div className="record-thumbnails">
              {r.items.map((i) => (
                <div key={i.material_id}>
                  <img src={i.image || "/assets/notes.svg"} alt="" />
                  <span>{i.name}</span>
                  <b>×{i.quantity}</b>
                </div>
              ))}
            </div>
            <div className="row spread">
              <code>{r.code}</code>
              <Link className="button outline small" to={"/records/" + r.id}>
                查看记录 <ArrowRight size={15} />
              </Link>
            </div>
            <small>{new Date(r.created_at).toLocaleString("zh-CN")}</small>
          </article>
        ))}
      </div>
      {!shown.length && (
        <div className="empty">
          <Ticket size={32} />
          <h2>还没有这类记录</h2>
          <p>登录状态下提交的预约会自动出现在这里。</p>
          <Link className="button outline" to="/">
            去发现喜欢的物料
          </Link>
        </div>
      )}
    </>
  );
}
function Auth() {
  const nextParam =
    new URLSearchParams(useLocation().search).get("next") || "/me";
  const next = /^\/(?:admin|publish|manage|me|records)(?:[/?]|$)/.test(
    nextParam,
  )
    ? nextParam
    : "/me";
  const { data: config } = useLoad<{ demo: boolean }>("/config");
  const { refresh, user } = useApp();
  const navigate = useNavigate();
  const [register, setRegister] = useState(
      new URLSearchParams(useLocation().search).has("register"),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/auth/" + (register ? "register" : "login"), {
        username: f.get("username"),
        password: f.get("password"),
        ...(register ? { nickname: f.get("nickname") } : {}),
      });
      await refresh();
      navigate(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container auth-layout">
      <div className="auth-art">
        <span className="eyebrow">A HOME FOR YOUR LITTLE THINGS</span>
        <h1>
          每一份喜欢，
          <br />
          都有一个家。
        </h1>
        <img src="/assets/postcard.svg" alt="原创明信片" />
        <p>做一点物料，交一些同频的朋友。</p>
      </div>
      <form className="panel auth-form" onSubmit={submit}>
        <span className="eyebrow">FANS' CORNER</span>
        <h1>{register ? "加入 fanMade GoGo!" : "欢迎回来"}</h1>
        <p className="subtle">
          {register
            ? "创建属于你的物料主页。"
            : "同一个账号，分享自己的作品，也领取别人的喜欢。"}
        </p>
        {register && (
          <Field label="昵称">
            <input
              name="nickname"
              required
              maxLength={40}
              placeholder="大家怎么称呼你？"
            />
          </Field>
        )}
        <Field
          label="用户名"
          hint={
            register
              ? "3–30 位小写字母、数字、下划线或短横线，将用于主页链接。"
              : undefined
          }
        >
          <input
            name="username"
            required
            pattern={register ? "[a-z0-9_\\-]{3,30}" : undefined}
            maxLength={30}
            autoComplete="username"
            placeholder="你的专属用户名"
          />
        </Field>
        <Field label="密码" hint={register ? "至少 10 位字符。" : undefined}>
          <input
            type="password"
            name="password"
            required
            minLength={register ? 10 : 1}
            maxLength={128}
            autoComplete={register ? "new-password" : "current-password"}
            placeholder="输入密码"
          />
        </Field>
        {error && <p className="error">{error}</p>}
        <button disabled={busy} className="button full">
          {busy ? "请稍候…" : register ? "创建账号" : "登录"}
          <ArrowRight size={17} />
        </button>
        <button
          type="button"
          className="text-button full"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "已有账号？去登录" : "还没有账号？注册"}
        </button>
        {config?.demo && (
          <div className="demo-box">
            <strong>本地演示账号</strong>
            <p>
              wuwei 或 xiaoyu
              <br />
              密码：Demo2026!share
            </p>
            <small>演示数据仅供试用，正式上线请勿保留演示账号。</small>
          </div>
        )}
      </form>
    </div>
  );
}
function Admin() {
  const { user } = useApp(),
    loc = useLocation();
  const {
    data: events,
    error,
    reload,
  } = useLoad<Event[]>(user ? "/admin/events" : null);
  const { data: records, reload: reloadRecords } = useLoad<Reservation[]>(
    user ? "/account/records?direction=sent" : null,
  );
  const [scope, setScope] = useState(
      new URLSearchParams(loc.search).get("scope") || "",
    ),
    [tab, setTab] = useState(
      new URLSearchParams(loc.search).get("tab") || "materials",
    ),
    [picker, setPicker] = useState(false),
    [listing, setListing] = useState(false),
    [profile, setProfile] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  if (!user) return <GuestPanel title="管理我的物料" next="/manage" />;
  if (!events) return <State error={error} />;
  const selected = events.find((e) => e.id === scope) || events[0];
  const count =
    pending ?? records?.filter((r) => r.status === "pending").length ?? 0;
  return (
    <div className="container management-page">
      <Link className="back" to="/me">
        <ArrowLeft size={18} />
        返回我的
      </Link>
      <div className="section-title">
        <div>
          <span className="eyebrow">MY MATERIAL DESK</span>
          <h1>管理我的物料</h1>
        </div>
        <Link
          className="button"
          to={
            selected && !selected.personal
              ? "/publish?event=" + selected.id
              : "/publish"
          }
        >
          <Plus size={18} />
          添加物料
        </Link>
      </div>
      <div className="management-layout">
        <aside className="management-nav" aria-label="物料管理导航">
          {[
            { id: "materials", label: "物料", icon: Package },
            { id: "requests", label: "收到的申请", icon: NotebookPen },
            { id: "settings", label: "设置", icon: Settings2 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                if (id === "requests") reloadRecords();
              }}
            >
              <Icon size={19} />
              {label}
              {id === "requests" && count > 0 && (
                <b className="request-count">{count}</b>
              )}
            </button>
          ))}
          <Link to={"/u/" + user.username}>
            <ExternalLink size={18} />
            查看公开主页
          </Link>
        </aside>
        <section className="management-content">
          {tab === "requests" ? (
            <>
              <div className="section-title">
                <h2>收到的申请</h2>
                <Link to="/records?direction=sent" className="text-button">
                  在“我发出的”中查看 ↗
                </Link>
              </div>
              <p className="fine-print">
                这里与“记录 → 我发出的”共用同一份预约数据。
              </p>
              <ReservationManager onPendingChange={setPending} />
            </>
          ) : tab === "settings" ? (
            <div className="panel management-settings">
              <h2>公开主页与清单设置</h2>
              <p>稳定主页：/u/{user.username}</p>
              <div className="row">
                <button
                  className="button outline"
                  onClick={() => setProfile(true)}
                >
                  编辑头像、昵称与简介
                </button>
                <ShareButton path={"/u/" + user.username} />
              </div>
              {selected && (
                <>
                  <h3>本场清单</h3>
                  <label className="field">
                    <span>选择清单</span>
                    <select
                      value={selected.id}
                      onChange={(e) => setScope(e.target.value)}
                    >
                      {events.map((e) => (
                        <option value={e.id} key={e.id}>
                          {e.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button outline"
                    onClick={() => setListing(true)}
                  >
                    领取说明与公开设置
                  </button>
                </>
              )}
              {user.is_admin && (
                <button
                  className="button outline"
                  onClick={() => setPicker(true)}
                >
                  管理全站活动库
                </button>
              )}
              <p className="fine-print">
                当前主页使用你的头像、昵称与简介。独立主页名称、封面与每次总量上限尚未开放。
              </p>
            </div>
          ) : (
            <>
              <div className="section-title">
                <h2>我的物料与库存</h2>
                <span className="subtle">所有库存由你独立管理</span>
              </div>
              {selected ? (
                <>
                  <label className="field management-scope">
                    <span>活动／日常物料</span>
                    <select
                      value={selected.id}
                      onChange={(e) => setScope(e.target.value)}
                    >
                      {events.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                          {!e.personal
                            ? ` · ${e.city} · ${e.date} · ${e.session}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <MaterialManager key={selected.id} event={selected} />
                </>
              ) : (
                <div className="empty">
                  <Package size={32} />
                  <h2>从第一件物料开始</h2>
                  <Link className="button" to="/publish">
                    填写发布表单
                  </Link>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {listing && selected && (
        <ListingEditor
          event={selected}
          close={() => setListing(false)}
          saved={() => {
            setListing(false);
            reload();
          }}
        />
      )}
      {profile && <ProfileEditor close={() => setProfile(false)} />}
      {picker && (
        <EventPicker
          management={user.is_admin}
          close={() => {
            setPicker(false);
            reload();
          }}
          onJoin={(id) => location.assign("/publish?event=" + id)}
        />
      )}
    </div>
  );
}
function ListingEditor({
  event,
  close,
  saved,
}: {
  event: Event;
  close: () => void;
  saved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="我的领取说明与公开设置" close={close}>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await api(
              "/admin/events/" + event.id,
              {
                instructions: f.get("instructions"),
                published: f.get("published") === "on",
              },
              "PUT",
            );
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>{event.title}</h3>
        <p className="fine-print">
          共享活动资料由站点管理员维护。这里的说明只影响你自己的物料清单。
        </p>
        <Field label="领取说明">
          <textarea
            name="instructions"
            defaultValue={event.instructions}
            rows={5}
            maxLength={3000}
            placeholder="在哪里、什么时间能找到你？"
          />
        </Field>
        <label className="consent">
          <input
            type="checkbox"
            name="published"
            defaultChecked={!!event.published}
          />
          公开我的物料清单
        </label>
        <p className="fine-print">
          关闭后，仅你的清单停止公开和接受预约；其他制作人的物料不受影响。已有预约仍可查询或取消。
        </p>
        {error && <p className="error">{error}</p>}
        <button disabled={busy} className="button full">
          {busy ? "保存中…" : "保存设置"}
        </button>
      </form>
    </Modal>
  );
}
function EventPicker({
  management,
  close,
  onJoin,
}: {
  management: boolean;
  close: () => void;
  onJoin: (id: string) => void;
}) {
  const { notify } = useApp();
  const [search, setSearch] = useState(""),
    [editor, setEditor] = useState<Event | "new" | null>(null);
  const { data, error, reload } = useLoad<Event[]>(
    "/admin/catalog?q=" + encodeURIComponent(search),
  );
  return (
    <Modal
      title={
        editor
          ? editor === "new"
            ? "添加全站共享活动"
            : "编辑共享活动资料"
          : management
            ? "全站活动库"
            : "先搜索并选择已有活动"
      }
      close={close}
    >
      {editor ? (
        <CatalogForm
          event={editor === "new" ? null : editor}
          joinOnCreate={!management}
          onBack={() => setEditor(null)}
          onChoose={onJoin}
          onSaved={(id) => {
            notify("活动已保存到共享活动库");
            if (!management) onJoin(id);
            else {
              setEditor(null);
              reload();
            }
          }}
        />
      ) : (
        <div className="editor-form">
          <form
            className="row catalog-query"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setSearch(String(f.get("q") || ""));
            }}
          >
            <input
              name="q"
              aria-label="搜索全站活动库"
              placeholder="名称、城市、日期、场次或场地，空格可组合搜索"
            />
            <button className="button small">
              <Search size={15} />
              搜索
            </button>
          </form>
          <p className="fine-print">
            全站共用活动记录。先核对城市、日期、场次与场地，避免重复添加。
          </p>
          {!data ? (
            <State error={error} />
          ) : (
            <div className="catalog-results">
              {data.map((e) => (
                <div className="catalog-result" key={e.id}>
                  <div>
                    <strong>{e.title}</strong>
                    {e.demo > 0 && <span className="demo-label">演示</span>}
                    <p>
                      {e.city} · {e.venue}
                      <br />
                      {e.date} · {e.session} {e.ended ? "· 已结束" : ""}
                    </p>
                    <small>
                      {e.creator_count} 位制作人 · {e.material_count} 件公开物料
                    </small>
                  </div>
                  <div className="row">
                    <button
                      className="button small"
                      onClick={() => onJoin(e.id)}
                    >
                      {e.material_count === 0 ? "发布第一份物料" : "加入并发布"}
                    </button>
                    {management && (
                      <button
                        className="button outline small"
                        onClick={() => setEditor(e)}
                      >
                        编辑资料
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {data.length === 0 && (
                <div className="empty">
                  没有找到这场活动，请换个关键词或添加记录。
                </div>
              )}
            </div>
          )}
          <button
            className="button outline full"
            onClick={() => setEditor("new")}
          >
            <Plus size={16} />
            {management ? "添加活动到全站活动库" : "没有找到？添加新活动"}
          </button>
          <p className="fine-print">
            仅添加或加入活动不会占用库存；公开清单中有物料后，尚未结束的活动才会自动出现在首页。
          </p>
        </div>
      )}
    </Modal>
  );
}
function CatalogForm({
  event,
  joinOnCreate,
  onBack,
  onChoose,
  onSaved,
}: {
  event: Event | null;
  joinOnCreate: boolean;
  onBack: () => void;
  onChoose: (id: string) => void;
  onSaved: (id: string) => void;
}) {
  const [candidates, setCandidates] = useState<
      (Event & { exact: boolean })[] | null
    >(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="editor-form"
      onChange={(e) => {
        if (
          (e.target as unknown as HTMLInputElement).name !==
          "acknowledgeDuplicates"
        )
          setCandidates(null);
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        const f = new FormData(e.currentTarget);
        const d = {
          title: f.get("title"),
          city: f.get("city"),
          venue: f.get("venue"),
          date: f.get("date"),
          session: f.get("session"),
          end_date: f.get("end_date") || f.get("date"),
          end_time: f.get("end_time"),
          theme: f.get("theme"),
          kind: f.get("kind"),
          acknowledgeDuplicates: f.get("acknowledgeDuplicates") === "on",
        };
        try {
          const matches = await api<(Event & { exact: boolean })[]>(
            "/events/duplicates",
            { ...d, excludeId: event?.id || "" },
          );
          setCandidates(matches);
          if (
            matches.some((x) => x.exact) ||
            (matches.length && !d.acknowledgeDuplicates)
          )
            return;
          const result = await api(
            event
              ? "/admin/catalog/" + event.id
              : joinOnCreate
                ? "/admin/events"
                : "/admin/catalog",
            d,
            event ? "PUT" : "POST",
          );
          onSaved(event?.id || result.id);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <button type="button" className="text-button" onClick={onBack}>
        ← 返回搜索
      </button>
      <p className="fine-print">
        这是全站共享的演出资料。领取地点与个人说明在加入后的清单设置中填写。
      </p>
      <Field label="活动／演出名称 *">
        <input
          name="title"
          required
          maxLength={100}
          defaultValue={event?.title}
          placeholder="填写正式演出或音乐节名称"
        />
      </Field>
      <div className="form-row">
        <Field label="城市 *">
          <input
            name="city"
            required
            maxLength={60}
            defaultValue={event?.city}
            placeholder="例如：上海"
          />
        </Field>
        <Field label="场地 *">
          <input
            name="venue"
            required
            maxLength={160}
            defaultValue={event?.venue}
            placeholder="例如：上海文化广场"
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="活动日期 *">
          <input type="date" name="date" required defaultValue={event?.date} />
        </Field>
        <Field label="场次 *">
          <input
            name="session"
            required
            maxLength={80}
            defaultValue={event?.session || "全天"}
            placeholder="例如：19:30 晚场"
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="结束日期（留空为活动当天）">
          <input type="date" name="end_date" defaultValue={event?.end_date} />
        </Field>
        <Field label="结束时间 *">
          <input
            type="time"
            name="end_time"
            required
            defaultValue={event?.end_time || "23:59"}
          />
        </Field>
      </div>
      <Field label="活动类型">
        <select name="kind" defaultValue={event?.kind || "其他"}>
          {["音乐节", "剧场", "演唱会", "活动", "其他"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label="活动主题">
        <select name="theme" defaultValue={event?.theme || "sage"}>
          <option value="sage">草木绿 · 音乐现场</option>
          <option value="lilac">浅丁香 · 剧场时光</option>
          <option value="peach">暖杏色 · 其他现场</option>
        </select>
      </Field>
      {candidates && candidates.length > 0 && (
        <div className="duplicate-warning">
          <strong>先核对这些可能重复的活动</strong>
          {candidates.map((e) => (
            <div className="duplicate-item" key={e.id}>
              <p>
                <b>{e.title}</b>
                {e.exact ? " · 完全相同" : ""}
                <br />
                {e.city} · {e.venue}
                <br />
                {e.date} · {e.session}
              </p>
              <button
                type="button"
                className="button outline small"
                onClick={() => onChoose(e.id)}
              >
                选择此活动
              </button>
            </div>
          ))}
          {!candidates.some((e) => e.exact) && (
            <label className="consent">
              <input type="checkbox" name="acknowledgeDuplicates" />
              我已核对，这是一场不同的活动，仍然添加
            </label>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <button
        className="button full"
        disabled={busy || !!candidates?.some((e) => e.exact)}
      >
        {busy
          ? "正在核对与保存…"
          : event
            ? "核对并保存资料"
            : joinOnCreate
              ? "核对后添加，并发布物料"
              : "核对并添加活动"}
      </button>
      <p className="fine-print">
        按名称、城市、日期、场次和场地一起识别。结束时间按北京时间，用于首页展示；不会自动取消已有预约。
      </p>
    </form>
  );
}
function ImageUpload({
  value,
  onChange,
  onError,
  onBusy,
}: {
  value: string;
  onChange: (s: string) => void;
  onError: (s: string) => void;
  onBusy: (v: boolean) => void;
}) {
  const [preview, setPreview] = useState(value);
  return (
    <div className="image-upload">
      {preview ? (
        <img src={preview} alt="已选择图片" />
      ) : (
        <ImagePlus size={29} />
      )}
      <label className="button outline small">
        上传图片
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onBusy(true);
            try {
              const url = await upload(file);
              onChange(url);
              setPreview(URL.createObjectURL(file));
            } catch (e) {
              onError((e as Error).message);
            } finally {
              onBusy(false);
            }
          }}
        />
      </label>
      <small>JPG / PNG / WebP · 原图最大 20 MB · 自动压缩并生成缩略图</small>
    </div>
  );
}
function ProfileEditor({ close }: { close: () => void }) {
  const { user, refresh, notify } = useApp();
  const [image, setImage] = useState(user!.avatar),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  return (
    <Modal title="让大家认识你" close={close}>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await api(
              "/me",
              { nickname: f.get("nickname"), bio: f.get("bio"), avatar: image },
              "PUT",
            );
            await refresh();
            notify("个人资料已保存");
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ImageUpload
          value={image}
          onChange={setImage}
          onError={setError}
          onBusy={setUploading}
        />
        <Field label="昵称">
          <input
            name="nickname"
            required
            maxLength={40}
            defaultValue={user!.nickname}
          />
        </Field>
        <Field label="个人简介">
          <textarea
            name="bio"
            maxLength={500}
            defaultValue={user!.bio}
            rows={4}
          />
        </Field>
        <p className="fine-print">
          专属主页 /u/{user!.username}，用户名暂不支持修改。
        </p>
        {error && <p className="error">{error}</p>}
        <button className="button full" disabled={busy || uploading}>
          {uploading ? "图片上传中…" : busy ? "正在保存…" : "保存资料"}
        </button>
      </form>
    </Modal>
  );
}
function MaterialManager({
  event,
  requestPublish = false,
  onPublishHandled = () => {},
}: {
  event: Event;
  requestPublish?: boolean;
  onPublishHandled?: () => void;
}) {
  const { data, error, reload } = useLoad<Material[]>(
    "/admin/events/" + event.id + "/materials",
  );
  const [edit, setEdit] = useState<Material[] | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [share, setShare] = useState(false);
  const { user, notify } = useApp();
  useEffect(() => {
    if (requestPublish) {
      setEdit([]);
      onPublishHandled();
    }
  }, [requestPublish]);
  if (!data) return <State error={error} />;
  const totals = data.reduce(
    (a, m) => ({
      total: a.total + m.total,
      available: a.available + m.available,
      reserved: a.reserved + m.reserved,
      collected: a.collected + m.collected,
    }),
    { total: 0, available: 0, reserved: 0, collected: 0 },
  );
  return (
    <>
      <div className="stats">
        {[
          ["物料总量", totals.total],
          ["可预约", totals.available],
          ["已预留", totals.reserved],
          ["已领取", totals.collected],
        ].map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              {n}
              <small>份</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="row spread manager-actions">
        <span className="subtle">
          {data.length} 件物料 · 数量以后台实时校验为准
        </span>
        <button className="button small" onClick={() => setEdit([])}>
          <Plus size={16} />
          连续添加物料
        </button>
      </div>
      <div className="row manager-secondary">
        <button
          className="button outline small"
          disabled={!data.some((m) => !m.published)}
          onClick={() => setEdit(data.filter((m) => !m.published))}
        >
          继续编辑草稿（{data.filter((m) => !m.published).length}）
        </button>
        <button
          className="button outline small"
          disabled={!data.some((m) => m.published)}
          onClick={() => setShare(true)}
        >
          分享清单／已选 {selected.length} 件
        </button>
        <ManualHandoffs event={event} materials={data} onChange={reload} />
      </div>
      <div className="admin-materials">
        {data.map((m) => (
          <article className="admin-material" key={m.id}>
            <input
              aria-label={"选择分享 " + (m.name || "草稿")}
              type="checkbox"
              disabled={!m.published}
              checked={selected.includes(m.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, m.id]
                    : selected.filter((id) => id !== m.id),
                )
              }
            />
            <img src={m.image || "/assets/notes.svg"} alt={m.name} />
            <div>
              <h3>{m.name || "待命名草稿"}</h3>
              <span className="pill">
                {m.category} · {materialStatus(m)}
              </span>
              <p className="subtle">
                总量 {m.total} · 可预约 {m.available} · 已预留 {m.reserved} ·
                已领取 {m.collected}
              </p>
              <small>每人限 {m.per_person} 份</small>
            </div>
            <button
              className="button outline small"
              disabled={!m.published}
              onClick={async () => {
                try {
                  await api(
                    "/admin/materials/" + m.id + "/state",
                    { paused: !m.paused },
                    "PATCH",
                  );
                  reload();
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              {m.paused ? "恢复领取" : "暂停领取"}
            </button>
            <button
              className="button outline small"
              onClick={() => setEdit([m])}
            >
              编辑
            </button>
          </article>
        ))}
      </div>
      {data.length === 0 && (
        <div className="empty">还没有物料，发布你的第一件作品吧。</div>
      )}
      {edit && (
        <MaterialStudio
          event={event}
          initial={edit}
          onClose={() => {
            setEdit(null);
            reload();
          }}
          onSaved={() => {
            setEdit(null);
            reload();
            notify("物料已发布");
          }}
        />
      )}
      {share && user && (
        <ShareStudio
          creator={user}
          event={event}
          materials={data.filter((m) => m.published)}
          initialIds={selected.length ? selected : undefined}
          allowSelection
          onClose={() => setShare(false)}
        />
      )}
    </>
  );
}
function ReservationManager({
  event,
  onPendingChange,
}: {
  event?: Event;
  onPendingChange?: (count: number) => void;
}) {
  const { data, error, reload } = useLoad<Reservation[]>(
    event
      ? "/admin/events/" + event.id + "/reservations"
      : "/account/records?direction=sent",
  );
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(""),
    [err, setErr] = useState(""),
    [confirm, setConfirm] = useState<{
      id: string;
      action: string;
      label: string;
    } | null>(null);
  const { notify } = useApp();
  useEffect(() => {
    if (data)
      onPendingChange?.(data.filter((r) => r.status === "pending").length);
  }, [data, onPendingChange]);
  async function action(id: string, action: string) {
    setBusy(id);
    setErr("");
    try {
      await api("/admin/reservations/" + id + "/" + action, {});
      notify("预约状态已更新");
      setConfirm(null);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (!data) return <State error={error} />;
  const filtered = data.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      [r.code, r.nickname, r.contact].some((v) =>
        v.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  return (
    <>
      <div className="stats">
        {[
          ["预约总数", data.length],
          ["待确认互换", data.filter((r) => r.status === "pending").length],
          ["待领取", data.filter((r) => r.status === "reserved").length],
          ["已领取", data.filter((r) => r.status === "collected").length],
        ].map(([s, n]) => (
          <div key={s}>
            <span>{s}</span>
            <strong>
              {n}
              <small>单</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="reservation-tools">
        <div className="search-input">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入领取码、昵称或联系方式"
            aria-label="查找预约"
          />
        </div>
        <select
          aria-label="按预约状态筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部状态</option>
          {Object.entries(statuses).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="icon" aria-label="刷新预约" onClick={reload}>
          <RefreshCw size={18} />
        </button>
      </div>
      {err && !confirm && <div className="error">{err}</div>}
      <div className="reservation-list">
        {filtered.map((r) => (
          <article key={r.id} className="reservation-card">
            <Link className="record-context" to={"/records/" + r.id}>
              {r.event.personal ? "日常物料" : r.event.title} · 查看记录 ↗
            </Link>
            <div className="row spread">
              <div>
                <strong>{r.nickname}</strong>
                <span className="reservation-kind">
                  {r.kind === "swap" ? "互换申请" : "免费领取"}
                </span>
              </div>
              <span className={"status " + r.status}>{statuses[r.status]}</span>
            </div>
            <div className="reservation-code">
              {r.code}
              <small>{new Date(r.created_at).toLocaleString("zh-CN")}</small>
            </div>
            <p className="private-contact">联系方式：{r.contact}</p>
            <div className="reserved-items">
              {r.items.map((i) => (
                <span key={i.material_id}>
                  {i.name} <b>×{i.quantity}</b>
                </span>
              ))}
            </div>
            {r.note && <p className="reservation-note">留言：{r.note}</p>}
            {r.note_image && (
              <a href={r.note_image} target="_blank" rel="noreferrer">
                <img
                  className="upload-thumb"
                  src={r.note_image}
                  alt="私密备注图片"
                />
              </a>
            )}
            {r.exchange && (
              <div className="exchange-offer">
                <strong>对方提供</strong>
                <p>{r.exchange.offer}</p>
                {r.exchange.image && (
                  <a href={r.exchange.image} target="_blank" rel="noreferrer">
                    <img
                      className="upload-thumb"
                      src={r.exchange.image}
                      alt="申请人提供的互换物料"
                    />
                  </a>
                )}
              </div>
            )}
            <div className="row reservation-actions">
              {r.status === "pending" && (
                <>
                  <button
                    className="button small"
                    disabled={!!busy}
                    onClick={() =>
                      setConfirm({
                        id: r.id,
                        action: "accept",
                        label: "确认互换并预留库存",
                      })
                    }
                  >
                    确认互换
                  </button>
                  <button
                    className="button outline small"
                    disabled={!!busy}
                    onClick={() =>
                      setConfirm({
                        id: r.id,
                        action: "reject",
                        label: "拒绝此次互换申请",
                      })
                    }
                  >
                    拒绝
                  </button>
                </>
              )}
              {r.status === "reserved" && (
                <button
                  className="button small"
                  disabled={!!busy}
                  onClick={() =>
                    setConfirm({
                      id: r.id,
                      action: "collect",
                      label: "确认已在现场发出全部物料",
                    })
                  }
                >
                  <Check size={15} />
                  标记已领取
                </button>
              )}
              {["pending", "reserved"].includes(r.status) && (
                <button
                  className="text-button danger"
                  disabled={!!busy}
                  onClick={() =>
                    setConfirm({
                      id: r.id,
                      action: "cancel",
                      label: "取消这份预约并释放预留库存",
                    })
                  }
                >
                  取消预约
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="empty">
          <Ticket size={30} />
          <h3>这里还没有预约</h3>
          <p>分享活动链接，让喜欢的人找到你。</p>
        </div>
      )}
      {confirm && (
        <Modal
          title={confirm.label + "？"}
          close={() => {
            setConfirm(null);
            setErr("");
          }}
        >
          <div className="detail-body">
            <p>
              {confirm.action === "collect"
                ? "请先核对领取码和全部物料数量。标记后会转入已领取数量，第一版不支持撤销领取。"
                : confirm.action === "accept"
                  ? "确认时会再次检查所有物料的余量，成功后为这份互换预留库存。"
                  : "此操作会更新整份申请的状态，之后不能恢复原预约。"}
            </p>
            {err && <p className="error">{err}</p>}
            <button
              className="button full"
              disabled={!!busy}
              onClick={() => action(confirm.id, confirm.action)}
            >
              {busy ? "处理中…" : "确认操作"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
