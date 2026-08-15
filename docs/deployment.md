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

- Publisher、Drafts、Comments 和 Likes：先按 [`workers/README.md`](../workers/README.md) 在测试域名部署，再回填公开 URL。
- Movies/Exercise：提供符合 `schemas/data/` 的自己的数据；不要复制 Koobai 的生产 `assets/`。
- Exercise：Mapbox Token 是浏览器公开参数，但应限制允许的 URL；原始隐私轨迹不得进入公开数据。
- AI Coach：模型 API Key 只能存放在部署平台 Secret 中，模型只能接收聚合证据。

## 不要直接复制生产工作流

根仓库 `.github/workflows/githubblog.yml`、Production 配置和 Cloudflare 项目属于 Koobai 生产实例。新站点应让 AI 根据自己的仓库、分支、平台和 Secret 名称生成独立部署配置，不要直接沿用 Koobai 的账户标识或生产 Worker URL。

## 更新方式

`init` 生成的是独立 Core 快照，不会自动覆盖你后续的主题或内容改动。升级惊蛰时应在独立分支比较上游主题、配置和 Schema 变化，先构建和预览，再合并到自己的站点。
