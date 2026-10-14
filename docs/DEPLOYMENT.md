# 部署与持久化

当前交付是完整本地应用与部署配置，未购买云服务、未创建公网站点。GitHub 可以保存源码，但不会承载业务数据库。最新零费用方案及云端适配见 [FREE_HOSTING.md](FREE_HOSTING.md)，下文保留持久化服务器作为备选。

## 共享活动版本升级

已有库首次启动会自动迁移至共享活动结构。部署前备份数据库与上传目录；先用一个服务实例启动并完成迁移，再启动其他进程。程序还会为非空旧库保存 `data/before-shared-events-时间戳.sqlite` 一致性快照。不要用 seed 或空库替换已有业务数据。

迁移将原最早注册的账号设为站点管理员（本地演示为 `wuwei`），其余账号为普通制作人；新正式空库的首个注册者为管理员，请由站点拥有者先完成注册。共享活动维护权限不授予他人预约的访问权。

旧活动的城市从地点文字初步拆分，场次默认“全天”，请在“管理全站活动库”核对名称、城市、日期、场地和实际场次。结构与兼容规则见 [SHARED_EVENTS.md](SHARED_EVENTS.md)。

本次物料工作台升级至数据库版本 2，自动增加物料类型、草稿、截止与暂停字段，以及现场登记和分享范围表。非空库生成 `before-material-studio-时间戳.sqlite` 快照，不覆盖原数据。备份后先以单实例启动完成迁移。

当前最新版本为 **6**：版本 3 增加预约账号归属与日常清单；版本 4 增加活动分类／海报／精选与账号收藏；版本 5 更新实用演示名称与分类；版本 6 增加私密备注图片及访客上传归属。升级分别保留 `before-unified-account-*` 和 `before-discovery-*` 快照。旧账号、预约、物料和库存不重置。收录本轮 CAN 海报活动可在先注册管理员后运行 `npm run feature:can`，无需 seed；精确场地地址与结束时间上线前请核对。

## 推荐：Linux 单服务器 + Docker + Caddy

所需外部资源仅为：一台带持久化磁盘的服务器、一个域名及 DNS。HTTPS 可以由 Caddy 免费自动申请。内存建议至少 1 GB，磁盘按图片规模准备。不需要托管数据库或短信服务。

1. 在服务器安装 Docker Engine、Compose 和 Caddy，复制或从 Git 仓库拉取本项目。
2. 域名 A/AAAA 记录指向服务器，放通 80、443。应用端口只监听宿主机回环地址。
3. 准备环境配置：

   ```sh
   cp .env.production.example .env.production
   # 编辑 APP_ORIGIN=https://你的真实域名，不带路径、端口外的后缀或末尾斜线
   docker compose --env-file .env.production up -d --build
   ```

4. 将 `docs/Caddyfile.example` 中域名替换为真实域名，装入 Caddy 配置并重载。
5. 打开 HTTPS 站点，注册真实制作人账号并创建活动。**不要在正式实例执行 seed，也不要复制本地演示 data 目录。**
6. 在 `/api/health` 确认健康状态，实际创建一次预约、核销、重启容器并验证数据保留。

Compose 使用 `materials-data` 命名卷保存 `/app/data`，包含数据库与上传图片。部署代码或重建容器不应删除此卷。**不要使用 `docker compose down -v`**，它会删除全部业务数据。

Dockerfile 已提供多阶段构建、非 root 运行、生产依赖安装。Compose 提供健康检查、退出重启与回环端口。当前交付环境未执行 Docker 构建；上线时需要在目标机器验证镜像与反向代理。

## 不使用 Docker

在 Node 22.10+ 的服务器执行 `npm ci && npm run build`。配置 `.env`：

```dotenv
NODE_ENV=production
PORT=3001
HOST=127.0.0.1
DATA_DIR=/srv/materials-data
APP_ORIGIN=https://materials.example.com
TRUST_PROXY=1
```

确认运行用户有数据目录写入权限。使用 systemd 等进程管理器运行 `npm start`，并用 Caddy/Nginx 代理到 3001。只有实际处于可信反向代理后面才启用 `TRUST_PROXY=1`。生产 Cookie 要求 HTTPS，因此不能以生产模式通过普通 HTTP 登录。

前端与 API 采用同一来源部署，不需要跨站 Cookie 或 CORS。`APP_ORIGIN` 必须精确匹配用户访问的来源，否则写入请求被拒绝。

## 备份和恢复

- 定期备份**整个数据卷**：SQLite 数据库、可能存在的 `-wal`/`-shm` 文件、uploads 图片目录。
- 简单且一致的方式是短暂停止应用，备份完整卷，再启动。不要运行中仅复制 SQLite 主文件。
- 备份包含联系方式和私密图片，应限制访问，做异地备份并定期验证恢复。
- 恢复到空卷且应用停止时进行，保持目录与文件权限；恢复完成后启动，检查 `/api/health`、物料图、预约数量及状态。
- 当前内置版本 1–6 的事务迁移；后续数据库表结构变更仍需附明确迁移逻辑，并先备份。

## 扩展路径

当前 SQLite 适合初版和单台服务器共享使用。事务在同一磁盘数据库的多进程间防止库存超额，但**不等于**支持跨区域多机部署。不应把 SQLite 放在不支持可靠文件锁的网络文件系统上。

需要水平扩容或无服务器部署时，先迁移到 PostgreSQL（事务中行锁或条件更新）、S3 兼容图片存储（签名读取私密附件）、集中会话/限流。当前已增加 Supabase PostgreSQL 与私有 Storage 适配；配置与实际验收步骤见 [SUPABASE_SETUP.md](SUPABASE_SETUP.md)，未填配置时仍不能称云端已接通。

普通静态站点托管只能放前端，不能单独满足当前身份、库存事务、图片权限与持久化需求。
