# Comments Worker

公开评论、回复通知与管理员删除服务。公开 GET 响应只返回 `avatar_hash`，不会返回数据库中的真实邮箱。

## Bindings

- D1 `DB`。
- Secrets `TURNSTILE_SECRET_KEY`、`ADMIN_PASSWORD`。
- 可选 Secrets `RESEND_API_KEY`、`BARK_URL`。
- Vars `ALLOWED_ORIGINS`、`SITE_URL`、`SITE_NAME`、`ADMIN_EMAILS`。
- 可选 Vars `APP_SCHEME`、`RESEND_FROM`、`RESEND_SUBJECT`。

## 本地验证

```bash
cp wrangler.example.toml wrangler.toml
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply DB --local
npx wrangler dev
```

使用明显无效的本地 Secret 和合成邮箱测试提交、回复、管理员验证与删除。邮箱仅用于头像哈希、回复通知和管理员通知路由；日志和 API 响应不得输出邮箱。

## 远程部署

```bash
npx wrangler d1 create jingzhe-comments
npx wrangler d1 migrations apply DB --remote
cp .dev.vars.example .env.production
npx wrangler deploy --secrets-file .env.production
```

把 `d1 create` 返回的 `database_id` 写入 `wrangler.toml` 后再执行远程迁移。在 `.env.production` 填入 `TURNSTILE_SECRET_KEY` 和 `ADMIN_PASSWORD`；启用邮件或 Bark 时，再保留并设置 `RESEND_API_KEY`、`BARK_URL`，否则删除对应空行。同时检查 `SITE_URL`、`SITE_NAME`、`ADMIN_EMAILS` 和 `RESEND_FROM`。

Hugo 配置示例：

```toml
[services.social]
commentsApi = "https://comments.example.org/api"
turnstileSiteKey = "你的公开 Site Key"
```

`turnstileSiteKey` 可以公开，`TURNSTILE_SECRET_KEY` 只能存在于 Worker Secret。生产切换前验证列表、提交、回复、Turnstile 失败、管理员登录和删除路径。
