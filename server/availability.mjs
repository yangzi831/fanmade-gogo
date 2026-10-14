export function closure(m, now = Date.now()) {
  if (!m.published) return "draft";
  if (m.deadline && Date.parse(m.deadline) <= now) return "deadline";
  if (m.paused) return "paused";
  return "";
}
