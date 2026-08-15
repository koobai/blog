# Jingzhe Cloudflare Workers

五个 Worker 按最小权限独立部署，不应合并成一个拥有全部 Secrets 的服务。Core 不需要 Worker；只部署你实际启用的功能。

| 目录 | 职责 | 私密 Secrets | Cloudflare 资源 |
|---|---|---|---|
| [`publisher/`](publisher/README.md) | GitHub 写回与图片上传 | `ADMIN_TOKEN`、`GH_TOKEN` | R2 `R2_BUCKET` |
| [`drafts/`](drafts/README.md) | 管理员云草稿 | `ADMIN_TOKEN` | D1 `DB` |
| [`comments/`](comments/README.md) | 评论、回复、通知和管理删除 | `TURNSTILE_SECRET_KEY`、`ADMIN_PASSWORD`、可选 Resend/Bark | D1 `DB` |
| [`likes/`](likes/README.md) | 点赞计数、去重和 Turnstile | `TURNSTILE_SECRET_KEY`、`LIKE_SALT`、可选 Bark | D1 `DB` |
| [`activity-sync/`](activity-sync/README.md) | 运动协议校验、原始事实合并与 GitHub 写入 | `SYNC_TOKEN`、`GH_TOKEN` | 无 |

分开部署是安全边界，不只是代码分类：Publisher 可以改写内容与图片桶；Activity Sync 的独立 GitHub 凭据只用于运动原始事实；Drafts 保存未发布内容；Comments 接触邮箱；Likes 只需要不可逆访客哈希。合并后任一接口被攻破，都可能扩大到不相关的高权限资源。

CORS 只限制浏览器跨域调用，不是身份认证。Publisher 和 Drafts 仍依赖 `x-admin-token`；生产环境可在不改变前端契约的前提下增加 Cloudflare Access、速率限制和日志告警。

## 配置边界

| Worker | Secrets | Vars / Bindings |
|---|---|---|
| Publisher | `ADMIN_TOKEN`、`GH_TOKEN` | `GITHUB_OWNER`、`GITHUB_REPO`、`IMAGE_BASE_URL`、`ALLOWED_ORIGINS`、`R2_BUCKET` |
| Drafts | `ADMIN_TOKEN` | `ALLOWED_ORIGINS`、D1 `DB` |
| Comments | `TURNSTILE_SECRET_KEY`、`ADMIN_PASSWORD`；可选 `RESEND_API_KEY`、`BARK_URL` | 站点品牌变量、`ALLOWED_ORIGINS`、D1 `DB` |
| Likes | `TURNSTILE_SECRET_KEY`、`LIKE_SALT`；可选 `BARK_URL` | `SITE_URL`、`ALLOWED_ORIGINS`、D1 `DB` |
| Activity Sync | `SYNC_TOKEN`、`GH_TOKEN` | `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH`、`GITHUB_ACTIVITY_PATH`、`ALLOWED_ORIGINS` |

Secret 只能通过 `wrangler secret put`、`wrangler deploy --secrets-file` 或未提交的 `.dev.vars` 注入。`wrangler.example.toml` 只保存公开配置和明显无效的占位 ID。

## 前置条件

- Node.js 当前 LTS。
- 自己的 Cloudflare 账户；远程部署前运行 `npx wrangler login`。
- Publisher 需要自己的 GitHub 仓库、最小权限 Token 和 R2 Bucket。
- Comments/Likes 需要自己的 Turnstile Site Key 与 Secret Key。

登录、创建资源、写入 Secret、远程迁移和 `wrangler deploy` 都会改变 Cloudflare 账户状态。AI 执行这些命令前必须取得用户授权。

## 通用本地流程

进入目标 Worker 目录，复制示例文件：

```bash
cp wrangler.example.toml wrangler.toml
cp .dev.vars.example .dev.vars
```

把 `.dev.vars` 填成仅供本地测试的值，并将 `wrangler.toml` 中的域名、资源名和占位 ID 换成自己的配置。D1 Worker 先运行：

```bash
npx wrangler d1 migrations apply DB --local
npx wrangler dev
```

Publisher 和 Activity Sync 没有 D1 迁移；配置好各自的本地 Binding/Vars 后直接运行 `npx wrangler dev`。根目录统一契约测试：

```bash
node tests/test_workers.mjs
node tests/test_activity_sync_worker.mjs
python3 tools/jingzhe.py check
```

## 通用远程流程

1. 按子目录 README 创建需要的 D1 或 R2，并把真实资源名/ID 写入未提交的 `wrangler.toml`；Activity Sync 不需要额外数据服务。
2. 将 `ALLOWED_ORIGINS` 改成自己的站点 Origin；不要使用 `*` 代替管理员接口鉴权。
3. 对 D1 执行 `npx wrangler d1 migrations apply DB --remote`。
4. 从 `.dev.vars.example` 创建被 `.gitignore` 排除的 `.env.production`，只保留实际使用的 Secret 并填入真实值。
5. 运行 `npx wrangler deploy --secrets-file .env.production`，让代码和必需 Secret 一次部署。后续轮换单个值可使用 `npx wrangler secret put SECRET_NAME`；该命令会立即创建并部署新版本。
6. 先在测试域名验证，再把 Worker URL 写回 Hugo 配置。

Hugo 回填位置：

| Worker | `params.toml` 配置 |
|---|---|
| Publisher | `services.publisher.workerUrl`、`imageBaseUrl` |
| Drafts | `services.publisher.draftUrl` |
| Comments | `services.social.commentsApi`、`turnstileSiteKey` |
| Likes | `services.social.likesApi`、`likesSubmitUrl`、`turnstileSiteKey` |
| Activity Sync | 不写入 Hugo 公开配置；只把私有 Gateway URL 与 `SYNC_TOKEN` 配置在 App/连接器中 |

## 已实现的保护

- Publisher 只代理指定仓库的 GitHub API，图片路径只允许 `memos/`、`article/` 或 `apps/`。
- Comments 公开响应使用字段白名单，邮箱只在 Worker 内用于头像哈希和回复通知；父评论必须属于同一页面。
- Likes 缺少 `LIKE_SALT` 时拒绝写入，不使用公开默认盐。
- Activity Sync 固定目标仓库、分支和文件路径，拒绝携带私密轨迹的请求，并对 GitHub SHA 冲突重读重试。
- 数据库内部错误只进入服务端日志，对外返回通用错误。
- 五个 Worker 都按 `ALLOWED_ORIGINS` 拒绝未知浏览器 Origin；原生 App 没有 Origin，仍必须通过 Bearer Token 鉴权。

Comments 新响应返回 `avatar_hash`，不再返回邮箱；现有前端同时兼容旧响应中的 `email`，因此可先更新前端再切换 Worker，不改变评论 URL、提交字段、LocalStorage Key 或管理员操作方式。

API 路由和字段见 [OpenAPI](openapi.yaml)。仓库不会自动部署 Worker，也不会自动切换 Koobai 的生产 URL；正式迁移应先使用测试域名和测试数据库，再逐个切换并保留回滚版本。

Wrangler 命令应以 Cloudflare 当前官方文档为准：[D1 migrations](https://developers.cloudflare.com/d1/wrangler-commands/)、[R2 buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/)、[Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。
