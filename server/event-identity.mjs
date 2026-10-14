import { createHash } from "node:crypto";
export const normalizeEventText = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
export const eventIdentity = (e) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        [e.title, e.city, e.date, e.session, e.venue].map(normalizeEventText),
      ),
    )
    .digest("hex");
export const hasEnded = (e, now = Date.now()) =>
  Date.parse(`${e.end_date || e.date}T${e.end_time || "23:59"}:00+08:00`) < now;
