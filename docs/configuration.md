# 配置、Profile 与 Core 初始化

## 环境边界

惊蛰使用 Hugo 原生配置目录。Hugo 构建会先读取 `config/_default/`，再根据环境叠加对应目录。

| 环境 | 命令 | 内容与数据 | 用途 |
|---|---|---|---|
| Production | `hugo` | 根目录真实内容与数据 | Cloudflare Pages 和正式构建 |
| Development | `hugo server` | 根目录真实内容与数据 | 保持 Koobai 当前本地预览 |
默认命令没有变化。`koobai.com` 是 Full Profile 的唯一在线演示；项目不维护、也不部署第二个演示站。

## 配置目录

```text
config/
├── _default/      # Hugo 结构与最小 Core 默认值
├── production/    # Koobai 生产身份和公开服务配置
└── development/   # 与生产一致的本地预览配置
```

Production 与 Development 中相同的公开值需要同步维护。这是为了同时保留 `hugo` 和 `hugo server` 的原有零参数行为；`python3 tools/jingzhe.py validate` 会检查两者是否漂移。

## 功能开关

功能开关位于 `params.features`：

- `core`
- `publisher`
- `social`
- `movies`
- `exercise`
- `aiCoach`
- `externalShop`

Production/Development 使用 Full。Core 站点由初始化工具在新目录生成；Social 关闭时，主题不会渲染评论、点赞或 Turnstile，也不会要求相关 Worker 配置。

完整依赖、降级方式和隐私影响以 `data/jingzhe/features.json` 为事实来源。

## 公开配置与 Secret

可以进入 Hugo 配置并发送给浏览器的值：

- 站点域名、标题和品牌资源。
- GitHub 仓库公开 owner/name/branch。
- Worker 的公开请求地址。
- Mapbox Public Token。
- Mapbox 浅色/深色样式、默认中心和海报文件名前缀。
- Turnstile Site Key。
- 可选的 Follow RSS `feedId` 与 `userId`。

不得进入 Hugo 配置的值：

- GitHub 写入 Token。
- Worker 管理员密码或签名 Secret。
- Turnstile Secret Key。
- 数据库、对象存储和模型 API Secret。

私密值只能放在 GitHub Secrets、Worker Secrets 或本地环境变量中。

## 生活数据自动化参数

豆瓣 ID 和 Nominatim 请求标识都不是 Secret，但属于具体站点身份，不写在可复用主题中：

- `sync_movies.py` 优先从 `DOUBAN_ID` 环境变量读取账号。Production 工作流优先使用 GitHub Actions Variable `DOUBAN_ID`，脚本和工作流都保留当前站点回退值，因此 Koobai 原有的本地与 Actions 同步无需新增 Secret 或改变命令。
- `process_activities.py` 优先从 `NOMINATIM_USER_AGENT` 和 `NOMINATIM_REFERER` 读取公开地理编码请求标识；脚本保留当前 Production 回退，工作流也已显式提供同一站点值。

其他使用者应替换为自己的账号与可识别的站点地址，不直接沿用 Koobai Production 标识。

## Core 初始化隔离

`python3 tools/jingzhe.py init` 只允许写入一个不存在的新目录，并生成 Core 所需的最小配置、主题、合成欢迎内容和静态资源。它不读取或复制根目录的真实 `content/`、`assets/`、生产配置与可选功能页面。

生成结果必须通过严格构建和生产身份扫描；不得包含真实文章、家庭照片、位置、运动轨迹、健康记录、评论邮箱或 Koobai 服务地址。

## Schema 与 Archetype

- `schemas/frontmatter/`：文章与唠叨 Front Matter。
- `schemas/data/`：观影、运动、地标路线与月报 JSON。
- `schemas/site-params.schema.json`：站点参数。
- `archetypes/posts.md`：新文章模板。
- `archetypes/laodao.md`：新唠叨模板。

Schema 用于新内容提示和验证，不用于批量改写历史文件。

## SEO 与分享卡片

主题会在构建时统一生成页面描述、Canonical、Open Graph、X/Twitter Cards 和 JSON-LD：

- 随笔和唠叨按文章处理，自动带上发布时间、修改时间和标签。
- 独立页面与列表按网站页面处理，不会误标为文章。
- `description` 为空时，单篇内容使用正文摘要，其他页面回退到站点首页说明。
- 现有 `image` 字段继续作为封面和分享图；同时兼容 Hugo 常见的 `images` 列表，不要求改写历史内容。
- 没有分享图时使用普通摘要卡片，只有存在图片时才声明大图卡片。

站点作者可以通过 `params.author.name` 配置；配置后会进入文章结构化数据。SEO 适配只改变生成页面的 `<head>`，不改变正文、URL、评论或点赞标识。

## 当前构建命令

生产：

```bash
hugo --minify --panicOnWarning
```

Core 初始化：

```bash
python3 tools/jingzhe.py init --output ../my-jingzhe --title "我的站点"
```
