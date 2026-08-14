# Jingzhe Cloudflare Workers

四个 Worker 按最小权限独立部署，不应合并成一个拥有全部 Secrets 的服务。Core 不需要 Worker；只部署你实际启用的功能。

| 目录 | 职责 | 私密 Secrets | Cloudflare 资源 |
|---|---|---|---|
| [`publisher/`](publisher/README.md) | GitHub 写回与图片上传 | `ADMIN_TOKEN`、`GH_TOKEN` | R2 `R2_BUCKET` |
| [`drafts/`](drafts/README.md) | 管理员云草稿 | `ADMIN_TOKEN` | D1 `DB` |
| [`comments/`](comments/README.md) | 评论、回复、通知和管理删除 | `TURNSTILE_SECRET_KEY`、`ADMIN_PASSWORD`、可选 Resend/Bark | D1 `DB` |
| [`likes/`](likes/README.md) | 点赞计数、去重和 Turnstile | `TURNSTILE_SECRET_KEY`、`LIKE_SALT`、可选 Bark | D1 `DB` |

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

Publisher 没有 D1 迁移，配置本地或预览 R2 Binding 后直接运行 `npx wrangler dev`。根目录统一契约测试：

```bash
node tests/test_workers.mjs
python3 tools/jingzhe.py check
```

## 通用远程流程

1. 按子目录 README 创建 D1 或 R2，并把真实资源名/ID 写入未提交的 `wrangler.toml`。
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

API 路由和字段见 [OpenAPI](openapi.yaml)，权限与迁移要求见 [Worker 安全说明](../docs/security/workers.md)。仓库不会自动部署 Worker，也不会自动切换 Koobai 的生产 URL。

Wrangler 命令应以 Cloudflare 当前官方文档为准：[D1 migrations](https://developers.cloudflare.com/d1/wrangler-commands/)、[R2 buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/)、[Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。
