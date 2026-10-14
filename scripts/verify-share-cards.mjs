// Decode real browser-downloaded PNG files, then inspect their public destinations.
// Usage: node scripts/verify-share-cards.mjs path/to/card.png [...]
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import assert from "node:assert/strict";

assert(process.argv.length > 2, "请提供从分享窗口保存的 PNG 文件路径");
for (const file of process.argv.slice(2)) {
  const png = PNG.sync.read(readFileSync(file));
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert(result, `${file}：未识别出二维码`);
  const url = new URL(result.data);
  const subset = url.pathname.match(/^\/s\/([a-f0-9]{32})$/);
  const creator = url.pathname.match(
    /^\/e\/([^/]+)\/by\/([^/]+)(?:\/m\/([^/]+))?$/,
  );
  assert(subset || creator, `${file}：必须指向公开清单或单件物料`);
  const endpoint = subset
    ? `/api/shares/${subset[1]}`
    : `/api/events/${creator[1]}/creators/${creator[2]}${creator[3] ? `/materials/${creator[3]}` : ""}`;
  const response = await fetch(new URL(endpoint, url.origin));
  assert(response.ok, `${file}：目标接口返回 ${response.status}`);
  const data = await response.json();
  assert(data.creator?.username && data.event?.id, "目标缺少活动或制作人信息");
  if (creator) {
    assert.equal(data.event.id, creator[1]);
    assert.equal(data.creator.username, creator[2]);
  }
  assert(!JSON.stringify(data).includes('"contact"'), "公开接口不应返回联系人");
  console.log(
    JSON.stringify(
      {
        file,
        size: `${png.width}×${png.height}`,
        url: url.href,
        event: data.event.title,
        creator: data.creator.username,
        materials: (data.materials || [data.material]).map((m) => m.name),
      },
      null,
      2,
    ),
  );
}
