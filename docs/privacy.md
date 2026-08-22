# 隐私与外部数据边界

## 目标

惊蛰会处理文章、位置、评论邮箱、观影记录、运动轨迹和健康统计。开源整理必须让数据来源、公开范围和第三方传输边界可见、可配置、可测试。

本文描述当前代码与部署必须遵守的边界，不替代各外部服务的隐私政策。

## 数据分类

| 数据 | 当前位置 | 公开状态 | 控制方式 |
|---|---|---|---|
| 文章与唠叨 | `content/` | 公开 | 个人内容与代码分层授权 |
| 图片链接 | Markdown、模板和 JSON | 公开 | Starter 使用合成或可再分发资源 |
| 走过地点 | 三类 Markdown 的 `zouguo.place` | 公开 | 发布前确认精度与 `privacy`；生成 feed 不提高精度 |
| 观影记录 | `assets/data/movies.json` | 公开 | Schema 校验、使用者自己的数据与可选同步 |
| 运动统计 | `assets/data/exercise/activities.json` | 公开 | Schema、字段最小化与隐私测试 |
| 原始运动事实 | `data/exercise/activities.json` | 仓库内数据源 | App 端隐私判断、Gateway 校验、不得直接注入浏览器 |
| 公开运动轨迹 | `summary_polyline` | 公开 | 必须由用户明确选择公开 |
| 隐私运动 | 地标替代路线 | 公开替代结果 | 原始轨迹不得参与公开绘制 |
| AI 月报 | `assets/data/exercise/monthly-insights.json` | 公开 | 模型只接收聚合证据 |
| 评论资料 | Worker 数据库 | 部分公开 | 邮箱不得返回浏览器 |
| 管理员凭据 | Secrets / 浏览器状态 | 私密 | 不进入 Git、日志和示例包 |

## 运动隐私契约

- App 上传显式 `route_status`：`available` 才能携带公开 `summary_polyline`；`privacy_hidden` 只显示公共地标替代路线；`pending` 和 `unavailable` 保留运动记录但不得携带或绘制轨迹。博客仍兼容旧数据中的 `indoor` 状态，并同样禁止其携带轨迹。
- 隐私记录只能使用公共地标路线库进行可视化。
- 地标路线可根据真实距离截取或以线宽表达次数，但不得使用原始轮廓。
- 住宅、小区、公司、学校、酒店等私密或琐碎地点不能作为公开地点标题。
- 发给 AI 的证据不能包含精确坐标、Polyline、路线 ID、`source_id` 或活动身份字段。
- 原始 `external_id` 和处理后的 `source_id` 只用于仓库内幂等与缓存；Hugo 注入给浏览器的轻量数据和 AI payload 均不包含它们。
- 修改上述逻辑时必须增加测试。

## 走过地点隐私契约

- Markdown 只保存准备公开的坐标，不保存设备原始 GPS 副本；`privacy: reduced` 必须在进入仓库前降低精度并丢弃原始值。
- 地图、生成 JSON、行政区回查和图片卡片不得把坐标精度提升到 Markdown 声明以上。
- 住宅、学校、公司、酒店房间等敏感地点应使用模糊坐标、公共地标或只保留城市级名称；公开照片的 EXIF 也应在上传前按客户端策略处理。
- Starter、文档样例和测试只能使用合成地点，不得复制 Koobai 的真实历史位置、家庭照片或第三方个人行程。
- `longitude` 与 `latitude` 分开保存；GeoJSON/前端使用 `[longitude, latitude]`。顺序错误既是数据质量问题，也可能错误暴露另一个地点。

## AI 数据边界

模型可接收：

- 月度运动次数与活跃天数。
- 聚合里程、时长、热量、心率和爬升。
- 运动类型分布。
- 与上一阶段的确定性比较。
- 程序筛选后的证据 ID 和事实文本。

模型不可接收：

- 原始轨迹与坐标。
- 起点、终点和住宅信息。
- 原始来源 ID。
- 姓名、邮箱或其他账户标识。
- 未经程序计算的完整活动对象。

不开启 AI 时，统计功能应继续工作。

## 评论隐私契约

Comments Worker 已实施以下隐私边界：

- 邮箱只在服务端保存和处理。
- 浏览器只接收 SHA-256 `avatar_hash`，不接收真实邮箱。
- 删除与管理员验证使用独立认证，不通过公开邮箱触发管理模式。
- API 文档明确公开字段和管理字段。

前端保留读取旧 `email` 响应的兼容分支，因此可以先发布前端再迁移 Worker，不要求 Koobai 同时切换生产服务。隐私行为由 `tests/test_workers.mjs` 和模板契约测试覆盖。

## Starter 与 Release 包

Starter 和发布压缩包不得包含：

- 真实家庭照片。
- 真实精确位置。
- 真实运动轨迹。
- 真实健康记录。
- 评论邮箱。
- 管理员 Token 或 API Secret。
- Koobai 的生产 Worker 管理配置。

初始化内容和测试数据应为合成数据，并在文件中明确标注。

## Secrets

- 私密值只进入环境变量、GitHub Secrets 或 Worker Secrets。
- `.env.example` 只列名称和说明。
- 测试必须使用明显无效的占位值。
- 错误信息和 CI 日志不得打印完整 Secret。
- 公开 Site Key 与私密 Secret Key 应使用不同配置名称。

## 自动检查

- AI payload 不包含禁用字段。
- Starter 不包含生产数据。
- 评论响应不包含邮箱。
- 仓库不存在疑似私密 Token。
- 公开 JSON 字段符合最小化 Schema。
