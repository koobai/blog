# 架构总览

## 系统定位

惊蛰以 Git 仓库作为内容与公开数据的主要事实来源，以 Hugo 生成静态站点，并通过 GitHub Actions 和可选 Serverless 服务补足同步、写作与互动能力。

Hugo 是发布核心，但完整系统还包括内容采集、数据加工、动态服务和部署四个边界。

## 主要组件

| 组件 | 当前职责 | 事实来源 |
|---|---|---|
| Hugo | 页面、SEO/分享元数据、RSS、JSON、Sitemap 和静态资源生成 | `config/`、`content/`、`themes/`、`static/` |
| 惊蛰 v3 | 布局、响应式设计、深浅主题和功能页面 | `themes/jingzhe_v3/` |
| 网页编辑器 | 写随笔、写唠叨、图片上传、草稿和 GitHub 写回 | `newlaodao.html`、`newsuibi.html` |
| 观影同步 | 从豆瓣增量写入 `movie.json` | `sync_movies.py`、`douban.yml` |
| 运动管线 | 数据清洗、隐私路线、趣味标题和月报触发 | `process_activities.py` |
| AI 月报 | 聚合证据、模型调用、校验和状态冻结 | `monthly_coach.py` |
| 动态服务 | 评论、点赞、发布、图片和云草稿 | `workers/` 中四个独立 Cloudflare Worker |
| GitHub Actions | 同步、测试、处理、构建和部署 | `.github/workflows/` |

## 数据流

```mermaid
flowchart TD
    P["长篇随笔"] --> R["GitHub 仓库"]
    L["唠叨短动态"] --> R
    E["网页编辑器"] --> PW["Publisher Worker"]
    PW --> R
    DB["豆瓣"] --> DA["Douban Action"]
    DA --> R
    APP["原生 App / 快捷指令"] --> R
    R --> AP["Activity Pipeline"]
    AP --> MC["Monthly Coach"]
    AP --> R
    MC --> R
    R --> H["Hugo Build"]
    H --> OUT["HTML / RSS / JSON / Sitemap"]
    OUT --> CF["Cloudflare Pages"]
    VISITOR["访问者"] <--> CW["Comments Worker"]
    VISITOR <--> LW["Likes Worker"]
    CF --> VISITOR
```

## Worker-independent 能力与动态增强

### 不依赖 Worker 的能力

以下能力应在没有任何 Worker 的情况下可用：

- 文章与唠叨展示。
- 标签和分类。
- 深浅主题。
- RSS、JSON 和 Sitemap。
- Full Profile 中的观影 JSON 静态展示。
- Full Profile 中的已处理运动 JSON 静态展示。

最小 Core Starter 只包含文章、唠叨、主题、标签和标准静态输出，不复制 Koobai 的观影或运动数据。

### 动态增强

以下能力依赖外部服务：

- 评论与点赞。
- 管理员网页写作。
- 图片上传。
- 云草稿。
- GitHub 内容写回。

动态增强不可成为 Core 构建的强制依赖。服务缺失时功能必须隐藏或降级，而不是导致构建失败。

## 内容事实来源

- 文章与唠叨以 Markdown 为事实来源。
- 观影以 `assets/movie.json` 为事实来源。
- 运动展示以处理后的 `assets/activities.json` 为事实来源。
- AI 月报以 `assets/monthly_insights.json` 为事实来源。
- `public/` 和 `resources/` 是生成结果，不是事实来源。

## 生产环境与通用发行版

当前仓库首先服务 Koobai 的生产站点，同时提供两个明确分离的视图：

- Production：保留 Koobai 当前完整功能、内容、域名和工作流。
- Core Starter：由工具按需生成通用配置和最小合成内容，不依赖 Koobai 私有服务。

`koobai.com` 是唯一在线演示。Starter 不作为仓库内第二套站点维护，而是在临时目录或用户指定的新目录中从同一主题 Core 子集生成；默认 `hugo` 始终使用 Production。

## Worker 服务边界

动态服务按实际数据与权限拆为四个独立部署单元：

1. Publisher：管理员认证、GitHub 写回和 R2 图片上传。
2. Drafts：管理员云草稿与独立 D1。
3. Comments：公开评论、回复通知、管理删除与独立 D1。
4. Likes：公开点赞、访客去重与独立 D1。

高权限 Publisher 不与公开互动接口共享 GitHub/R2 凭据，Comments 也不与 Likes 共享邮箱数据库。完整边界见 [Worker 说明](../workers/README.md)。

## 前端与数据模块契约

共享模块用于减少重复事实来源，不改变 Koobai 已有操作流程。

### 在线编辑器 Core

`static/js/editor-core.js` 被 `/newlaodao` 和 `/newsuibi` 同步加载，集中提供：

- 固定的管理员 Token LocalStorage 访问。
- UTF-8 与 Base64 转换。
- 带 `x-admin-token` 的 Worker 请求。
- 本地 JSON 草稿读、写和删除。
- 标签 RSS/XML 读取。
- WebP 图片压缩与 Publisher 上传。
- Markdown 预览入口。
- GitHub Repository、Commits 和 Contents URL 构造。

页面仍保留各自不同的 UI、Front Matter、唠叨位置、云草稿、文章摘要和标签交互。共享模块不决定业务内容格式。

不可变兼容项：

- `koobai_admin_token`
- `koobai_laodao_draft`
- `koobai_article_draft`
- `x-admin-token`
- `/api/github` 与 `/api/upload?name=`
- `content/laodao/YYYY/MM/` 与 `content/posts/`
- 原有提交信息、Front Matter 字段和 PUT payload

这些契约由 Python 源码测试和 Node 浏览器原语测试共同保护。

### 运动单一数据源

`data/jingzhe/exercise.json` 是运动展示与处理枚举的唯一数据源，包含：

- 运动中文名和展示名。
- 颜色和默认标题。
- 距离动词与距离分组。
- 骑行、跑步、步行和汇总分组。
- 15 种趣味热量换算及 11 种月度候选。

三个消费者使用同一文件：

1. `process_activities.py` 在数据处理期生成展示名称、运动类型文案和成就字段；Hugo 只负责展示。
2. `static/js/exercise-ui.js` 使用注入的契约处理颜色、类型聚合和月度能量文案。
3. `jingzhe/exercise_contract.py` 为 `process_activities.py` 与 `monthly_coach.py` 提供 Python 常量。

`schemas/data/exercise-contract.schema.json` 描述公开结构，`jingzhe.py validate` 额外检查颜色、分组引用和食物 Key 唯一性。

`assets/landmark_route_library.json` 是公共地标的唯一数据源，同时包含路线几何、距离/爬升参照和选择范围。Python 处理器与浏览器地图从同一份 JSON 读取，不再分别维护地标列表。

### AI Provider 边界

`monthly_coach.update_monthly_insights` 接受可选 `report_provider`。状态机只依赖：

- `provider.generate(facts)`
- `provider.model`

默认适配器仍是 `DeepSeekReportProvider`，内部继续调用原有 DeepSeek 请求、重试和报告校验代码。未传 Provider 时的环境变量、模型名、冻结、迟到数据修正、隐私过滤和输出 JSON 均保持不变。

测试可以注入不联网的 Fake Provider，从而独立验证证据与状态机；未来增加其他模型时，不需要改动月中/月末状态迁移。

### 功能关闭行为

Core Starter 不包含在线编辑器、运动页面、Mapbox、评论和可选脚本。Production/Development 的 Full Profile 保持原有页面和依赖。可选模块的源码可以存在于上游仓库，但关闭功能后不会进入生成的 Core 站点。
