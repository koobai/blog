# 部署惊蛰

本文给出部署平台需要的稳定契约，不绑定某个云平台不断变化的控制台界面。优先使用 [AI 快速开始](quick-start.md)，让 AI 根据你选择的平台核对其最新官方文档并完成配置。

## Core 构建契约

| 项目 | 值 |
|---|---|
| 运行时 | Hugo Extended 0.158.0+ |
| 工作目录 | Core 生成目录根部 |
| 构建命令 | `hugo --minify --panicOnWarning` |
| 输出目录 | `public/` |
| 本地预览 | `hugo server` |
| 必需外部服务 | 无 |

Cloudflare Pages、GitHub Pages、Netlify、Vercel 或普通静态服务器都可以托管 `public/`。平台配置、登录、仓库关联、DNS 和正式部署属于外部写操作，AI 执行前应取得授权。

根仓库的 GitHub Actions 有意使用 Hugo `latest`，持续跟随 Hugo 新版本。每次提交前应运行统一严格检查；如果新版引入弃用警告或不兼容变化，先完成适配再发布，不把工作流固定到旧版本。

## 部署前检查

1. 在生成站点的 `config/_default/hugo.toml` 设置最终 `baseURL` 和标题。
2. 在 `config/_default/params.toml` 替换作者、品牌、头像和仓库信息。
3. 删除或改写两条明确标注的合成示例内容。
4. 添加自己的 Markdown 内容；迁移旧 Hugo 站点时保留原 Slug/URL，先少量迁移并构建，不做未经核对的全仓库替换。
5. 运行严格构建并检查生成链接：

```bash
hugo --minify --panicOnWarning
```

## 可选功能

- Publisher、Drafts、Comments、Likes 和 Activity Sync：先按 [`workers/README.md`](../workers/README.md) 在测试域名部署，再回填公开 URL 或 App 私有配置。
- Movies/Exercise：提供符合 `schemas/data/` 的自己的数据；不要复制 Koobai 的生产 `assets/`。
- Exercise：Mapbox Token 是浏览器公开参数，但应限制允许的 URL；原始隐私轨迹不得进入公开数据。
- Zouguo / 走过：使用自己的 Markdown、公开地点、Mapbox Token/样式和边界许可证；静态展示不要求 Worker，App 发布才按需部署 Publisher/Drafts。
- AI Coach：模型 API Key 只能存放在部署平台 Secret 中，模型只能接收聚合证据。

## 部署“走过”页面

当前 `init` 只生成 Core，不会自动安装“走过”。完整清单见 [`zouguo.md`](zouguo.md)，部署时至少需要：

1. 只复制 MIT 授权的布局、局部模板、CSS、JavaScript、Archetype、Schema、地点解析代码和边界构建程序，不复制 Koobai 的 Markdown、坐标、照片或地图样式 ID。
2. 使用自己的 Mapbox Public Token 与浅色/深色样式；完整行政区目录只用于 Hugo 构建，浏览器只下载当前记录引用的裁剪子集。
3. 创建自己的 `/zouguo/` 页面与内容，严格遵守 [`zouguo-data-contract.md`](zouguo-data-contract.md)。生成 feed 和边界子集不得手工编辑。
4. 只做静态展示时不需要 Worker；需要 iOS App 发布、编辑、删除或云草稿时，再分别部署 Publisher 与 Drafts，并使用最小权限的 GitHub、R2、D1 配置。
5. 发布前运行专题契约测试、走过 JavaScript 语法检查和 Hugo 严格构建。

博客仓库不包含 iOS App 源码，只定义 App 写入的 Markdown/Worker 契约。部署 App 是其独立项目的任务，不能通过复制本仓库内容完成。

## 部署“动起来”页面

这一节是 AI 与人工安装共同使用的端到端清单。当前 `init` 只生成 Core；在 Core 目录里仅打开 `params.features.exercise` 不会自动安装运动页面、数据处理程序或 Actions。

### 1. 确认安装起点

- 从本仓库的 Full 参考实现开始：运动程序已经存在，但发布前必须删除或替换 Koobai 的文章、真实 `assets/`/`data/exercise/` 数据、品牌配置和生产服务地址。
- 从 `init` 生成的 Core 开始：只从上游复制 MIT 授权的运动程序模块、Schema 与工作流，不复制 `content/**`、真实运动 JSON、个人图片或 Koobai 配置。

AI 必须先说明采用哪条路径、将复制哪些程序文件以及哪些数据需要用户自己提供，再修改目标仓库。

### 2. 启用页面与公开配置

1. 在目标环境的 `params.features` 中启用 `exercise`；只有需要 AI 月报时才同时启用 `aiCoach`。
2. 保留主题中的 `layouts/pages/exercise.html`、`layouts/_partials/exercise-food-icons.html`、`assets/css/exercise.css` 与 `assets/js/exercise/` 模块。
3. 创建自己的 `layout: exercise` 页面和 `/exercise` 地址，只写自己的标题、简介和图片，不复制 Koobai 的页面内容。
4. 在 `params.services.exercise` 配置自己的 Mapbox Public Token、样式、中心点和海报前缀。Public Token 可以进入浏览器，但应在 Mapbox 限制允许的站点 URL。

### 3. 建立数据与处理边界

运动管线固定使用三类文件：

| 文件 | 写入者 | 说明 |
|---|---|---|
| `data/exercise/activities.json` | Gateway 或手工导入 | 来源无关的原始事实；文件结构遵循 `exercise-sync-store-v1`，每条记录字段遵循 `exercise-sync-v1` |
| `assets/data/exercise/activities.json` | `process_activities.py` | 页面读取的生成产物，不应由 App 直接写入 |
| `assets/data/exercise/monthly-insights.json` | 月报状态机 | 确定性统计与可选 AI 月中/月末报告 |

此外，`assets/data/exercise/landmark-routes.json` 必须换成部署者自己选择的公共地标路线；它只用于给 `privacy_hidden` 记录显示替代路线，不得包含用户真实私密轨迹。运动类型、颜色和换算继续以 `data/jingzhe/exercise.json` 为唯一契约。

首次构建运动页面前，先导入至少一条自己的来源事实并运行 `python process_activities.py`，再提交生成产物。不得把 Koobai 的真实 JSON 当作示例数据发布。

### 4. 配置 GitHub Actions

1. 使用 `process-activities.yml` 监听 `data/exercise/activities.json`，只提交 `assets/data/exercise/activities.json` 与 `assets/data/exercise/monthly-insights.json`。
2. 配置一个仅限目标仓库 Contents 读写的 Actions Secret `PAT`。处理产物的推送需要继续触发站点部署，因此不能改用不会触发后续工作流的默认写入方式。
3. 把 `NOMINATIM_USER_AGENT` 与 `NOMINATIM_REFERER` 换成自己的应用名和公开联系页面。
4. AI 月报是可选能力：配置 `DEEPSEEK_API_KEY` 才生成新的月报文本；没有该 Secret 时，运动清洗、统计、构建和发布仍正常进行。
5. 站点部署工作流忽略只有原始事实变化的提交，等待处理产物提交后再构建，保持“原始事实 → 处理 → 发布”的顺序。

### 5. 选择数据入口

- 手工导入：按 [`exercise-sync-store-v1`](../schemas/data/exercise-sync-store-v1.schema.json) 维护 `data/exercise/activities.json`，不需要 Worker。
- 自动同步：按 [`workers/activity-sync/README.md`](../workers/activity-sync/README.md) 部署每个站点自己的运动同步网关（Activity Sync Gateway）。网关使用独立 `SYNC_TOKEN` 和最小权限 `GH_TOKEN`，固定写入目标仓库的 `data/exercise/activities.json`；网关 URL 与 Token 只配置在 App/连接器，不写入 Hugo 参数，也不提供项目公共接口地址。

数据源适配器必须在上传前决定 `route_status`。只有 `available` 可以携带真实 `summary_polyline`；`privacy_hidden`、`unavailable` 和 `pending` 都不得上传真实轨迹，Gateway 只负责验证，不能替用户判断隐私。

### 6. 首次同步与验收

手机等设备本地视图首次接入和日常新增都使用 `delta`；只有连接器掌握某个来源的权威全集时才使用 `snapshot`。交付前至少验证：

1. `node tests/test_activity_sync_worker.mjs` 与运动 Python 契约测试通过。
2. `python3 tools/jingzhe.py check --json` 和 Hugo 严格构建通过。
3. Gateway 只新增一笔原始事实提交，Actions 按“处理 → 构建 → 发布”运行。
4. `/exercise` 的数量、统计、地图、深浅模式、隐私替代路线、成就与海报正确，生成 HTML 不包含 `source_id`。
5. 隐私记录没有真实轨迹；公开记录才显示真实路线。
6. 旧月报只有在对应月份的事实真实变化时才修正一次，相同数据不会重复调用模型。
7. 第二次发送完全相同的数据返回 `changed=false`，不产生提交或 Actions 空跑。
8. 两台设备先后或同时同步时记录可以合并；一台设备暂时缺少的记录不会从仓库删除。

满足以上八项，才算“动起来”页面、同步入口和自动发布全部部署完成；只看到 Worker 在线或页面能打开都不算完整验收。

## 不要直接复制生产工作流

根仓库 `.github/workflows/githubblog.yml`、Production 配置和 Cloudflare 项目属于 Koobai 生产实例。新站点应让 AI 根据自己的仓库、分支、平台和 Secret 名称生成独立部署配置，不要直接沿用 Koobai 的账户标识或生产 Worker URL。

## 更新方式

`init` 生成的是独立 Core 快照，不会自动覆盖你后续的主题或内容改动。升级惊蛰时应在独立分支比较上游主题、配置和 Schema 变化，先构建和预览，再合并到自己的站点。
