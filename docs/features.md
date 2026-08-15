# 功能与安装层级

## 设计原则

- Core 永远可以独立构建。
- 可选模块默认可以关闭。
- 缺少外部服务时应隐藏或降级。
- AI 只询问当前 Profile 真正需要的配置。
- Production 可启用全部功能，Starter 默认使用最少权限。

## Profile 1：Core

默认推荐的基础站点。

包含：

- 长篇随笔。
- 唠叨短动态。
- 首页统一时间流。
- 标签和分类。
- 深浅主题。
- 响应式布局。
- 图片灯箱与 Markdown 渲染钩子。
- RSS、JSON、Sitemap、Manifest 和 SEO/分享元数据。

依赖：Hugo Extended。

无外部服务时：完整可用。

## Profile 2：Publisher

在 Core 基础上增加浏览器写作。

包含：

- 新建和修改文章。
- 新建和修改唠叨。
- Markdown 预览。
- 图片压缩与上传。
- 标签补全。
- 本地草稿与云草稿。
- GitHub 内容写回。
- 管理页面默认禁止搜索引擎索引。

依赖：Publisher Worker、GitHub 凭据和图片存储。

未启用时：管理页面隐藏；仍可通过本地 Markdown 或 GitHub 编辑内容。

## Profile 3：Social

包含：

- 评论。
- 多层回复。
- 评论分页。
- 点赞。
- 表情。
- Turnstile。
- 评论管理。

依赖：Comments/Likes Worker、D1 与 Turnstile。

未启用时：评论和点赞入口隐藏，不影响页面主体。

## Profile 4：Life Data

包含：

- 豆瓣观影新增与已有记录更新同步。
- 电影票式观影页面。
- 多运动类型统计。
- 年度趋势、月历和心率区间。
- Mapbox 轨迹和主题联动。
- 公开轨迹与隐私替代路线。
- 运动成就和 WebP 海报。

依赖：Python、Mapbox、观影或运动数据来源。如需从 App 或外部平台自动写入运动事实，另部署不依赖 D1/R2 的 Activity Sync Worker；手工维护数据时不强制使用。

未启用时：对应菜单和页面隐藏；Core 不受影响。

## Profile 5：AI Coach

包含：

- 月中报告。
- 月末最终报告。
- 上月同期与完整月比较。
- 程序生成的证据集合。
- 输出字段和证据校验。
- 报告冻结、迟到数据修正和历史模型保留。

依赖：模型 API。

未启用时：继续生成确定性的月度统计和状态文字，不调用模型。

## 当前实现状态

| 模块 | 当前生产实现 | 开源使用方式 |
|---|---|---|
| Core | 已实现 | 使用通用配置、功能开关、合成内容与按需初始化 CLI |
| Publisher | 已实现，生产仍使用 Koobai Worker | Publisher/Drafts 源码、示例配置和迁移已完成；生产切换由用户决定 |
| Social | 已实现，生产仍使用 Koobai Worker | Comments/Likes 源码与隐私修复已完成；前端兼容新旧响应 |
| Movies | 已实现 | 使用功能开关、Schema 与自己的观影数据 |
| Exercise | 已实现 | 使用功能开关、Schema、自己的运动数据和 Mapbox 公开参数；自动同步可自建 Activity Sync Gateway |
| AI Coach | 已实现 DeepSeek | Provider 可注入；证据、隐私过滤和状态机不依赖具体模型客户端 |

## 机器可读功能注册表

`data/jingzhe/features.json` 记录：

- 功能 ID 和名称。
- 所属 Profile。
- 默认开关。
- 公共配置。
- 所需 Secrets。
- 所需数据文件。
- 服务缺失时的降级方式。
- 构建和测试命令。
- 隐私影响。

AI 初始化工具读取该注册表，而不是通过搜索源码推断依赖。
