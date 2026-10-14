# Supabase 实际验证（2026-10-14）

项目：fanmade-gogo，Singapore，Free。已经使用真实 PostgreSQL 和 Storage 验证，不是 PGlite／SQLite／localStorage 模拟。网页后台当前在本机运行，**还没有验收 Netlify 公网部署**。

## 已完成

- DATABASE_URL、服务端 Storage key、项目引用检查通过；连接使用 Supabase 根 CA，并验证证书和主机名。
- 创建独立 fanmade schema 和 15 张业务表，全部启用 RLS，anon／authenticated 无业务 schema 访问权限。后台继续用会话检查物料所有者和申请双方，不依赖前端隐藏按钮。
- 首次创建拥有者管理员，实际网站登录及管理接口通过。再次执行初始化没有替换账号或密码、没有重复创建 CAN 活动。
- 创建 PRIVATE 桶 fanmade-images，每对象最多 2 MB、WebP；实际上传、逐字节读回、匿名读取拒绝、删除探针通过。原有对象没有清空。
- 两个随机密码测试账号通过注册、重新登录、共享活动加入、公开物料发布、压缩图片上传、领取附私密备注图、双方记录读取、发布者处理、互换接受／取消、幂等及库存同步验证。
- 两个独立后台进程连接同一 Supabase 数据库，同时争最后一份：201 成功和 409 库存不足各一人；取消后释放。
- 后台进程重启后会话、活动物料、预约记录、库存和 Storage 图片仍存在。
- 34 组本地回归测试及生产前端构建通过。Windows 开发机上的函数构建检查不等于 Linux 线上部署验收。

测试数据带（测试）标签，保留在真实云库；未删除库存账目。测试账号凭据在本地 output/cloud-test-accounts.json，结果在 output/cloud-verification.json，二者和 .env.cloud 均被 Git 忽略，密码和密钥不进入文档。

## 试用入口

运行 npm run cloud:start 后打开 http://localhost:3003，使用 .env.cloud 中自行填写的 OWNER_USERNAME／OWNER_PASSWORD 登录。仅本机可访问，后台数据来自 Supabase。http://localhost:3001 仍使用原本地 SQLite，旧账号、物料和预约保留，未自动上传、未与云端合并。

当前网络的数据库直连在 PostgreSQL SSLRequest 阶段超时；本地 .env.cloud 增加了 DATABASE_PROXY_URL，使用已存在的 socks5://127.0.0.1:7890 网络代理。图片 HTTPS 访问正常。线上 Functions 不要配置该本机地址；默认直接连接数据库。CA 文件是公开证书，可随源码保存，不是密钥；来源为 Supabase 下载服务器的 prod/ssl/prod-ca-2021.crt。

## 待上线验证

APP_ORIGIN 暂留空，不影响初始化及本地云模式；部署 HTTPS 网站时必须填实际域名。仍需核对 Netlify Free 团队套餐，完成 Linux Git 构建、正式域名配置、云函数冷启动／跨实例并发及真实手机网络和微信扫码测试。未启用付费套餐或付款方式。

本次接入保留现有业务状态和限领规则；普通领取仍提交即预留／待领取，互换接受后才预留。最新讨论中普通领取的独立确认步骤及每次限领规则调整仍需后续阶段实施。详见 SUPABASE_SETUP.md。
