# Likes Worker

公开点赞计数与 Turnstile 防刷服务，不拥有评论、GitHub 或 R2 权限。

## Bindings

- D1 `DB`。
- Secrets `TURNSTILE_SECRET_KEY`、`LIKE_SALT`。
- 可选 Secret `BARK_URL`。
- Vars `ALLOWED_ORIGINS`、`SITE_URL`。

## 本地验证

```bash
cp wrangler.example.toml wrangler.toml
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply DB --local
npx wrangler dev
```

`LIKE_SALT` 必须使用随机 Secret；缺失时 Worker 拒绝写入，不再使用公开默认盐。

## 远程部署

```bash
npx wrangler d1 create jingzhe-likes
npx wrangler d1 migrations apply DB --remote
cp .dev.vars.example .env.production
npx wrangler deploy --secrets-file .env.production
```

把 `d1 create` 返回的 `database_id` 写入 `wrangler.toml`，并检查 `SITE_URL` 与 `ALLOWED_ORIGINS`。在 `.env.production` 填入 `TURNSTILE_SECRET_KEY` 和随机 `LIKE_SALT`；如需 Bark 通知再保留 `BARK_URL`，否则删除对应空行。

Hugo 配置示例：

```toml
[services.social]
likesApi = "https://likes.example.org/api/likes"
likesSubmitUrl = "https://likes.example.org/api/likes/submit"
turnstileSiteKey = "你的公开 Site Key"
```

Comments 和 Likes 可以共用同一组 Turnstile Site/Secret Key，但数据库和其他 Secrets 仍必须分离。生产切换前验证计数读取、首次点赞、重复点赞、Turnstile 失败和未知 Origin。

## 点赞交互契约

访客点击后，前端立即显示点赞成功和新的计数，不等待 Turnstile 或网络请求完成。后台结果按以下规则收敛：

- `200`：确认当前乐观结果。
- `409`：访客已经点过赞，使用服务端计数校准本地状态。
- Turnstile、网络或服务端错误：回滚本次乐观结果，并允许访客重试。

Likes Worker 使用 D1 原子批处理同时写入访客去重记录和页面计数，避免只写入其中一张表。前端即时反馈不改变服务端去重和防刷规则。
