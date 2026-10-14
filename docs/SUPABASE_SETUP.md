# 接入 fanmade-gogo（Singapore）

当前代码沿用 React + Express，云模式将账号、会话、共享活动、物料、申请与库存存入 Supabase PostgreSQL，图片存入 Supabase 私有 Storage。保留现有网站用户名／密码登录（bcrypt 哈希 + HttpOnly 会话 Cookie），**不是 Supabase Auth 登录**；因此 Authentication → Users 不会出现本站账号，账号在 Database → Tables → fanmade → users。Supabase Auth 的邮箱验证、第三方登录、重置密码邮件尚未接入。

本地 SQLite 数据与图片继续保留，不会被初始化脚本覆盖或自动上传。云项目起初只有拥有者账号和 CAN 活动，没有公开密码的演示账号。若需迁移旧库，应另做备份、导入及数量核对，不能用 seed 替换原数据。

**实际连接、初始化和双账号验证已通过**，结果见 [CLOUD_VERIFICATION.md](CLOUD_VERIFICATION.md)。本机真实云后台使用 http://localhost:3003；公网部署尚未验收。

## 1. 填本地配置

已经创建并忽略提交的文件是项目根目录的 `.env.cloud`；可提交的空模板是 `.env.cloud.example`。不要把密钥粘贴到聊天、GitHub、截图或前端代码。

| 字段 | 获取位置／说明 |
| --- | --- |
| DATABASE_URL | 打开项目 **Connect → Connection string → Session pooler**，端口 **5432**；复制控制台给出的实际主机，勿凭 Singapore 自己拼地址。将 [YOUR-PASSWORD] 替换为项目数据库密码（不是 Supabase 账号密码）；特殊字符必须 URL 编码，末尾保留 `?sslmode=require`。不是端口 6543 的 Transaction pooler，也不是可能仅支持 IPv6 的直连地址。忘记密码可在 Database Settings 重置，但会影响其他使用该密码的服务。 |
| SUPABASE_URL | **Settings → API / Data API → Project URL**，例如 https://项目引用.supabase.co。 |
| SUPABASE_SECRET_KEY | **Settings → API Keys → Secret keys** 的服务端密钥；旧布局使用 Legacy API Keys → service_role。不能填 publishable／anon key。此密钥只给后台 Storage 使用，不打包进网页。 |
| SUPABASE_BUCKET | 保持 fanmade-images。整个桶私有；公开作品也经过本站公开性检查后读取。 |
| OWNER_USERNAME | 自定本站管理员用户名，3–30 位小写英文、数字、下划线或短横线。 |
| OWNER_PASSWORD | 自定至少 12 位强密码，仅第一次建拥有者账号使用；不是演示密码。含 # 等字符时用双引号包住整值。 |
| OWNER_NICKNAME | 管理员昵称，可以中文。 |
| APP_ORIGIN | 部署后的 HTTPS 网站域名，不带末尾斜线，例如 https://站点名.netlify.app。本地云模式会自动改为 localhost；此时可先保留占位符。 |
| NODE_ENV / TRUST_PROXY | 模板值 production / 1，正式 HTTPS 反向代理使用。本地 cloud:start 会覆盖代理和 Cookie 设置。 |

无需在前端配置 VITE_SUPABASE_KEY，也不用把 fanmade schema 加到 Data API 的 Exposed schemas。代码和小程序以后通过同一业务 API 访问，不能用服务端 key 绕过物料管理规则。

代码包含 Supabase 根 CA，数据库连接校验证书及主机名。本地网络需要时可设 DATABASE_PROXY_URL=socks5://127.0.0.1:7890；不要将这个本机地址加入线上环境。连接和存储检查命令是 npm run cloud:check，只输出状态，不输出凭据。

## 2. 建表、权限与私有存储

推荐在项目目录执行：

```powershell
npm ci
npm run build
npm run cloud:init
```

初始化脚本只在没有 fanmade.users 时执行 [初始建表 SQL](../supabase/migrations/202610140001_initial.sql)，不会删除已有表；为全部业务表启用 RLS，撤销 anon／authenticated 对 fanmade schema、表、序列的权限；创建私有桶 fanmade-images（WebP，每对象最多 2 MB）；在公开上线前创建拥有者管理员。再次执行不会覆盖原账号或库存。配置错误会停止，不打印密钥。

也可手动执行：Supabase **SQL Editor → New query**，先运行该建表文件，再运行 [storage.sql](../supabase/storage.sql)。初始建表只执行一次，不在已有 fanmade 表时重复粘贴。之后仍运行 cloud:init 创建拥有者；它检测到表就跳过初始 SQL。在 **Storage** 确认桶的 Public 为关闭，勿给此桶添加匿名读写规则。此流程无需购买套餐。

本站权限分两层：

- Supabase Data API 不直接向匿名／普通用户开放业务表，Storage 也没有公开桶或客户端直传权限。后端数据库连接使用项目所有者，因此 RLS 本身不替代业务权限检查。
- Express 用登录会话检查 creator_id／recipient_id：每个人只能编辑自己的物料、处理自己收到的申请；站点管理员也不会因此获得他人私密申请。公开接口只输出公开活动、制作人和物料。备注原图及缩略图需申请双方登录，或领取者的不可猜测查询凭证；领取码不能读取私密记录。未登录上传以 HttpOnly 随机上传凭证绑定，不能盗用别人的图片附到自己的申请。

所有权、库存与整单校验在后台完成，PostgreSQL 事务在同一连接中执行。小规模试用统一加表写锁，串行处理库存事务，避免跨函数实例超额预留；不是在浏览器中检查后直接写库。

## 3. 接真实云后台试用和双账号验收

```powershell
npm run cloud:start
```

打开 **http://localhost:3003/**。它使用真实 Supabase 账号、数据库、Storage，两个浏览器访问同一后台；只绑定本机，普通的 **http://localhost:3001/** 仍是原 SQLite 数据，两个地址不会自动同步。手机远程试用需要下面的 HTTPS 部署。

自动集成验收：

```powershell
npm run cloud:verify
```

脚本启动两个独立 Node 进程连接同一真实项目，注册并重新登录两个随机密码测试账号，上传压缩图片，创建带（测试）标记的活动和物料，验证另一人申请、双方私密图文权限、制作人领取处理、互换接受／取消、幂等和库存同步；同时争最后一份，并在重启进程后核对数据库、会话及图片仍保留。脚本会写入标记明确的测试数据，不假称它是业务数据，也不自动删除库存账目。

账号凭据保存在 **output/cloud-test-accounts.json**（已忽略提交），结果在 **output/cloud-verification.json**。没有结果文件或测试失败时不能称云端验收完成。这项测试是本机服务使用 Supabase 的验收，仍需部署后检查云函数冷启动、跨实例和真实手机网络。

手动测试：浏览器 A 登录测试发布者，在“管理我的物料”查看测试活动和物料；独立浏览器 B 登录领取者，打开 A 的公开清单并申请；A 处理申请，B 刷新记录；分别确认可用、预留、送出变化。隐身窗口不登录能看公开作品，不能打开双方的申请链接或备注图片。

## 4. 免费 HTTPS 部署

Supabase 提供数据库和图片，**不单独托管当前整站 Express 网页**。网站静态页面和 Node 后台需要 Netlify Free；其套餐与额度说明见 [FREE_HOSTING.md](FREE_HOSTING.md)。先确认选用团队是 Free，再导入 GitHub 私有仓库 yangzi831/fanmade-gogo。Git 在 Linux 构建 npm run build，发布 dist，云函数与路由使用已有 netlify.toml。

Functions 环境变量填写 DATABASE_URL、SUPABASE_URL、SUPABASE_SECRET_KEY、SUPABASE_BUCKET、APP_ORIGIN、NODE_ENV、TRUST_PROXY。不要上传 .env.cloud；不要把 OWNER_PASSWORD 放进线上运行环境。APP_ORIGIN 改成最终 HTTPS 站点域名后重新部署。Supabase 项目尚未配置、Netlify 套餐尚未核对时不能提供假“已部署链接”。

核心流程免费可实现；免费套餐会有闲置暂停和用量限制，无自动生产备份。实际网络和微信扫码仍需设备验证。禁止将 SQLite 或上传图片放在云函数临时目录作为持久化数据。

## 当前默认规则和未改部分

普通领取沿用当前代码：提交即预留、直接待领取；发布者标记领取时转为送出。互换提交待确认，接受后才预留。取消释放预留，重复提交／重复领取不会重复扣减。调整总数不能低于“已预留 + 已送出”，手动登记仅用可用库存。

当前限领仍按规范化联系方式累计，同一活动的同一物料含待确认互换；这与最新讨论中的“每次预约限领”不同，尚待对应阶段调整，不能宣称已实现新规则。普通领取的独立“待确认”步骤、必选物料、历史名称图片快照、软删除、多图等也不在本次云存储接入中伪称完成。当前备注可附一张私密图片，互换另可附一张。
