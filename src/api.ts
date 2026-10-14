import { compressUpload } from "./images";
export type Creator = {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  bio: string;
  demo: boolean;
  is_admin: boolean;
};
export type Event = {
  id: string;
  owner_id: string;
  title: string;
  date: string;
  location: string;
  instructions: string;
  theme: string;
  published: number;
  demo: number;
  nickname?: string;
  username?: string;
  city: string;
  venue: string;
  session: string;
  end_date: string;
  end_time: string;
  ended?: boolean;
  material_count?: number;
  creator_count?: number;
  creator_username?: string;
  personal?: boolean | number;
  kind?: string;
  poster?: string;
  featured?: number;
};
export type Material = {
  id: string;
  event_id: string;
  creator_id: string;
  name: string;
  description: string;
  image: string;
  mode: "free" | "swap" | "both";
  total: number;
  per_person: number;
  reserved: number;
  collected: number;
  available: number;
  category: string;
  size: string;
  medium: string;
  instructions: string;
  deadline: string;
  paused: number | boolean;
  published: number | boolean;
  closed_reason: string;
};
export const categories = ["贴纸", "明信片", "徽章", "应援牌", "其他"];
export function materialClosure(m: Material) {
  return !m.published
    ? "draft"
    : m.deadline && Date.parse(m.deadline) <= Date.now()
      ? "deadline"
      : m.paused
        ? "paused"
        : "";
}
export function materialStatus(m: Material) {
  const closed = materialClosure(m);
  return closed === "draft"
    ? "草稿"
    : closed === "deadline"
      ? "已截止"
      : closed === "paused"
        ? "已暂停"
        : m.available <= 0
          ? "已领完"
          : m.mode === "free"
            ? "可领取"
            : m.mode === "swap"
              ? "可互换"
              : "领取 / 互换";
}
export type Reservation = {
  id: string;
  event_id: string;
  creator_id: string;
  creator: Creator;
  kind: "free" | "swap";
  status: string;
  nickname: string;
  contact: string;
  note: string;
  note_image: string;
  code: string;
  created_at: string;
  event: Event;
  items: {
    material_id: string;
    name: string;
    image: string;
    quantity: number;
  }[];
  exchange: { offer: string; image: string } | null;
  recipient?: Creator | null;
};
export type MaterialEntry = {
  material: Material;
  creator: Creator;
  event: Event | null;
  scopeId: string;
  detailPath: string;
};
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败，请稍后重试");
  return data;
}
export async function upload(file: File) {
  const data = new FormData();
  data.append("image", await compressUpload(file));
  const res = await fetch("/api/uploads", { method: "POST", body: data });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error);
  return result.url as string;
}
export const modes = {
  free: "免费领取",
  swap: "仅限互换",
  both: "领取 / 互换",
};
// getRandomValues also works on a plain HTTP LAN origin, unlike randomUUID.
export function newRequestKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const statuses: Record<string, string> = {
  pending: "等待确认",
  reserved: "已预留 · 待领取",
  collected: "已领取",
  cancelled: "已取消",
  rejected: "未通过互换",
};
export const dateLabel = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
