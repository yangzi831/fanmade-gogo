export function thumbnail(url: string) {
  // v=2 bypasses thumbnails that were cached while the Netlify function was
  // incorrectly sending WebP bytes as UTF-8 text. The server ignores v and
  // still serves the same generated thumbnail.
  return url.startsWith("/uploads/")
    ? url + (url.includes("?") ? "&" : "?") + "size=thumb&v=2"
    : url;
}
// Compress before sending so large phone photos don't consume upload bandwidth.
export async function compressUpload(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error("请使用 JPG、PNG 或 WebP 图片");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("请选择不超过 20 MB 的图片");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error("图片无法读取，请换一张图片");
    });
    if (img.width * img.height > 40_000_000)
      throw new Error("图片像素过大，请缩小后上传");
    const ratio = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器无法处理图片，请换浏览器重试");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("图片压缩失败，请重试"))),
        "image/webp",
        0.82,
      ),
    );
    if (blob.size > 5 * 1024 * 1024)
      throw new Error("压缩后的图片仍过大，请缩小后上传");
    return new File(
      [blob],
      "upload." + (blob.type === "image/webp" ? "webp" : "png"),
      { type: blob.type },
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
