# 用 AI 快速安装惊蛰

这是惊蛰面向普通使用者的推荐入口。你不需要先读完全部文档：把仓库地址和下面的指令交给能够读取 GitHub 仓库、运行终端命令的 AI 编程助手即可。

## 开始前只需决定

- 站点名称、作者和简介。
- 暂时使用本地地址，还是已经有域名。
- 部署平台，例如 Cloudflare Pages、GitHub Pages 或自己的服务器。
- 先使用只需要 Hugo 的 Core，还是继续启用网页写作、评论点赞、生活数据或 AI 月报。

不确定时选择 Core。它不依赖 Worker、数据库、地图或模型 API，以后仍可逐项增加功能。

<a id="copy-ready-ai-prompt"></a>

## 可直接复制给 AI 的指令

将下面整段与本仓库地址一起发送给 AI：

```text
请帮我安装并部署这个惊蛰博客项目。

1. 先完整阅读 README.md、AGENTS.md、docs/quick-start.md、docs/features.md、docs/configuration.md 和 docs/deployment.md，不要通过全仓库替换 koobai 或域名来安装。
2. 先询问我：站点名称、作者、简介、域名、部署平台、需要的功能 Profile，以及是否迁移已有 Hugo 内容。没有明确选择时使用 Core。
3. 先运行 python3 tools/jingzhe.py doctor --json；然后使用 init 在仓库外一个不存在的新目录生成站点。不要复制根仓库的 content/、assets/、Koobai 品牌或生产服务配置。
4. 修改新站点的通用配置并运行 Hugo 严格构建。交付前运行适用的 validate/check、站内链接和隐私检查。
5. 如果我选择 Publisher、Social、Life Data 或 AI Coach，再读取对应文档，只询问该功能真正需要的公开配置和 Secret。选择“动起来”时，必须按 docs/deployment.md 的端到端清单执行，并继续读取 docs/privacy.md、workers/activity-sync/README.md 和运动同步 Schema；不要把“打开 exercise 功能开关”等同于已经安装完整模块。五个 Worker 必须保持独立权限。
6. 在登录账户、创建云资源、写入 GitHub、部署 Worker、修改 DNS 或改变生产状态前，先说明影响并单独征得我的同意。
7. 最后告诉我：创建或修改了哪些文件、哪些功能已启用、哪些 Secret 仍需配置、运行了哪些测试，以及访问地址。
```

如果还需要从自己的运动数据源自动同步，可将下面这句与上述指令一起发送：

```text
帮我部署惊蛰博客和 Activity Sync Worker，并把我的 Keep/Health Connect 数据转换成 exercise-sync-v1 协议进行同步。
```

AI 应先确认你实际使用的数据源、可用的导出或读取方式以及隐私轨迹规则；项目提供同步协议、Gateway 和博客处理链，不提供公共 Gateway 地址，也不会代替用户取得第三方平台数据。

## AI 应执行的 Core 路径

```bash
git clone https://github.com/koobai/blog.git
cd blog
python3 tools/jingzhe.py doctor --json
python3 tools/jingzhe.py init \
  --output ../my-jingzhe \
  --title "我的站点" \
  --author "作者名" \
  --description "站点简介" \
  --base-url "https://example.org/"
cd ../my-jingzhe
hugo server
```

`init` 只接受不存在的新目录，生成后会自动执行严格构建和隐私扫描。生成站点包含 MIT License、合成示例内容和必要的第三方许可证，不包含 Koobai 的真实文章、数据、图片和 Worker 地址。

## 启用更多功能

| 需求 | AI 接下来读取 |
|---|---|
| 浏览器写文章、传图片、云草稿 | `workers/README.md`、`workers/publisher/README.md`、`workers/drafts/README.md` |
| 评论与点赞 | `workers/README.md`、`workers/comments/README.md`、`workers/likes/README.md` |
| 部署完整“动起来”页面 | `docs/deployment.md` 的“部署动起来页面”、`docs/privacy.md`、`docs/configuration.md` |
| 从 App 或其他来源同步运动 | `workers/README.md`、`workers/activity-sync/README.md`、`schemas/data/exercise-sync-v1.schema.json` |
| 观影与地图 | `docs/features.md`、`docs/privacy.md`、`docs/configuration.md` |
| AI 运动月报 | `docs/features.md`、`docs/privacy.md`、`docs/architecture.md` |
| 修改现有 Koobai 生产仓库 | `AGENTS.md`、`docs/compatibility.md` |

完整功能不是“一键无确认部署”：GitHub Token、Cloudflare D1/R2、Turnstile、Mapbox 和模型 API 都属于用户自己的外部资源。AI 可以协助创建和配置，但必须在外部写入前获得授权。

`init` 当前只生成 Core，不包含“动起来”页面和运动处理自动化。AI 若要为新站点启用运动功能，必须明确区分“复制 MIT 程序模块”和“导入用户自己的运动数据”，不得复制 Koobai 的文章、真实运动记录、轨迹、品牌配置或生产服务地址。
