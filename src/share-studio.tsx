import { useEffect, useState } from "react";
import { Creator, Event, Material, api } from "./api";
import { drawShareCard, palettes } from "./share-card";
export function ShareStudio({
  creator,
  event,
  materials,
  initialIds,
  allowSelection = false,
  existingPath,
  onClose,
}: {
  creator: Creator;
  event: Event;
  materials: Material[];
  initialIds?: string[];
  allowSelection?: boolean;
  existingPath?: string;
  onClose: () => void;
}) {
  const [scope, setScope] = useState(initialIds ? "selected" : "all"),
    [ids, setIds] = useState<string[]>(
      initialIds || materials.map((m) => m.id),
    );
  const [palette, setPalette] = useState<keyof typeof palettes>("sage"),
    [note, setNote] = useState(event.instructions || "按需预约，现场相见。"),
    [path, setPath] = useState(""),
    [image, setImage] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const selected =
    scope === "all" ? materials : materials.filter((m) => ids.includes(m.id));
  const selectionKey = scope + ":" + selected.map((m) => m.id).join(",");
  useEffect(() => {
    let live = true;
    setPath("");
    setImage("");
    setError("");
    async function prepare() {
      try {
        let next = "";
        if (existingPath && (scope === "all" || !allowSelection))
          next = existingPath;
        else if (scope === "all")
          next = event.personal
            ? `/u/${creator.username}/collection`
            : `/e/${event.id}/by/${creator.username}`;
        else if (selected.length === 1)
          next = event.personal
            ? `/u/${creator.username}/m/${selected[0].id}`
            : `/e/${event.id}/by/${creator.username}/m/${selected[0].id}`;
        else if (selected.length) {
          next = (
            await api("/admin/events/" + event.id + "/shares", {
              materialIds: selected.map((m) => m.id),
            })
          ).path;
        } else return;
        if (live) setPath(next);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    }
    void prepare();
    return () => {
      live = false;
    };
  }, [selectionKey, event.id, creator.username]);
  const url = path ? location.origin + path : "";
  useEffect(() => {
    let live = true;
    setImage("");
    if (url)
      drawShareCard({ creator, event, materials: selected, url, note, palette })
        .then((v) => {
          if (live) setImage(v);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [url, palette, note, selectionKey]);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("已复制");
    } catch {
      setMessage("浏览器不支持复制，请长按下方链接手动复制。");
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal wide-modal"
        role="dialog"
        aria-modal="true"
        aria-label="生成分享卡片"
      >
        <div className="modal-head">
          <h2>把这份喜欢，分享出去</h2>
          <button className="icon" aria-label="关闭分享" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="share-workspace">
          <div className="share-controls">
            <span className="eyebrow">MAKE A LITTLE INVITATION</span>
            <h3>分享哪份清单？</h3>
            <label className="field">
              <span>展示范围</span>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">
                  {existingPath ? "当前分享清单" : "本场完整清单"}
                </option>
                {(allowSelection || initialIds) && (
                  <option value="selected">勾选部分／单件物料</option>
                )}
              </select>
            </label>
            {scope === "selected" && (
              <div className="share-selection">
                {materials.map((m) => (
                  <label key={m.id}>
                    <input
                      type="checkbox"
                      disabled={!allowSelection}
                      checked={ids.includes(m.id)}
                      onChange={(e) =>
                        setIds(
                          e.target.checked
                            ? [...ids, m.id]
                            : ids.filter((id) => id !== m.id),
                        )
                      }
                    />
                    <img src={m.image || "/assets/notes.svg"} alt="" />
                    <span>{m.name}</span>
                  </label>
                ))}
              </div>
            )}
            <label className="field">
              <span>卡片配色</span>
              <select
                value={palette}
                onChange={(e) =>
                  setPalette(e.target.value as keyof typeof palettes)
                }
              >
                <option value="sage">草木绿</option>
                <option value="lilac">浅丁香</option>
                <option value="peach">暖杏色</option>
              </select>
            </label>
            <label className="field">
              <span>简短领取／互换说明</span>
              <textarea
                value={note}
                maxLength={100}
                rows={3}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p className="fine-print">
              卡片展示前 4
              件预览。数量是生成时快照；链接一直读取原物料最新库存。
            </p>
            {url && (
              <>
                <a
                  href={url}
                  className="copy-box"
                  target="_blank"
                  rel="noreferrer"
                >
                  {url}
                </a>
                <div className="share-actions">
                  <a
                    className={"button " + (!image ? "disabled" : "")}
                    href={image || undefined}
                    download="小小物料-分享卡片.png"
                    aria-disabled={!image}
                    onClick={(e) => {
                      if (!image) e.preventDefault();
                    }}
                  >
                    保存分享图片
                  </a>
                  <button
                    className="button outline"
                    onClick={() => void copy(url)}
                  >
                    复制分享链接
                  </button>
                  <button
                    className="button outline"
                    onClick={() =>
                      void copy(
                        `${creator.nickname}的「${event.title}」物料清单（${selected.length} 件）\n${note}\n${url}`,
                      )
                    }
                  >
                    复制分享文案
                  </button>
                </div>
              </>
            )}
            {(error || message) && (
              <p className={error ? "error" : "fine-print"} role="status">
                {error || message}
              </p>
            )}
            {!selected.length && (
              <p className="error">请至少选择一件已发布物料。</p>
            )}
            <p className="fine-print">
              手机浏览器可保存图片或长按预览。当前为本地地址时，二维码需同一网络可访问的站点地址；正式分享请在公网域名打开本站生成。
            </p>
          </div>
          <div className="share-preview">
            {image ? (
              <img src={image} alt="可保存的物料分享卡片" />
            ) : (
              <p>正在准备分享卡片…</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
