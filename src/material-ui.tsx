import { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Material,
  Creator,
  Event,
  materialStatus,
  materialClosure,
  modes,
} from "./api";
import { FavoriteButton } from "./favorites";
import { thumbnail } from "./images";
export function PublicMaterialCard({
  material: m,
  creator,
  detailPath,
  children,
  event,
}: {
  material: Material;
  creator: Creator;
  detailPath: string;
  children?: ReactNode;
  event?: Event | null;
}) {
  return (
    <article className="material-card public-material">
      <Link className="material-image" to={detailPath}>
        <img
          src={thumbnail(m.image || "/assets/notes.svg")}
          alt={m.name}
          loading="lazy"
          decoding="async"
        />
        <span className="material-category">{m.category}</span>
        <span
          className={
            "material-state " +
            (materialClosure(m) || m.available <= 0 ? "inactive" : "")
          }
        >
          {materialStatus(m)}
        </span>
      </Link>
      <div className="material-info">
        <Link className="text-title" to={detailPath}>
          {m.name}
        </Link>
        <p className="material-excerpt">{m.description}</p>
        <div className="card-creator">
          {creator.avatar ? (
            <img src={creator.avatar} alt="" />
          ) : (
            <span className="avatar fallback">
              {creator.nickname.slice(0, 1)}
            </span>
          )}
          <Link to={"/u/" + creator.username}>{creator.nickname}</Link>
          <FavoriteButton kind="material" id={m.id} label={m.name} />
        </div>
        {event && (
          <Link className="card-event" to={"/e/" + event.id}>
            {event.title}
          </Link>
        )}
        <div className="material-bottom">
          <span>
            <em>{materialStatus(m)}</em> · 剩余 <b>{m.available}</b>
            <small>
              已{m.mode === "swap" ? "交换" : "送出"} {m.collected} · 限领{" "}
              {m.per_person} 份
            </small>
          </span>
          {children}
        </div>
      </div>
    </article>
  );
}
export function MaterialFacts({ material: m }: { material: Material }) {
  return (
    <>
      <span className="pill">
        {m.category} · {materialStatus(m)}
      </span>
      <p className="subtle">
        {modes[m.mode]} · 当前可预约 {m.available} 份 · 每人限 {m.per_person} 份
      </p>
      {(m.size || m.medium) && (
        <p>{[m.size, m.medium].filter(Boolean).join(" · ")}</p>
      )}
      {m.deadline && (
        <p className="fine-print">
          预约截止：{new Date(m.deadline).toLocaleString("zh-CN")}
        </p>
      )}
      {m.instructions && (
        <div className="instructions">
          <p>{m.instructions}</p>
        </div>
      )}
    </>
  );
}
