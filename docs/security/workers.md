# Worker 安全与部署边界

四个 Cloudflare Worker 以最小权限独立部署。目录名表示安全边界，不只是代码分类；不要为了省事把它们合并到一个拥有全部 Secrets 的 Worker。

| 目录 | 职责 | 公开程度 | 高权限能力 |
|---|---|---|---|
| `workers/publisher/` | GitHub 内容写回、R2 图片上传 | 仅管理员 | GitHub Token、R2 写入 |
| `workers/drafts/` | 唠叨云草稿 | 仅管理员 | D1 草稿读写 |
| `workers/comments/` | 评论、回复通知、管理员删除 | 公开读写，写入需 Turnstile | D1、可选 Resend/Bark |
| `workers/likes/` | 点赞计数与去重 | 公开读写，写入需 Turnstile | D1、可选 Bark |

## 为什么是四个 Worker

- Publisher 一旦泄露可能改写仓库或图片桶，不能和公开评论、点赞共享凭据。
- Drafts 保存未发布内容，虽然权限低于 Publisher，仍不应暴露给访客。
- Comments 处理邮箱，公开响应必须经过字段白名单，不能直接返回数据库行。
- Likes 只需要不可逆访客哈希和计数，不需要访问评论邮箱或 GitHub。

CORS 只限制浏览器跨域调用，不是身份认证。Publisher 和 Drafts 仍依赖 `x-admin-token`；生产环境可在不破坏前端契约的前提下额外增加 Cloudflare Access、速率限制和日志告警。

## Secrets 与公开变量

| Worker | Secrets | Vars / Bindings |
|---|---|---|
| Publisher | `ADMIN_TOKEN`、`GH_TOKEN` | `GITHUB_OWNER`、`GITHUB_REPO`、`IMAGE_BASE_URL`、`ALLOWED_ORIGINS`、`R2_BUCKET` |
| Drafts | `ADMIN_TOKEN` | `ALLOWED_ORIGINS`、D1 `DB` |
| Comments | `TURNSTILE_SECRET_KEY`、`ADMIN_PASSWORD`；可选 `RESEND_API_KEY`、`BARK_URL` | 站点品牌变量、`ALLOWED_ORIGINS`、D1 `DB` |
| Likes | `TURNSTILE_SECRET_KEY`、`LIKE_SALT`；可选 `BARK_URL` | `SITE_URL`、`ALLOWED_ORIGINS`、D1 `DB` |

Secret 只能通过 `wrangler secret put` 或未提交的 `.dev.vars` 注入。`wrangler.example.toml` 只存公开配置和明显无效的占位 ID。

## 已实现的保护

- Publisher 只代理 `https://api.github.com/repos/{owner}/{repo}` 及其子路径，类似 `repo-private` 的前缀绕过会被拒绝。
- 图片路径限定在 `memos/`、`article/` 或 `apps/`，拒绝 `..` 和超长路径。
- Comments GET 使用字段白名单，真实邮箱只在 Worker 内部参与 SHA-256 头像哈希和回复通知。
- 回复的 `parent_id` 必须属于同一个页面 URL，避免跨页面通知串联。
- Likes 缺少 `LIKE_SALT` 时拒绝写入，不使用公开默认盐。
- 数据库内部错误只记录到服务端日志，对外返回通用错误。
- 四个 Worker 都按 `ALLOWED_ORIGINS` 拒绝未知浏览器 Origin。

## 本地验证顺序

完整的资源创建、Secret、远程迁移和 Hugo 回填命令见 [`workers/README.md`](../../workers/README.md)。本节只强调安全顺序。

1. 在目标 Worker 目录复制 `wrangler.example.toml` 为未提交的 `wrangler.toml`。
2. 复制 `.dev.vars.example` 为 `.dev.vars` 并填入仅供本地使用的值。
3. 对 D1 Worker 执行对应的 `wrangler d1 migrations apply ... --local`。
4. 使用 `wrangler dev` 启动服务，用合成数据验证 OpenAPI 路由。
5. 运行根目录 `node tests/test_workers.mjs` 和 `python3 tools/jingzhe.py check`。

仓库不会自动部署 Worker，也不会自动把 Koobai 生产 URL 切到新代码。正式迁移应先使用测试域名和测试数据库，再逐个 Worker 切换并保留回滚版本。

## 评论邮箱兼容迁移

新版 Worker 返回 `avatar_hash`，不返回 `email`。`static/js/comments.js` 同时支持：

- 新响应：直接使用 `avatar_hash`；
- 旧响应：临时读取 `email` 并在浏览器计算哈希。

因此可以先发布兼容前端，再切换 Comments Worker；Koobai 现有评论 URL、提交字段、LocalStorage Key 和管理员操作方式不需要改变。
