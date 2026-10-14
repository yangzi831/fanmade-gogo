import sharp from "sharp";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Problem } from "./rules.mjs";

// Own image processing keeps the free deployment independent of paid image APIs.
export async function prepareImage(bytes) {
  try {
    const input = sharp(bytes, {
      limitInputPixels: 40_000_000,
      animated: false,
    });
    const meta = await input.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format) || (meta.pages || 1) > 1)
      throw new Error("Unsupported image");
    const full = await input
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    const thumb = await sharp(full)
      .resize({
        width: 480,
        height: 480,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 76 })
      .toBuffer();
    if (full.length > 2 * 1024 * 1024)
      throw new Error("Image too large after compression");
    const dimensions = await sharp(full).metadata();
    return { full, thumb, width: dimensions.width, height: dimensions.height };
  } catch {
    throw new Problem(
      400,
      "图片无法处理：请使用有效的静态 JPG、PNG 或 WebP 图片（不超过 5 MB、4000 万像素）",
    );
  }
}
export const thumbName = (name) =>
  name.replace(/\.(jpg|png|webp)$/, "-thumb.webp");
export function diskImageStore(directory) {
  return {
    async put(name, bytes) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, name), bytes);
    },
    async get(name) {
      try {
        return await readFile(join(directory, name));
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
    async remove(name) {
      await unlink(join(directory, name)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    },
  };
}
