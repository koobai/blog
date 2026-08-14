# Drafts Worker

只保存管理员唠叨云草稿，不拥有 GitHub 或 R2 权限。

## Bindings

- Secret `ADMIN_TOKEN`。
- D1 `DB`。
- Var `ALLOWED_ORIGINS`。

## 本地验证

```bash
cp wrangler.example.toml wrangler.toml
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply DB --local
npx wrangler dev
```

接口继续使用 `x-admin-token` 和 `/api/drafts`，兼容现有前端。

## 远程部署

```bash
npx wrangler d1 create jingzhe-drafts
npx wrangler d1 migrations apply DB --remote
cp .dev.vars.example .env.production
npx wrangler deploy --secrets-file .env.production
```

把 `d1 create` 返回的 `database_id` 写入 `wrangler.toml`，将 `ALLOWED_ORIGINS` 限定为自己的站点，并在 `.env.production` 填入高强度随机 `ADMIN_TOKEN`。它应与 Publisher 使用相同值，才能保持网页编辑器一次登录同时访问两个服务。

部署后把地址写入 Hugo 配置：

```toml
[services.publisher]
draftUrl = "https://drafts.example.org"
```

生产切换前验证草稿列表、保存、覆盖、删除、错误 Token 和未知 Origin。
