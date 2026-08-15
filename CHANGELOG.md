# Changelog

本项目的显著变化记录在此。当前仓库尚未发布版本 Tag；下面汇总 `v3.0.0` 的未发布变更，不代表已经创建正式版本。

## [Unreleased] - v3.0.0

### Added

- 面向人类与 AI 的 README、`AGENTS.md`、架构、功能、配置、隐私和安装协议。
- Production / Development / Core 分层配置、功能开关与机器可读功能注册表。
- Front Matter、站点配置和公开数据 Schema，以及文章/唠叨 Archetype。
- `doctor`、`validate`、`check`、`init` 和 `starter` AI 友好工具链。
- 临时 Core Starter 生成与隐私扫描，不维护第二个演示站。
- 在线编辑器共享模块、运动跨语言单一数据源和可注入 AI Provider。
- Publisher、Drafts、Comments、Likes 四个独立 Cloudflare Worker。
- Wrangler 示例、D1 迁移、OpenAPI 与 Worker 契约测试。
- CI 质量门禁、Starter 构建工作流和开源协作模板。
- 分层 MIT/内容/品牌授权文件和完整第三方许可证副本。
- README 顶部 AI 快速部署入口、可复制安装指令和平台无关的部署契约。
- 集中式 SEO/分享元数据，兼容现有 `image` 与 Hugo `images`，并为随笔、唠叨和独立页面生成对应 JSON-LD。

### Changed

- Koobai 专属身份和公开服务地址从通用默认配置中分离。
- Hugo 模板迁移到当前目录和命名体系；可选功能样式、运行时配置与第三方脚本按功能和页面作用域生成。
- 唠叨推荐改为稳定的相关内容与近期内容，并复用缓存后的卡片渲染。
- 运动展示名称、成就字段和地标选择规则统一在处理阶段与单一数据源中生成，模板和浏览器不再重复业务判断。
- GitHub Actions 的基础 Action 版本保持一致，Hugo 工作流继续跟随 `latest`。
- 评论前端同时兼容旧 `email` 与新 `avatar_hash` 响应。
- Worker 的生产域名、仓库、管理员邮箱和品牌值改为部署变量。
- Publisher 的 GitHub 代理改为精确仓库边界校验。
- Likes 的访客哈希盐改为必需 Secret。
- `html-to-image` 固定为 1.11.13；归属不完整的 coco-message 改为项目自有兼容组件。
- 长期教程按安装、配置、部署、架构、隐私和 Worker 重组，移除过期阶段审计与重复发布草稿。

### Security

- Comments 公开响应不再返回真实邮箱。
- 评论回复只能引用同一页面的父评论。
- 高权限 Publisher 与公开 Comments/Likes 分离部署。
- Starter 和统一检查会扫描生产身份标记与高置信度 Secret。

### Compatibility

- `/newlaodao`、`/newsuibi`、内容路径、Front Matter、LocalStorage Key、Worker 路由/Header 和 Actions 提交约定保持兼容。
- Koobai 当前 GitHub、原生 App、豆瓣、运动、AI 月报和 Cloudflare Pages 流程无需改变。
- `koobai.com` 继续作为唯一在线演示；没有新增第二个演示站。

### Removed

- 停止跟踪 Hugo 构建锁、资源缓存和 Obsidian 本机工作区状态。
- 删除已经确认停用的手动 UpYun 整站部署工作流；浏览器写作的图片上传与图片域名配置保持不变。

### Not released yet

- 尚未创建版本 Tag 或 GitHub Release。
- 尚未部署或切换任何 Cloudflare Worker。
