# Activity Sync Gateway

这个 Worker 是运动数据源与博客之间唯一的写入入口。Laodao App、Keep 连接器或其他数据源适配器只调用同一套 v1 协议；Worker 校验隐私边界后，把原始事实合并到 `data/exercise/activities.json`。博客页面和月报仍由现有 GitHub Actions 处理。

它不需要 D1、R2、用户账户或公共服务地址。每个部署者在自己的 Cloudflare 和 GitHub 仓库中运行一份。

## 接口

```text
POST /v1/activities/sync
Authorization: Bearer <SYNC_TOKEN>
Content-Type: application/json
```

请求结构以 [`../../schemas/data/exercise-sync-v1.schema.json`](../../schemas/data/exercise-sync-v1.schema.json) 为准：

- `snapshot` 原子替换一个 `source` 的完整数据；显式传入空 `upsert` 可清空该来源。
- `delta` 只执行明确的 `upsert` 和 `delete`；遗漏记录不会删除历史。
- 唯一标识始终是 `source + external_id`；`producer` 仅用于诊断，不写入仓库。
- 是否隐藏轨迹由数据源适配器决定。`privacy_hidden`、`unavailable`、`pending` 均不得上传真实 `summary_polyline`，Gateway 会拒绝违规请求。

成功响应会说明是否产生 GitHub 提交：

```json
{
  "success": true,
  "changed": true,
  "schema_version": 1,
  "source": "apple_health",
  "mode": "delta",
  "request_id": "example-001",
  "counts": {"created": 1, "updated": 0, "deleted": 0, "total": 91},
  "commit": {"sha": "...", "url": "..."}
}
```

重复发送同一数据返回 `changed: false` 且不会创建无意义提交。并发写入使用 GitHub 文件 SHA 自动重读、合并和重试；连续冲突返回 `409 concurrent_update`。

## 配置

复制示例文件，并仅在未提交的本地文件中填写真实值：

```bash
cp wrangler.example.toml wrangler.toml
cp .dev.vars.example .dev.vars
```

Secrets：

- `SYNC_TOKEN`：App 或连接器调用 Gateway 的独立随机凭据。
- `GH_TOKEN`：GitHub fine-grained token，只授予目标仓库 Contents 读写权限。

Vars：

- `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH`：固定目标仓库和分支。
- `GITHUB_ACTIVITY_PATH`：固定为 `data/exercise/activities.json`，客户端不能指定其他路径。
- `ALLOWED_ORIGINS`：可调用接口的浏览器 Origin，以逗号分隔。原生 App 没有 Origin，不受此项影响。
- `GITHUB_USER_AGENT`：GitHub API User-Agent。

本地检查：

```bash
node --check src/index.js
node ../../tests/test_activity_sync_worker.mjs
```

远程配置和部署会改变 Cloudflare/GitHub 状态，只有在项目所有者明确授权后才执行：

```bash
npx wrangler secret put SYNC_TOKEN
npx wrangler secret put GH_TOKEN
npx wrangler deploy
```

生产切换前应先使用测试仓库和测试 Worker 完成 snapshot、delta、隐私拒绝、无变化以及并发冲突测试。Gateway 的 GitHub 提交信息包含 `Auto-sync activity facts`，便于识别和排障；实际自动化边界由文件路径保证：原始事实先触发处理工作流，部署工作流等待生成产物提交。
