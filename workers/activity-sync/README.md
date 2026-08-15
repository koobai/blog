# Activity Sync Gateway

这个 Worker 是运动数据源与博客之间唯一的写入入口。Laodao App、Keep 连接器或其他数据源适配器只调用同一套 v1 协议；Worker 严格校验协议，并强制“非公开状态不得携带真实轨迹”，然后把原始事实合并到 `data/exercise/activities.json`。它不会猜测一条路线是否私密；这个判断必须在数据离开来源前完成。博客页面和月报仍由现有 GitHub Actions 处理。

它不需要 D1、R2、用户账户或公共服务地址。每个部署者在自己的 Cloudflare 和 GitHub 仓库中运行一份。

## 为什么单独部署

Activity Sync 不是博客页面的必需后端，而是可选的写入边界。单独部署会多一个 Worker，但它将 GitHub 凭据、仓库路径、并发合并和幂等判断从每个 App/数据源中抽离出来：

- App 只保存权限更小的 `SYNC_TOKEN`，不携带 GitHub PAT、仓库名、分支或博客文件路径。
- Apple Health、Keep 或其他来源可以替换，无需改博客处理器和页面。
- Activity Sync 的 GitHub Token 只需目标仓库 Contents 读写，不与图片上传、草稿、评论或点赞权限混合。
- 重复请求、GitHub SHA 冲突和原子写入只实现一次，不会在每个客户端重复。

如果只手工维护运动 JSON，可以不部署它。如果需要 App 或多数据源自动同步，这一个不依赖 D1/R2、只有单一接口的 Worker 是解耦边界，不是站点运行时的必需复杂度。

## 完整数据流

1. 数据源适配器生成来源事实，并在发送前去除私密轨迹。
2. 首次接入使用 `snapshot`，日常更新使用 `delta`。
3. Gateway 校验和合并原始事实；数据不变时返回 `changed=false`，不写 GitHub。
4. 真实变化只写 `data/exercise/activities.json`，触发运动处理 Actions。
5. Actions 生成 `assets/activities.json` 和 `assets/monthly_insights.json`，不回写原始事实。
6. 生成产物提交再触发 Hugo 构建和 Cloudflare Pages 发布。

三个运动文件的职责不同：

| 文件 | 性质 | 写入者 | 用途 |
|---|---|---|---|
| `data/exercise/activities.json` | 原始事实 | Activity Sync Gateway 或手工导入 | 来源无关的唯一输入 |
| `assets/activities.json` | 生成产物 | 运动处理 Actions | Hugo 展示、地图、成就与标题 |
| `assets/monthly_insights.json` | 生成产物 | 月报状态机 | 统计、月中与月末报告 |

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
