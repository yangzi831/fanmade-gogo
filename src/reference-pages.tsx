import { useEffect, useState, useRef, ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Compass,
  Gift,
  Heart,
  LoaderCircle,
  MapPin,
  NotebookPen,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import {
  api,
  categories,
  Creator,
  Event,
  MaterialEntry,
  Reservation,
} from "./api";
import { PublicMaterialCard } from "./material-ui";
import { FavoriteButton, useFavorites } from "./favorites";
import { useCatalog, MoreResults } from "./pagination";
import { thumbnail } from "./images";

export function useRemote<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    if (path)
      api<T>(path)
        .then((v) => live && setData(v))
        .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path, revision]);
  return { data, error, reload: () => setRevision((n) => n + 1) };
}
function Loading({ error }: { error?: string }) {
  return (
    <div className="ref-empty">
      {error || (
        <>
          <LoaderCircle className="spin" size={24} />
          <p>正在读取…</p>
        </>
      )}
    </div>
  );
}
export function Face({
  user,
  size = "",
}: {
  user: Pick<Creator, "nickname" | "avatar">;
  size?: string;
}) {
  return user.avatar ? (
    <img className={"ref-avatar " + size} src={user.avatar} alt="" />
  ) : (
    <span className={"ref-avatar fallback " + size}>
      {user.nickname.slice(0, 1)}
    </span>
  );
}
export function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null),
    closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'a[href],button:not(:disabled),input,select,textarea,[tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length);
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const before = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", fn);
    return () => {
      document.removeEventListener("keydown", fn);
      document.body.style.overflow = old;
      before?.focus();
    };
  }, []);
  return (
    <div
      className="ref-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ref-dialog"
      >
        <div className="row spread">
          <h2>{title}</h2>
          <button className="icon" aria-label="关闭" onClick={close} autoFocus>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function ReferenceHeader() {
  const { pathname } = useLocation(),
    managed = /^\/(manage|publish)/.test(pathname);
  const links = [
    {
      to: "/",
      name: "发现",
      Icon: Compass,
      active: pathname === "/" || /^\/(events|e\/|u\/|s\/)/.test(pathname),
    },
    {
      to: "/records",
      name: "记录",
      Icon: NotebookPen,
      active: pathname.startsWith("/records"),
    },
    {
      to: "/me",
      name: "我的",
      Icon: UserRound,
      active: pathname.startsWith("/me"),
    },
  ];
  const nav = links.map(({ to, name, Icon, active }) => (
    <Link
      to={to}
      key={to}
      className={active ? "active" : ""}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={22} />
      <span>{name}</span>
    </Link>
  ));
  return (
    <>
      <header className="header ref-header">
        <div className="header-inner">
          <Link to="/" className="ref-brand" aria-label="fanMade GoGo! 首页">
            <strong>fanMade GoGo!</strong>
            <small>Made by fans. Shared with fans.</small>
          </Link>
          <nav aria-label="主导航">{nav}</nav>
          <div className="ref-header-actions">
            <Link
              className="icon mobile-search"
              to={pathname === "/events" ? "/events?search=1" : "/?search=1"}
              aria-label="搜索物料、活动或制作人"
            >
              <Search />
            </Link>
            <Link
              className="button ref-publish"
              to="/publish"
              aria-label="发布物料"
            >
              <Plus size={21} />
              <span>发布物料</span>
            </Link>
          </div>
        </div>
      </header>
      {!managed && (
        <nav className="bottom-navigation ref-bottom" aria-label="手机主导航">
          {nav}
        </nav>
      )}
    </>
  );
}
function eventDate(e: Event) {
  return (
    e.date +
    (e.end_date && e.end_date !== e.date ? " — " + e.end_date.slice(5) : "")
  );
}
export function EventTile({ event: e }: { event: Event }) {
  return (
    <article className="ref-event-tile">
      <Link
        to={"/e/" + e.id}
        className={"ref-event-art " + (e.kind === "剧场" ? "theatre-art" : "")}
      >
        {e.poster ? (
          <img src={e.poster} alt={e.title + "海报"} />
        ) : (
          <>
            <span>{e.kind || "现场"}</span>
            <strong>{e.title}</strong>
            <small>
              {e.city} / {e.date}
            </small>
          </>
        )}
      </Link>
      <div className="row spread">
        <Link to={"/e/" + e.id}>
          <h3>{e.title}</h3>
        </Link>
        <FavoriteButton kind="event" id={e.id} label={e.title} />
      </div>
      <p>
        {e.city} · {e.venue}
      </p>
      <small>
        {eventDate(e)} · {e.session}
      </small>
      <div className="row spread event-tile-foot">
        <span>
          {e.ended
            ? "活动已结束"
            : `${e.creator_count || 0} 位制作人 · ${e.material_count || 0} 件物料`}
        </span>
        {!e.material_count && !e.ended && (
          <Link to={"/publish?event=" + e.id}>发布第一份物料 ↗</Link>
        )}
      </div>
    </article>
  );
}
function FeaturedBanner({
  events,
  theatre,
}: {
  events: Event[];
  theatre?: Event;
}) {
  const [poster, setPoster] = useState<Event | null>(null),
    e = events[0];
  if (!e) return null;
  return (
    <>
      <section className="ref-featured" aria-label="精选活动">
        <div className="can-banner">
          <div className="can-copy">
            <span className="banner-kicker">POST-ROCK / WENZHOU</span>
            <b className="can-display">
              CAN<span>Festival</span>
            </b>
            <h1>{e.title}</h1>
            <p>
              {eventDate(e)} · {e.city} · {e.venue}
            </p>
            <Link to={"/e/" + e.id}>
              找到同场的物料与乐迷 <ArrowRight size={19} />
            </Link>
          </div>
          {e.poster && (
            <button
              className="can-poster"
              onClick={() => setPoster(e)}
              aria-label="查看 CAN 完整海报"
            >
              <img src={e.poster} alt={e.title + "竖版海报"} />
              <span>查看完整海报 ↗</span>
            </button>
          )}
          <span className="banner-edition">FAN-MADE / GOOD MEMORIES</span>
        </div>
        {theatre && (
          <Link className="theatre-banner" to={"/e/" + theatre.id}>
            <img src="/assets/theatre.svg" alt="" />
            <div>
              <span>
                剧场，
                <br />
                总有下一次相遇。
              </span>
              <small>
                看看剧迷的纸上纪念 <ArrowRight size={16} />
              </small>
            </div>
          </Link>
        )}
      </section>
      {poster && (
        <Dialog title="活动海报" close={() => setPoster(null)}>
          <img
            className="full-poster"
            src={poster.poster}
            alt={poster.title + "完整海报"}
          />
          <Link className="button full" to={"/e/" + poster.id}>
            查看同场物料 <ArrowRight size={18} />
          </Link>
        </Dialog>
      )}
    </>
  );
}
export function ReferenceDiscover({
  activities = false,
}: {
  activities?: boolean;
}) {
  const [params] = useSearchParams(),
    tab = activities ? "events" : params.get("tab") || "materials";
  const [q, setQ] = useState(params.get("q") || ""),
    [kind, setKind] = useState("全部"),
    [filterOpen, setFilterOpen] = useState(false),
    [category, setCategory] = useState(""),
    [mode, setMode] = useState(""),
    [city, setCity] = useState(""),
    [date, setDate] = useState("");
  const materials = useCatalog<MaterialEntry>(
      tab === "materials"
        ? "/catalog/materials?" +
            new URLSearchParams({ q, kind, category, mode })
        : null,
    ),
    directory = useCatalog<Creator & { previews: MaterialEntry[] }>(
      tab === "creators"
        ? "/catalog/creators?" + new URLSearchParams({ q, kind })
        : null,
    ),
    featured = useRemote<Event[]>(
      tab === "materials" ? "/featured-events" : null,
    );
  const search = useCatalog<Event>(
    tab === "events"
      ? "/catalog/events?" +
          new URLSearchParams({
            q,
            kind,
            city,
            date,
            upcoming: q || city || date ? "0" : "1",
          })
      : null,
  );
  const searchVisible = params.has("search");
  const shown = materials.data,
    events = search.data,
    creators = directory.data;
  return (
    <div className="container reference-discover">
      <div className="discovery-toolbar">
        <div className="ref-tabs" aria-label="发现分类">
          <Link className={tab === "materials" ? "active" : ""} to="/">
            物料
          </Link>
          <Link className={tab === "events" ? "active" : ""} to="/events">
            活动
          </Link>
          <Link
            className={tab === "creators" ? "active" : ""}
            to="/?tab=creators"
          >
            制作人
          </Link>
        </div>
        <label
          className={"ref-search " + (searchVisible ? "search-expanded" : "")}
        >
          <Search size={20} />
          <input
            aria-label="搜索物料、活动或制作人"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索物料、活动或制作人"
            autoFocus={searchVisible}
          />
          {q && (
            <button
              className="icon"
              onClick={() => setQ("")}
              aria-label="清空搜索"
            >
              <X size={16} />
            </button>
          )}
        </label>
      </div>
      {tab === "materials" && !q && (
        <FeaturedBanner events={featured.data || []} theatre={undefined} />
      )}
      <div className="discovery-filters">
        <div className="ref-category-tabs" aria-label="活动类型">
          {["全部", "音乐节", "剧场", "演唱会", "活动", "其他"].map((v) => (
            <button
              key={v}
              className={kind === v ? "active" : ""}
              onClick={() => setKind(v)}
            >
              {v}
            </button>
          ))}
        </div>
        {tab !== "creators" && (
          <button
            className="filter-trigger"
            onClick={() => setFilterOpen(!filterOpen)}
            aria-expanded={filterOpen}
          >
            <SlidersHorizontal size={18} />
            <span>筛选</span>
            {(category || mode || city || date) && <i />}
          </button>
        )}
      </div>
      {filterOpen && tab !== "creators" && (
        <div className="ref-filter-panel">
          {tab === "events" ? (
            <>
              <label>
                城市
                <input
                  value={city}
                  placeholder="例如：温州"
                  onChange={(e) => setCity(e.target.value)}
                />
              </label>
              <label>
                活动日期
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                物料类型
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
              <label>
                领取方式
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="">全部方式</option>
                  <option value="free">免费领取</option>
                  <option value="swap">互换</option>
                </select>
              </label>
            </>
          )}
          <button
            className="text-button"
            onClick={() => {
              setKind("全部");
              setCategory("");
              setMode("");
              setCity("");
              setDate("");
            }}
          >
            重置筛选
          </button>
        </div>
      )}
      {tab === "materials" &&
        (!shown ? (
          <Loading error={materials.error} />
        ) : (
          <>
            <div className="material-grid ref-material-grid">
              {shown.map((v) => (
                <PublicMaterialCard key={v.material.id} {...v} />
              ))}
            </div>
            {!shown.length && (
              <div className="ref-empty">
                还没有找到这类物料，换个条件试试。
                <Link to="/publish" className="button outline">
                  发布你的物料
                </Link>
              </div>
            )}
          </>
        ))}
      {tab === "events" &&
        (!events ? (
          <Loading error={search.error} />
        ) : (
          <>
            <p className="directory-note">
              {q || city || date
                ? "搜索包含还没有物料的活动；核对城市、日期和场次后再发布。"
                : "优先展示尚未结束、已有公开物料的活动。搜索可以找到所有已收录活动。"}
            </p>
            <div className="ref-event-grid">
              {events.map((e) => (
                <EventTile key={e.id} event={e} />
              ))}
            </div>
            {!events.length && (
              <div className="ref-empty">
                没有找到活动。
                <Link className="button outline" to="/publish">
                  发布物料时添加活动
                </Link>
              </div>
            )}
          </>
        ))}
      {tab === "creators" &&
        (!creators ? (
          <Loading error={directory.error} />
        ) : (
          <div className="ref-creator-grid">
            {creators.map((c) => (
              <article className="ref-creator-tile" key={c.id}>
                <div className="row spread">
                  <Link className="row" to={"/u/" + c.username}>
                    <Face user={c} />
                    <strong>{c.nickname}</strong>
                  </Link>
                  <FavoriteButton kind="creator" id={c.id} label={c.nickname} />
                </div>
                <p>{c.bio}</p>
                <Link className="creator-preview-strip" to={"/u/" + c.username}>
                  {c.previews.map((v) => (
                    <img
                      key={v.material.id}
                      src={thumbnail(v.material.image)}
                      loading="lazy"
                      decoding="async"
                      alt={v.material.name}
                    />
                  ))}
                </Link>
                <Link className="text-button" to={"/u/" + c.username}>
                  查看公开物料主页 <ArrowRight size={16} />
                </Link>
              </article>
            ))}
            {!creators.length && <p className="ref-empty">没有找到制作人。</p>}
          </div>
        ))}
      <MoreResults
        feed={
          tab === "materials"
            ? materials
            : tab === "events"
              ? search
              : directory
        }
      />
    </div>
  );
}
type MyProps = {
  user: Creator;
  edit: () => void;
  share: ReactNode;
  logout: () => void;
};
export function ReferenceMy({ user, edit, share, logout }: MyProps) {
  const materials = useRemote<MaterialEntry[]>(
      "/materials?username=" + user.username,
    ),
    records = useRemote<Reservation[]>("/account/records?direction=sent"),
    saved = useFavorites();
  const previews = materials.data?.slice(0, 3) || [],
    pending = records.data?.filter((r) => r.status === "pending").length;
  return (
    <div className="container reference-my">
      <h1 className="mobile-page-title">我的</h1>
      <div className="my-reference-layout">
        <div className="my-primary">
          <section className="ref-profile">
            <Face user={user} size="large" />
            <div>
              <h1>{user.nickname}</h1>
              <p>{user.bio || "把喜欢做成小东西，现场见。"}</p>
              {user.demo && (
                <small className="demo-label">演示账号 · 操作真实保存</small>
              )}
              <div className="profile-buttons">
                <button className="button outline" onClick={edit}>
                  <Pencil size={17} />
                  编辑资料
                </button>
                {share}
              </div>
            </div>
          </section>
          <section className="ref-manage-panel">
            <Link to="/manage" className="manage-panel-heading">
              <div className="manage-folder">
                <Package size={36} />
              </div>
              <div>
                <h2>管理我的物料</h2>
                <p>发布、编辑、数量与领取申请</p>
              </div>
              {pending !== undefined && (
                <span className="pending-badge">
                  <b>{pending}</b> 条待处理申请{pending > 0 && <i />}
                </span>
              )}
              <strong className="manage-enter">
                进入管理 <ArrowRight size={20} />
              </strong>
              <ChevronRight className="manage-mobile-arrow" size={18} />
            </Link>
            {materials.error ? (
              <p className="fine-print">{materials.error}</p>
            ) : previews.length ? (
              <Link
                to="/manage"
                className="manage-preview-strip"
                aria-label="进入物料管理"
              >
                {previews.map((v) => (
                  <img
                    key={v.material.id}
                    src={v.material.image}
                    alt={v.material.name}
                  />
                ))}
              </Link>
            ) : (
              <Link className="first-publish" to="/publish">
                <Plus size={22} />
                添加第一件物料
              </Link>
            )}
          </section>
          <div className="ref-my-entries">
            <Link to="/records">
              <RefreshCw />
              <b>领取与交换记录</b>
              <span>我领取的，以及我发出的</span>
              <ChevronRight size={18} />
            </Link>
            <Link to="/me/saved">
              <Heart />
              <b>我的收藏</b>
              <span>收藏的物料、活动和制作人</span>
              <ChevronRight size={18} />
            </Link>
            <Link to="/me/saved?tab=events">
              <Ticket />
              <b>关注的活动</b>
              <span>保存感兴趣的演出与相遇</span>
              <ChevronRight size={18} />
            </Link>
            <button onClick={edit}>
              <Settings2 />
              <b>账号设置</b>
              <span>修改头像、昵称和简介</span>
              <ChevronRight size={18} />
            </button>
          </div>
          <button className="text-button signout" onClick={logout}>
            退出登录
          </button>
        </div>
        <aside className="my-secondary">
          <section>
            <div className="ref-section-heading">
              <h2>我的公开物料</h2>
              <Link to={"/u/" + user.username}>
                查看主页 <ArrowRight size={18} />
              </Link>
            </div>
            {materials.data ? (
              <div className="my-public-grid">
                {previews.map((v) => (
                  <PublicMaterialCard key={v.material.id} {...v} />
                ))}
              </div>
            ) : (
              <Loading error={materials.error} />
            )}{" "}
            {!!materials.data && !previews.length && (
              <div className="ref-empty">
                作品还在准备中。<Link to="/publish">发布第一份物料 →</Link>
              </div>
            )}
          </section>
          <section className="my-followed-events">
            <div className="ref-section-heading">
              <h2>关注的活动</h2>
              <Link to="/me/saved?tab=events">
                查看更多 <ArrowRight size={18} />
              </Link>
            </div>
            <div className="ref-event-grid">
              {saved.data.events.slice(0, 2).map((e) => (
                <EventTile key={e.id} event={e} />
              ))}
            </div>
            {!saved.data.events.length && (
              <div className="ref-empty small-empty">
                {saved.error || "在活动卡片上点爱心，把下一场保存在这里。"}
                <Link to="/events">去看看活动 →</Link>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
export function ReferenceSaved() {
  const { data, ready, error } = useFavorites(),
    [params] = useSearchParams(),
    [tab, setTab] = useState(params.get("tab") || "materials");
  return (
    <div className="container ref-saved">
      <Link className="back" to="/me">
        <ArrowLeft size={18} />
        返回我的
      </Link>
      <h1>我的收藏</h1>
      <div className="ref-tabs saved-tabs">
        {[
          ["materials", "物料"],
          ["events", "关注的活动"],
          ["creators", "制作人"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={id === tab ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!ready || error ? (
        <Loading error={error} />
      ) : (
        <>
          {tab === "materials" && (
            <div className="material-grid ref-material-grid">
              {data.materials.map((v) => (
                <PublicMaterialCard key={v.material.id} {...v} />
              ))}
            </div>
          )}
          {tab === "events" && (
            <div className="ref-event-grid">
              {data.events.map((e) => (
                <EventTile key={e.id} event={e} />
              ))}
            </div>
          )}
          {tab === "creators" && (
            <div className="ref-creator-grid">
              {data.creators.map((c) => (
                <article className="ref-creator-tile" key={c.id}>
                  <div className="row spread">
                    <Link className="row" to={"/u/" + c.username}>
                      <Face user={c} />
                      <b>{c.nickname}</b>
                    </Link>
                    <FavoriteButton
                      kind="creator"
                      id={c.id}
                      label={c.nickname}
                    />
                  </div>
                  <p>{c.bio}</p>
                  <Link to={"/u/" + c.username}>打开公开物料主页 →</Link>
                </article>
              ))}
            </div>
          )}
          {!data[tab as "materials" | "events" | "creators"]?.length && (
            <div className="ref-empty">
              这里还没有收藏。
              <Link
                className="button outline"
                to={tab === "events" ? "/events" : "/"}
              >
                去发现
              </Link>
            </div>
          )}
          <p className="directory-note">
            下架内容暂不展示；收藏只保存链接，不占用库存。“关注的活动”不发送通知。
          </p>
        </>
      )}
    </div>
  );
}
const stateName = (r: Reservation) =>
  r.status === "pending"
    ? "待确认"
    : r.status === "reserved"
      ? r.kind === "swap"
        ? "待交换"
        : "待领取"
      : r.status === "collected"
        ? r.kind === "swap"
          ? "已交换"
          : "已领取"
        : r.status === "rejected"
          ? "已拒绝"
          : "已取消";
const when = (s: string) =>
  new Date(s).toLocaleString("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
function Counterparty({ r, sent }: { r: Reservation; sent: boolean }) {
  const u = sent
    ? { nickname: r.nickname, avatar: r.recipient?.avatar || "" }
    : r.creator;
  return (
    <div className="record-person">
      <Face user={u} />
      <div>
        <b>{u.nickname}</b>
        <small>{when(r.created_at)}</small>
      </div>
    </div>
  );
}
export function RecordDetail({
  record: r,
  user,
  notify,
  onChange,
}: {
  record: Reservation;
  user: Creator;
  notify: (s: string) => void;
  onChange: () => void;
}) {
  const sent = r.creator_id === user.id,
    [confirm, setConfirm] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setConfirm(null);
    setError("");
  }, [r.id]);
  const labels: Record<string, string> = {
    collect: r.kind === "swap" ? "确认已交换" : "确认已领取",
    accept: "接受互换并预留库存",
    reject: "拒绝互换申请",
    cancel: "取消预约并释放预留",
  };
  async function action() {
    setBusy(true);
    setError("");
    try {
      await api(
        sent
          ? `/admin/reservations/${r.id}/${confirm}`
          : `/account/records/${r.id}/cancel`,
        {},
      );
      setConfirm(null);
      notify("交接状态已更新");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ref-record-detail">
      <h2>{r.kind === "swap" ? "互换详情" : "预约详情"}</h2>
      <span className={"record-detail-status status " + r.status}>
        {r.status === "reserved" ? "物料已预留，等待现场交接" : stateName(r)}
      </span>
      <div className="pickup-code">
        <small>领取码</small>
        <strong>{r.code}</strong>
      </div>
      <h2>{r.event.personal ? "日常物料" : r.event.title}</h2>
      <div className="record-meeting">
        <MapPin size={18} />
        <div>
          <b>{r.event.personal ? "与发布者约定交接" : r.event.location}</b>
          <p>
            {r.event.instructions || "现场交接，请提前核对双方的时间和地点。"}
          </p>
        </div>
      </div>
      <div className="detail-part">
        <h3>物料清单</h3>
        {r.items.map((i) => (
          <div className="detail-material" key={i.material_id}>
            <img src={i.image || "/assets/notes.svg"} alt={i.name} />
            <div>
              <b>{i.name}</b>
              <p>× {i.quantity}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="detail-part">
        <h3>{sent ? "申请人备注" : "我的备注"}</h3>
        <p className="preserve-lines">{r.note || "没有填写备注"}</p>
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
          <div className="record-exchange">
            <b>提供的互换物料</b>
            <p>{r.exchange.offer}</p>
            {r.exchange.image && (
              <a href={r.exchange.image} target="_blank" rel="noreferrer">
                <img src={r.exchange.image} alt="私密互换物料图片" />
              </a>
            )}
          </div>
        )}
      </div>
      <div className="detail-part">
        <Counterparty r={r} sent={sent} />
        {sent && <p className="private-contact">联系方式：{r.contact}</p>}
        <small className="subtle">
          提交时间　{new Date(r.created_at).toLocaleString("zh-CN")}
        </small>
      </div>
      <div className="record-detail-actions">
        {sent && r.status === "pending" && (
          <>
            <button className="button" onClick={() => setConfirm("accept")}>
              接受互换
            </button>
            <button
              className="button outline"
              onClick={() => setConfirm("reject")}
            >
              拒绝
            </button>
          </>
        )}
        {sent && r.status === "reserved" && (
          <button className="button" onClick={() => setConfirm("collect")}>
            <Check size={17} />
            {r.kind === "swap" ? "标记已交换" : "标记已领取"}
          </button>
        )}
        {["pending", "reserved"].includes(r.status) && (
          <button
            className="button outline"
            onClick={() => setConfirm("cancel")}
          >
            取消预约
          </button>
        )}
        <Link className="button outline" to={"/u/" + r.creator.username}>
          查看发布者主页 <ArrowRight size={16} />
        </Link>
      </div>
      {confirm && (
        <Dialog
          title={labels[confirm] + "？"}
          close={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p>
            {confirm === "collect"
              ? "请核对领取码及所有物料数量。完成后预留转为已送出，不能重复扣减或撤销。"
              : confirm === "accept"
                ? "后台会再次检查全部物料的可用数量，全部足够才会接受并预留。"
                : "操作将更新整份申请。取消或拒绝会释放已预留数量。"}
          </p>
          {error && <p className="error">{error}</p>}
          <button className="button full" disabled={busy} onClick={action}>
            {busy ? "正在提交…" : "确认操作"}
          </button>
        </Dialog>
      )}
    </section>
  );
}
export function ReferenceRecords({
  user,
  notify,
}: {
  user: Creator;
  notify: (s: string) => void;
}) {
  const [params, setParams] = useSearchParams(),
    direction = params.get("direction") === "sent" ? "sent" : "received",
    sent = direction === "sent";
  const { data, error, reload } = useRemote<Reservation[]>(
      "/account/records?direction=" + direction,
    ),
    [filter, setFilter] = useState("all"),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState("");
  const filters = [
    ["all", "全部"],
    ["pending", "待确认"],
    ["reserved", "待交接"],
    ["collected", "已完成"],
    ["closed", "已取消"],
  ];
  const shown = data?.filter(
    (r) =>
      (filter === "all" ||
        r.status === filter ||
        (filter === "closed" &&
          ["cancelled", "rejected"].includes(r.status))) &&
      [
        r.code,
        r.nickname,
        r.creator.nickname,
        r.event.title,
        ...r.items.map((i) => i.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const detail = shown?.find((r) => r.id === selected) || shown?.[0];
  return (
    <div className="container reference-records">
      <div className="records-title">
        <h1>领取与交换记录</h1>
        <label className="ref-search">
          <Search size={19} />
          <input
            aria-label="搜索记录"
            placeholder="搜索物料、活动或领取码"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>
      <div className="ref-tabs record-direction">
        <button
          className={!sent ? "active" : ""}
          onClick={() => {
            setParams({ direction: "received" });
            setSelected("");
          }}
        >
          我领取的
        </button>
        <button
          className={sent ? "active" : ""}
          onClick={() => {
            setParams({ direction: "sent" });
            setSelected("");
          }}
        >
          我发出的
          {sent && !!data?.filter((r) => r.status === "pending").length && (
            <small className="tab-count">
              {data.filter((r) => r.status === "pending").length}
            </small>
          )}
        </button>
      </div>
      <div className="records-board">
        <div className="records-list-column">
          <div className="record-state-tabs">
            {filters.map(([id, label]) => (
              <button
                className={filter === id ? "active" : ""}
                key={id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
            <button aria-label="刷新记录" className="icon" onClick={reload}>
              <RefreshCw size={17} />
            </button>
          </div>
          {!shown ? (
            <Loading error={error} />
          ) : (
            <div className="ref-record-list">
              {shown.map((r) => (
                <article
                  className={
                    "ref-record-card " + (detail?.id === r.id ? "selected" : "")
                  }
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                >
                  <div className="row spread">
                    <Counterparty r={r} sent={sent} />
                    <span className={"status " + r.status}>{stateName(r)}</span>
                  </div>
                  <h2>{r.event.personal ? "日常物料" : r.event.title}</h2>
                  <div className="record-preview-items">
                    {r.items.slice(0, 3).map((i) => (
                      <div key={i.material_id}>
                        <img
                          src={i.image || "/assets/notes.svg"}
                          alt={i.name}
                        />
                        <p>
                          {i.name} × {i.quantity}
                        </p>
                      </div>
                    ))}
                    {r.items.length > 3 && (
                      <span>还有 {r.items.length - 3} 件</span>
                    )}
                  </div>
                  <div className="record-card-foot">
                    <span className="row">
                      {r.kind === "swap" ? (
                        <RefreshCw size={18} />
                      ) : (
                        <Gift size={18} />
                      )}{" "}
                      {r.kind === "swap" ? "物料互换" : "免费领取"}
                    </span>
                    <button
                      className="button outline desktop-record-button"
                      onClick={() => setSelected(r.id)}
                    >
                      查看详情 <ChevronRight size={17} />
                    </button>
                  </div>
                  <div className="mobile-record-code">
                    领取码 <strong>{r.code}</strong>
                  </div>
                  <Link
                    className="button outline mobile-record-button"
                    to={"/records/" + r.id}
                  >
                    查看详情 <ChevronRight size={17} />
                  </Link>
                </article>
              ))}
              {!shown.length && (
                <div className="ref-empty">
                  <NotebookPen size={30} />
                  <h3>这里还没有记录</h3>
                  <p>试试其他状态，或去发现喜欢的物料。</p>
                  <Link to="/" className="button outline">
                    去发现
                  </Link>
                </div>
              )}
            </div>
          )}
          <div className="record-legacy-help">
            <Link to="/lookup">用旧的专属查询链接打开记录 →</Link>
            <small>
              免登录预约需持原查询链接保存到账号，不按昵称或联系方式自动匹配。
            </small>
          </div>
        </div>
        <aside className="record-detail-column">
          {detail ? (
            <RecordDetail
              key={detail.id}
              record={detail}
              user={user}
              notify={notify}
              onChange={reload}
            />
          ) : (
            <div className="ref-empty">
              <Ticket size={30} />
              <p>选择记录，在这里查看详情。</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
export function ReferenceRecordPage({
  id,
  user,
  notify,
}: {
  id: string;
  user: Creator;
  notify: (s: string) => void;
}) {
  const { data, error, reload } = useRemote<Reservation>(
    "/account/records/" + id,
  );
  return (
    <div className="container reference-record-page">
      <Link className="back" to="/records">
        <ArrowLeft size={18} />
        返回记录
      </Link>
      {data ? (
        <RecordDetail
          record={data}
          user={user}
          notify={notify}
          onChange={reload}
        />
      ) : (
        <Loading error={error} />
      )}
    </div>
  );
}
