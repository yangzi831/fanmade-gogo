import QRCode from "qrcode";
import { Creator, Event, Material, modes } from "./api";
export const palettes = {
  sage: { bg: "#f8f7ef", ink: "#244d3c", soft: "#e7eddf" },
  lilac: { bg: "#fbf7fb", ink: "#654769", soft: "#eee3ef" },
  peach: { bg: "#fff8f1", ink: "#9a5037", soft: "#f5e1d0" },
};
async function bitmap(src: string) {
  if (!src) return null;
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("图片加载失败，请检查网络后重新生成"));
    i.src = src;
  });
}
function fit(
  ctx: CanvasRenderingContext2D,
  i: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const s = Math.min(w / i.naturalWidth, h / i.naturalHeight);
  ctx.drawImage(
    i,
    x + (w - i.naturalWidth * s) / 2,
    y + (h - i.naturalHeight * s) / 2,
    i.naturalWidth * s,
    i.naturalHeight * s,
  );
}
function textLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  line: number,
  max = 2,
) {
  let current = "",
    rows = 0;
  for (const ch of text.replace(/\s+/g, " ")) {
    if (ctx.measureText(current + ch).width > width) {
      if (rows === max - 1) {
        while (ctx.measureText(current + "…").width > width)
          current = current.slice(0, -1);
        ctx.fillText(current + "…", x, y);
        return;
      }
      ctx.fillText(current, x, y);
      y += line;
      rows++;
      current = "";
    }
    current += ch;
  }
  ctx.fillText(current, x, y);
}
export async function drawShareCard({
  creator,
  event,
  materials,
  url,
  note,
  palette,
}: {
  creator: Creator;
  event: Event;
  materials: Material[];
  url: string;
  note: string;
  palette: keyof typeof palettes;
}) {
  const shown = materials.slice(0, 4),
    rows = Math.ceil(shown.length / 2),
    height = 940 + rows * 370;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const p = palettes[palette];
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, 1080, height);
  ctx.fillStyle = p.ink;
  ctx.fillRect(0, 0, 1080, 18);
  ctx.fillStyle = p.soft;
  ctx.fillRect(48, 52, 984, 300);
  const avatar = await bitmap(creator.avatar);
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(118, 126, 42, 0, Math.PI * 2);
    ctx.clip();
    fit(ctx, avatar, 76, 84, 84, 84);
    ctx.restore();
  }
  ctx.fillStyle = p.ink;
  ctx.font = "bold 32px sans-serif";
  textLines(ctx, creator.nickname, avatar ? 182 : 80, 120, 780, 40, 1);
  ctx.font = "22px sans-serif";
  ctx.fillText("@" + creator.username, avatar ? 182 : 80, 158);
  ctx.font = "bold 42px sans-serif";
  textLines(ctx, event.title, 80, 227, 900, 54, 1);
  ctx.font = "26px sans-serif";
  textLines(
    ctx,
    event.date + " · " + event.session + " · " + event.city,
    80,
    307,
    900,
    34,
    1,
  );
  ctx.font = "26px sans-serif";
  ctx.fillText("一份小小喜欢，等你来现场", 58, 405);
  for (let index = 0; index < shown.length; index++) {
    const m = shown[index],
      x = 48 + (index % 2) * 500,
      y = 450 + Math.floor(index / 2) * 370;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, 484, 344);
    const i = await bitmap(m.image || "/assets/notes.svg");
    if (i) fit(ctx, i, x + 16, y + 14, 452, 210);
    ctx.fillStyle = p.ink;
    ctx.font = "bold 28px sans-serif";
    textLines(ctx, m.name, x + 22, y + 260, 434, 33, 1);
    ctx.font = "22px sans-serif";
    ctx.fillText(
      `${m.category} · ${modes[m.mode]} · 余 ${m.available} 份`,
      x + 22,
      y + 310,
    );
  }
  const bottom = 450 + rows * 370;
  ctx.fillStyle = p.ink;
  ctx.font = "25px sans-serif";
  textLines(
    ctx,
    note || event.instructions || "按需预约，现场相见。",
    60,
    bottom + 32,
    920,
    37,
    2,
  );
  ctx.font = "22px sans-serif";
  ctx.fillText(
    materials.length > 4
      ? `展示 ${shown.length} / ${materials.length} 件，扫码查看完整清单`
      : `共 ${materials.length} 件物料，扫码查看与预约`,
    60,
    bottom + 135,
  );
  // Render QR at an integer module scale, including a four-module quiet zone.
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, {
    errorCorrectionLevel: "M",
    margin: 4,
    scale: 6,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrScale = Math.max(1, Math.floor(312 / qr.width));
  const qrSize = qr.width * qrScale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, 1008 - qrSize, bottom + 156, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;
  ctx.font = "bold 38px sans-serif";
  ctx.fillStyle = p.ink;
  ctx.fillText("小小物料", 60, bottom + 225);
  ctx.font = "24px sans-serif";
  ctx.fillText("因为喜欢，所以分享。", 60, bottom + 270);
  ctx.font = "20px sans-serif";
  ctx.fillText("扫码打开对应物料清单", 60, bottom + 316);
  ctx.fillText("数量为生成时快照，网页以实时库存为准", 60, height - 34);
  return canvas.toDataURL("image/png");
}
