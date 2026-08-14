# Publisher Worker

高权限管理端 Worker，仅服务在线编辑器的 GitHub 写回与 R2 图片上传。不要与公开评论或点赞 Worker 合并部署。

## Bindings

- Secret `ADMIN_TOKEN`：浏览器管理口令，与现有 `x-admin-token` Header 对应。
- Secret `GH_TOKEN`：只授予目标仓库 Contents 所需最小写权限。
- R2 `R2_BUCKET`：图片桶。
- Vars `GITHUB_OWNER`、`GITHUB_REPO`：严格限定 GitHub 代理目标。
- Vars `IMAGE_BASE_URL`、`ALLOWED_ORIGINS`、可选 `GITHUB_USER_AGENT`。

## 本地验证

```bash
cp wrangler.example.toml wrangler.toml
cp .dev.vars.example .dev.vars
npx wrangler dev
```

本地使用测试仓库、测试分支和测试 Bucket；不要用生产仓库验证写请求。

## 远程部署

```bash
npx wrangler r2 bucket create your-image-bucket
npx wrangler r2 bucket create your-image-bucket-preview
cp .dev.vars.example .env.production
npx wrangler deploy --secrets-file .env.production
```

两个 Bucket 名称应与 `wrangler.toml` 中的 `bucket_name`、`preview_bucket_name` 一致。在 `.env.production` 填入 `ADMIN_TOKEN` 和 `GH_TOKEN`。R2 Bucket 默认不公开；需要在 Cloudflare 为正式 Bucket 配置公开开发 URL 或自定义域名，并将该地址同时写入 `IMAGE_BASE_URL` 和 Hugo 的 `imageBaseUrl`。`GH_TOKEN` 只授予目标仓库 Contents 所需的最小读写权限；`GITHUB_OWNER` 和 `GITHUB_REPO` 必须与目标仓库完全一致。

Hugo 配置示例：

```toml
[repository]
owner = "your-github-owner"
name = "your-blog-repo"
branch = "main"

[services.publisher]
workerUrl = "https://publisher.example.org"
imageBaseUrl = "https://images.example.org"
```

`ADMIN_TOKEN` 应使用高强度随机值；如同时部署 Drafts，应保持两者相同。生产切换前在测试仓库验证登录、读取、创建、覆盖、路径拒绝、单图/多图上传和错误 Token。
