# 免费多人试用（2026-10-14 核对）

优先方案为 **Supabase Free + Netlify Free**。网页与现有 Express 后台在 Netlify 运行；账号、会话、活动、库存、预约和收藏在 Supabase PostgreSQL 持久化；上传图片在 Supabase 私有 Storage 持久化。不是仅图片空间免费。云端适配已完成本地兼容性验证，用户已创建 fanmade-gogo（Singapore），真实数据库、私有存储和双账号验证已通过；详见 [CLOUD_VERIFICATION.md](CLOUD_VERIFICATION.md)。尚未部署公网站点、未购买付费服务。

| 方案 | 免费额度与完整服务范围 | 暂停、到期、超额及当前限制 |
| --- | --- | --- |
| Supabase Free + Netlify Free（优先） | Supabase 数据库 500 MB/项目、图片 1 GB、未缓存出网 5 GB/月、缓存出网另 5 GB/月，最多 2 个活跃免费项目；另含 Auth 5 万 MAU、Edge Functions 50 万次/月。本项目保留现有账号体系，账号和会话存在 SQL 数据库，API 用 Netlify Node 云函数。Netlify 新 Free 计划每月共 300 credits，正式部署、网页请求、流量、函数计算共用，含静态站和免费 HTTPS 子域名。 | Supabase 一周低活动可能暂停，需 Resume；最新官方恢复窗口为 1 年，旧的 90 天规则已不适合作为当前依据。超额先通知／宽限，持续超额可能暂停、只读或 402，Free 不自动变成付费。Netlify Free 额度用完会暂停同团队项目与部署，待新账期或主动升级。免费不含 Supabase 自动备份、图片变换和 SLA；本站自做压缩，无需付费图片服务。 |
| CloudBase 免费体验版 | 每账号 1 个环境，3000 资源点/月由数据库、计算、存储、流量等共同消耗。含静态托管、云函数、数据库、存储和基础认证；上海可用云托管，新加坡不含云托管。不是每项单独获得 3000 点。 | 一次手动续期 6 个月，到期前一个月内办理，不自动续。免费不能加购资源包或开按量付费。体验函数固定 3 秒、256 MB，现有密码计算／图片处理可能超时；体验自定义域名额度为 0，QPS 为体验共享资源。云托管更兼容 Node，但容器临时盘仍不能放业务 SQLite。小程序发布另有上线后第 15 天到期、隔离后未转付费销毁的规则，后续不能默认沿用网页试用期限。未在控制台开通或实测。 |
| Cloudflare 静态托管 + Workers Free + D1 + R2 | 静态资源请求免费；Workers 10 万动态请求/天、10 ms CPU/次；D1 500 万行读/天、10 万行写/天、总存储 5 GB（单库限制另算）；R2 Standard 10 GB-month、100 万 A 类操作/月、1000 万 B 类操作/月，自身出网免费。业务账号需自行实现或接外部认证。 | Workers/D1 免费日额度用完请求会失败，次日恢复。R2 是按量产品包含免费额度，超额会收费，可能需付款方式，不属于硬性零账单保护。没有一周闲置自动暂停规则不等于免费 SLA。当前同步 SQLite 事务、Node 上传与 sharp 不能直接移到 Workers；需要重写事务并重新验证并发，10 ms CPU 也不适合现有 bcrypt 和压缩。 |

Netlify 2025-09-04 前账号可能保留旧套餐，不能将旧 100 GB／300 构建分钟与新 300 credits 相加。当前 CLI 已识别到已登录账号，但团队套餐查询超时，**还未确认选定团队为 Free**；上线前必须核对 Billing。本轮不升级套餐、不添加付款方式、不打开充值、不在付费组织增加资源。

## 已加入的节省用量措施

- 上传前浏览器压至长边 1600 px；手机原图最多 20 MB，服务端接收最多 5 MB。后台再真实解码、旋转、去 EXIF，限制 4000 万像素，保存长边 1600 px 的 WebP，压缩结果最多 2 MB。
- 每张同时生成长边 480 px 缩略图，卡片使用缩略图并延迟加载。保持作品比例、不裁图，详情和分享用大图。旧图片无缩略图时兼容返回原图，旧图库未批量重新压缩。
- 缩略图沿用原图权限，私有桶不对匿名用户开放。草稿和互换图片仍经上传者／预约双方／私密查询凭证鉴权；私密响应不缓存。
- 发现的物料、活动、制作人由服务器过滤后分页，每次 24 条、最大 48 条，搜索延迟 250 ms 合并请求，制作人最多读取 3 张预览。旧兼容接口、单个活动／个人清单、管理与历史记录尚未全部分页。
- 若压缩图与缩略图合计平均 250 KB，1000 张约 250 MB，这是估算。图片转发可能同时消耗 Supabase 未缓存出网和 Netlify 流量／函数额度，不能只计算一端。

## 配置步骤

1. 已创建 fanmade-gogo（Singapore）；确认所在组织为 **Supabase Free**，不要选现有 Pro 组织。国内手机／微信访问海外免费服务的质量仍需实测。
2. 复制 `.env.cloud.example` 为 `.env.cloud`，填写项目 URL、服务端 Secret key、Connect → Session pooler 连接串，以及拥有者用户名和强密码。凭据只存在本地文件和托管平台 Functions 环境变量中，不发送到聊天或 GitHub，也不进入前端。
3. 运行 `npm run cloud:init`。在全新项目创建 `fanmade` SQL schema、启用 RLS、创建私有 `fanmade-images` 桶；在公开部署前创建拥有者管理员。已有账号不覆盖，收录 CAN 活动但不伪造物料。本地现有数据不自动上传。
4. 在 Netlify **Free 团队**导入私有仓库 `yangzi831/fanmade-gogo`，构建 `npm run build`，发布 `dist`；云函数和路由已经写在 `netlify.toml`。建议由 Git 在 Linux 构建，避免把 Windows 的 sharp 二进制直接部署到 Linux。
5. 在 Functions 范围配置 `DATABASE_URL`、`SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`SUPABASE_BUCKET`、`APP_ORIGIN`、`NODE_ENV=production`、`TRUST_PROXY=1`。`APP_ORIGIN` 必须匹配实际 HTTPS 试用域名。拥有者密码不必传给运行中的 Functions。
6. 两个不同浏览器／账号连接同一线上域名，验证预约、互换、取消、领取、私密权限和最后一份并发。重新部署后再次核对记录和图片保留，再给正式试用链接。

云端兼容层用 Node Worker 持有一个真实 PostgreSQL 连接，保留现有同步规则接口；同笔事务不会跨连接。库存写事务使用统一顺序的表写锁，适合小规模试用，后续规模变大应改异步数据库接口、细化行锁与集中限流。函数内存和 `/tmp` 不保存业务数据库或图片；超时后使用原幂等键重试，不能假定失败响应代表未提交。

**实际进度**：GitHub 私有仓库已创建；本地页面、压缩、分页及云配置已完成。PGlite 验证 PostgreSQL SQL 兼容和业务行为，不等于 Supabase 云端或跨实例测试。Supabase 连接、两个独立本机进程并发及重启持久化已通过，Netlify 冷启动、跨实例及重部署持久化仍待部署后验证，目前没有可称为已验收的公网链接。继续可用 `http://localhost:3001` 的真实 SQLite 后台；本地演示用户名为 `wuwei` / `xiaoyu`，密码 `Demo2026!share`，昵称“贴纸盒／徽章夹”。公开密码的演示管理员不自动迁到云端。

## 付费与另外配置项

核心注册、发布、领取、互换、图片处理和分享不需要付费。免费 HTTPS 子域名无需购域名；自购域名另计注册费用，前端自定义域名不需要买 Supabase API 自定义域名插件。不因低活动暂停、自动备份、PITR、更大资源额度与 SLA 需要付费。短信、邮件供应商及后续微信原生能力也不是套餐自动包含的功能。本轮未开通上述付费项。

Free 没有自动备份保障，应导出 SQL 数据及私有桶对象到自己的磁盘，备份不进 GitHub。平台额度目前手动查看，自动预算告警未实现；没有用定时空请求规避暂停。

## 官方依据

- [Supabase 定价](https://supabase.com/pricing)、[暂停恢复](https://supabase.com/docs/guides/platform/free-project-pausing)、[超额规则](https://supabase.com/docs/guides/platform/billing-faq)
- [CloudBase 免费体验与资源点](https://cloud.tencent.com/document/product/876/127357)、[续期](https://cloudbase.cloud.tencent.com/blog/2026/07/28/cloudbase-free-trial-renewal)
- [Workers](https://developers.cloudflare.com/workers/platform/pricing/)、[D1](https://developers.cloudflare.com/d1/platform/pricing/)、[R2](https://developers.cloudflare.com/r2/pricing/)
- [Netlify 定价](https://www.netlify.com/pricing/)、[Free 暂停](https://www.netlify.com/pricing/personal-vs-free/)
