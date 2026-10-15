import { useEffect, useState } from "react";
import {
  Event,
  Material,
  api,
  upload,
  newRequestKey,
  categories,
  modes,
  materialStatus,
} from "./api";
type Editable = Omit<Material, "paused" | "published"> & {
  paused: boolean;
  published: boolean;
};
const empty = (): Editable => ({
  id: newRequestKey(),
  event_id: "",
  creator_id: "",
  name: "",
  description: "",
  image: "",
  mode: "free",
  total: 20,
  per_person: 1,
  reserved: 0,
  collected: 0,
  available: 20,
  category: "贴纸",
  size: "",
  medium: "",
  instructions: "",
  deadline: "",
  paused: false,
  published: false,
  closed_reason: "draft",
});

function StudioImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed)
    return (
      <div className={`${className} studio-image-placeholder`} role="img" aria-label={alt}>
        <span>{failed ? "图片暂时无法加载" : "上传图片后预览"}</span>
      </div>
    );
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}
function localTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function MaterialStudio({
  event,
  initial,
  onClose,
  onSaved,
  onChooseEvent,
  inline = false,
}: {
  event: Event;
  initial?: Material[];
  onClose: () => void;
  onSaved: () => void;
  onChooseEvent?: () => void;
  inline?: boolean;
}) {
  const [items, setItems] = useState<Editable[]>(() =>
    initial?.length
      ? initial.map((m) => ({
          ...m,
          paused: !!m.paused,
          published: !!m.published,
        }))
      : [empty()],
  );
  const [active, setActive] = useState(0),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState(false),
    [dirty, setDirty] = useState(false);
  const m = items[active];
  const [scopeLocked, setScopeLocked] = useState(!!initial?.length);
  function update(values: Partial<Editable>) {
    setItems((all) =>
      all.map((v, i) => (i === active ? { ...v, ...values } : v)),
    );
    setDirty(true);
    setMessage("");
  }
  async function save(publish: boolean) {
    setBusy(true);
    setError("");
    try {
      await api("/admin/events/" + event.id + "/materials/batch", {
        publish,
        items: items.map((m) => ({ ...m, paused: !!m.paused })),
      });
      setDirty(false);
      setScopeLocked(true);
      setItems((all) => all.map((m) => ({ ...m, published: publish })));
      if (publish) onSaved();
      else setMessage("草稿已保存到服务器，可以继续添加或稍后回来编辑。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (!dirty || window.confirm("尚有未保存的修改，确定离开？可先保存草稿。"))
      onClose();
  }
  return (
    <div className={inline ? "publish-inline" : "modal-backdrop"}>
      <section
        className="modal wide-modal studio-modal"
        role={inline ? undefined : "dialog"}
        aria-modal={inline ? undefined : true}
        aria-label="连续添加与编辑物料"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">YOUR MATERIAL STUDIO</span>
            <h2>一场现场，装下每份喜欢</h2>
          </div>
          <button
            className="icon"
            aria-label="关闭物料编辑"
            onClick={close}
            disabled={busy || uploading}
          >
            ×
          </button>
        </div>
        <div className="studio-event">
          <strong>{event.title}</strong>
          {!event.personal && (
            <span>
              {event.city} · {event.date} · {event.session} · {event.venue}
            </span>
          )}
          <small>
            {event.personal ? "日常物料 · 未关联活动" : "已关联共享活动"} ·
            库存由你独立管理
          </small>
          {onChooseEvent && (
            <button
              className="button outline small"
              type="button"
              onClick={onChooseEvent}
              disabled={busy || uploading || scopeLocked}
            >
              搜索／选择活动
            </button>
          )}
          {onChooseEvent && scopeLocked && (
            <small>
              已保存的这批物料固定属于此清单，避免跨活动复制库存。新活动请另行添加并分配实物数量。
            </small>
          )}
        </div>
        <div className="studio-items">
          {items.map((v, i) => (
            <button
              key={v.id}
              className={i === active ? "active" : ""}
              onClick={() => setActive(i)}
            >
              {String(i + 1).padStart(2, "0")} {v.name || "待命名物料"}
            </button>
          ))}
          <button
            onClick={() => {
              setItems([...items, empty()]);
              setActive(items.length);
              setDirty(true);
            }}
            disabled={items.length >= 50 || busy}
          >
            ＋ 连续添加一件
          </button>
        </div>
        <button
          className="button outline studio-preview-toggle"
          onClick={() => setPreview(!preview)}
        >
          {preview ? "返回编辑" : "切换发布前预览"}
        </button>
        <div className={"studio-workspace " + (preview ? "show-preview" : "")}>
          <form
            className="studio-fields"
            onSubmit={(e) => {
              e.preventDefault();
              void save(true);
            }}
          >
            <div className="studio-upload">
              <StudioImage src={m.image} alt="当前物料预览" />
              <label className="button outline">
                {uploading ? "上传中…" : "上传物料图片"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy || uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    setError("");
                    try {
                      update({ image: await upload(file) });
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
              <small>图片会完整展示 · JPG / PNG / WebP，最大 5 MB</small>
            </div>
            <label className="field">
              <span>物料名称 *</span>
              <input
                required
                maxLength={100}
                value={m.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>物料简介</span>
              <textarea
                rows={3}
                maxLength={3000}
                value={m.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </label>
            <div className="form-row">
              <label className="field">
                <span>物料类型</span>
                <select
                  value={m.category}
                  onChange={(e) => update({ category: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>领取方式</span>
                <select
                  value={m.mode}
                  onChange={(e) =>
                    update({ mode: e.target.value as Material["mode"] })
                  }
                >
                  <option value="free">免费领取</option>
                  <option value="swap">仅限互换</option>
                  <option value="both">领取与互换均可</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>总数量 *</span>
                <input
                  type="number"
                  min={m.reserved + m.collected}
                  max={100000}
                  required
                  value={m.total}
                  onChange={(e) => update({ total: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>每人限领 *</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={m.per_person}
                  onChange={(e) =>
                    update({ per_person: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>尺寸（选填）</span>
                <input
                  maxLength={100}
                  value={m.size}
                  onChange={(e) => update({ size: e.target.value })}
                  placeholder="例如：10 × 15 cm"
                />
              </label>
              <label className="field">
                <span>材质（选填）</span>
                <input
                  maxLength={100}
                  value={m.medium}
                  onChange={(e) => update({ medium: e.target.value })}
                  placeholder="例如：300g 纹理纸"
                />
              </label>
            </div>
            <label className="field">
              <span>这件物料的领取说明</span>
              <textarea
                rows={3}
                maxLength={3000}
                value={m.instructions}
                onChange={(e) => update({ instructions: e.target.value })}
                placeholder="留空时参考本场清单领取说明"
              />
            </label>
            <label className="field">
              <span>预约截止时间（选填，按当前设备时区）</span>
              <input
                type="datetime-local"
                value={localTime(m.deadline)}
                onChange={(e) =>
                  update({
                    deadline: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : "",
                  })
                }
              />
              <small>
                截止后停止新预约与新互换申请，已有预约保留。可清空或延后时间。
              </small>
            </label>
            <label className="consent">
              <input
                type="checkbox"
                checked={m.paused}
                onChange={(e) => update({ paused: e.target.checked })}
              />
              暂停接受新领取／互换申请
            </label>
            <p className="fine-print">
              总量包含已预留和已领取。保存草稿会将本次编辑的物料暂存为未公开；发布后才出现在活动页。
            </p>
            <div className="studio-bottom">
              <button
                type="button"
                className="button outline"
                disabled={busy || uploading}
                onClick={() => void save(false)}
              >
                保存全部为草稿
              </button>
              <button className="button" disabled={busy || uploading}>
                {busy ? "保存中…" : `发布本次 ${items.length} 件物料`}
              </button>
            </div>
          </form>
          <aside className="studio-live-preview">
            <span className="eyebrow">
              发布前预览 · {active + 1} / {items.length}
            </span>
            <article className="material-card">
              <div className="material-image">
                <StudioImage src={m.image} alt={m.name || "待命名物料"} />
              </div>
              <div className="material-info">
                <span className="pill">
                  {m.category} ·{" "}
                  {materialStatus({
                    ...m,
                    published: true,
                    available: m.total - m.reserved - m.collected,
                  })}
                </span>
                <h2>{m.name || "物料名称"}</h2>
                <p>{m.description || "物料背后的故事，等你来写。"}</p>
                <p className="subtle">
                  {[m.size, m.medium].filter(Boolean).join(" · ")}
                </p>
                <p>
                  {m.instructions || event.instructions || "领取说明稍后补充"}
                </p>
                <strong>
                  {modes[m.mode]} · 可预约 {m.total - m.reserved - m.collected}{" "}
                  份
                </strong>
                {m.deadline && (
                  <p className="fine-print">
                    截止：{new Date(m.deadline).toLocaleString("zh-CN")}
                  </p>
                )}
              </div>
            </article>
          </aside>
        </div>
        {(error || message) && (
          <p
            className={"studio-message " + (error ? "error" : "")}
            role="status"
          >
            {error || message}
          </p>
        )}
      </section>
    </div>
  );
}

type Handoff = {
  id: string;
  kind: string;
  nickname: string;
  contact: string;
  location: string;
  note: string;
  created_at: string;
  items: { name: string; quantity: number }[];
};
export function ManualHandoffs({
  event,
  materials,
  onChange,
}: {
  event: Event;
  materials: Material[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState<"free" | "swap">("free"),
    [quantities, setQuantities] = useState<Record<string, number>>({}),
    [rows, setRows] = useState<Handoff[] | null>(null),
    [stock, setStock] = useState(materials),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [requestKey, setRequestKey] = useState(newRequestKey);
  async function load() {
    try {
      setRows(await api("/admin/events/" + event.id + "/handoffs"));
      setStock(await api("/admin/events/" + event.id + "/materials"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <button
        className="button outline small"
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        手动登记发放／互换
      </button>
      {open && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="现场手动登记"
          >
            <div className="modal-head">
              <h2>现场手动登记</h2>
              <button
                className="icon"
                aria-label="关闭登记"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  onChange();
                }}
              >
                ×
              </button>
            </div>
            <form
              className="editor-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  await api("/admin/events/" + event.id + "/handoffs", {
                    requestKey,
                    kind,
                    items: Object.entries(quantities)
                      .filter(([, n]) => n > 0)
                      .map(([materialId, quantity]) => ({
                        materialId,
                        quantity,
                      })),
                    nickname: f.get("nickname"),
                    contact: f.get("contact"),
                    location: f.get("location"),
                    note: f.get("note"),
                  });
                  setRequestKey(newRequestKey());
                  setQuantities({});
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p className="fine-print">
                仅登记已当面交付、没有线上预约的物料。已有预约请到“我的预约与互换”标记领取。只能使用未预留库存；暂停或截止不影响现场登记。
              </p>
              <label className="field">
                <span>发放方式</span>
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as "free" | "swap");
                    setQuantities({});
                    setRequestKey(newRequestKey());
                  }}
                >
                  <option value="free">免费发放</option>
                  <option value="swap">当面互换</option>
                </select>
              </label>
              <div className="handoff-materials">
                {stock
                  .filter(
                    (m) =>
                      m.published && (m.mode === kind || m.mode === "both"),
                  )
                  .map((m) => (
                    <label key={m.id}>
                      <span>
                        {m.name}
                        <small>未预留 {m.available} 份</small>
                      </span>
                      <input
                        aria-label={m.name + "发放数量"}
                        type="number"
                        min={0}
                        max={m.available}
                        value={quantities[m.id] || 0}
                        onChange={(e) => {
                          setQuantities({
                            ...quantities,
                            [m.id]: Number(e.target.value),
                          });
                          setRequestKey(newRequestKey());
                        }}
                      />
                    </label>
                  ))}
              </div>
              <div className="form-row">
                <label className="field">
                  <span>对方昵称（选填）</span>
                  <input name="nickname" maxLength={40} />
                </label>
                <label className="field">
                  <span>联系方式（选填，不公开）</span>
                  <input name="contact" maxLength={150} />
                </label>
              </div>
              <label className="field">
                <span>交接地点（选填）</span>
                <input name="location" maxLength={200} />
              </label>
              <label className="field">
                <span>备注／收到的互换物料</span>
                <textarea name="note" maxLength={1000} rows={2} />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button full"
                disabled={busy || !Object.values(quantities).some((n) => n > 0)}
              >
                {busy ? "登记中…" : "确认已交付并记账"}
              </button>
              <h3 className="handoff-heading">我的现场登记</h3>
              {rows?.length === 0 && <p className="subtle">暂无登记记录</p>}
              {rows?.map((r) => (
                <article className="handoff-row" key={r.id}>
                  <strong>
                    {r.kind === "swap" ? "当面互换" : "免费发放"} ·{" "}
                    {r.nickname || "现场同好"}
                  </strong>
                  <p>
                    {r.items.map((i) => i.name + " ×" + i.quantity).join("、")}
                  </p>
                  <small>
                    {[
                      r.contact,
                      r.location,
                      r.note,
                      new Date(r.created_at).toLocaleString("zh-CN"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </article>
              ))}
            </form>
          </section>
        </div>
      )}
    </>
  );
}
