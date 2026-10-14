import { createClient } from "@supabase/supabase-js";
export function supabaseImageStore({
  url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY,
  bucket = process.env.SUPABASE_BUCKET || "fanmade-images",
} = {}) {
  if (!url || !key)
    throw new Error(
      "请配置 SUPABASE_URL 和 SUPABASE_SECRET_KEY（仅服务端使用）",
    );
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async put(name, bytes) {
      const { error } = await client.storage
        .from(bucket)
        .upload(name, bytes, { contentType: "image/webp", upsert: false });
      if (error)
        throw Object.assign(
          new Error("图片保存失败，请稍后重试（内容仍保留在表单中）"),
          { status: 503 },
        );
    },
    async get(name) {
      const { data, error } = await client.storage.from(bucket).download(name);
      if (error) {
        if (
          Number(error.statusCode) === 404 ||
          (Number(error.statusCode) === 400 && /not found/i.test(error.message))
        )
          return null;
        throw Object.assign(new Error("图片读取暂时失败，请重试"), {
          status: 503,
        });
      }
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(name) {
      const { error } = await client.storage.from(bucket).remove([name]);
      if (error) throw new Error("未能清理图片");
    },
  };
}
