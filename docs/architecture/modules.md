# 前端与数据模块契约

本页记录共享模块及其生产兼容边界。模块化的目标是减少重复事实来源，不改变 Koobai 已有操作流程。

## 在线编辑器 Core

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

## 运动单一数据源

`data/jingzhe/exercise.json` 是运动展示与处理枚举的唯一数据源，包含：

- 运动中文名和展示名。
- 颜色和默认标题。
- 距离动词与距离分组。
- 骑行、跑步、步行和汇总分组。
- 15 种趣味热量换算及 11 种月度候选。

三个消费者使用同一文件：

1. Hugo 的 `exercise.html` 在构建期生成卡片名称、颜色和浏览器配置。
2. `static/js/exercise-ui.js` 使用注入的契约处理颜色、类型聚合和月度能量文案。
3. `jingzhe/exercise_contract.py` 为 `process_activities.py` 与 `monthly_coach.py` 提供 Python 常量。

`schemas/data/exercise-contract.schema.json` 描述公开结构，`jingzhe.py validate` 额外检查颜色、分组引用和食物 Key 唯一性。

## AI Provider 边界

`monthly_coach.update_monthly_insights` 接受可选 `report_provider`。状态机只依赖：

- `provider.generate(facts)`
- `provider.model`

默认适配器仍是 `DeepSeekReportProvider`，内部继续调用原有 DeepSeek 请求、重试和报告校验代码。未传 Provider 时的环境变量、模型名、冻结、迟到数据修正、隐私过滤和输出 JSON 均保持不变。

测试可以注入不联网的 Fake Provider，从而独立验证证据与状态机；未来增加其他模型时，不需要改动月中/月末状态迁移。

## 功能关闭行为

Core Starter 不包含在线编辑器、运动页面、Mapbox、评论和可选脚本。Production/Development 的 Full Profile 保持原有页面和依赖。可选模块的源码可以存在于上游仓库，但关闭功能后不会进入生成的 Core 站点。
