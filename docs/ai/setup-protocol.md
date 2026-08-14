# AI 安装与维护协议

## 目的

本协议描述 AI 编程助手如何安装、配置和维护惊蛰。Core 初始化与统一检查已经可用；需要外部账户的 Publisher、Social 和部署动作仍保持显式选择。

## AI 开始前必须读取

1. 根目录 `AGENTS.md`。
2. `docs/architecture/compatibility.md`。
3. `docs/features/overview.md`。
4. 与本次任务对应的功能文档。

不得通过全仓库替换 `koobai`、域名或服务地址来完成通用安装。

## 目标安装流程

### 第一步：项目体检

AI 运行统一的 `doctor` 命令，确认：

- Hugo 是否安装且为 Extended。
- Git 和必要运行时是否存在。
- 当前仓库是否有未提交改动。
- 当前环境的 Profile 和已启用功能是否缺少公开配置。

`doctor` 不读取或验证 Secret 值。AI 应从 `data/jingzhe/features.json` 了解所选功能需要哪些 Secret，只在用户启用该功能后询问。

### 第二步：选择 Profile

默认推荐 Core。AI 不应默认启用需要高权限或第三方数据传输的功能。

可选：

- Core
- Publisher
- Social
- Life Data
- AI Coach
- Full

### 第三步：只询问必要信息

基础问题控制在以下范围：

1. 站点名称。
2. 域名或暂用本地地址。
3. 作者名称。
4. 站点描述。
5. Profile。
6. 部署目标。
7. 是否保留示例内容。
8. 是否迁移已有 Hugo 内容。

只有用户启用相应功能后，才继续询问 Mapbox、评论、GitHub 写回、图片存储或模型配置。

### 第四步：生成新目录

初始化工具优先在指定输出目录创建新站点，而不是破坏性修改参考仓库：

```bash
python3 tools/jingzhe.py init --profile core --output ../my-blog
```

当前 `init` 会：

- 使用通用配置。
- 复制主题。
- 创建两条明确标注的合成示例内容。
- 排除 Koobai 个人内容、生产数据和可选 Worker 配置。
- 复制 MIT License 与 Core 所需的第三方许可证。
- 自动运行严格 Hugo 构建和生产身份扫描。

### 第五步：验证

AI 必须在交付前完成：

- 配置 Schema。
- 数据 Schema。
- 严格 Hugo 构建。
- JavaScript 语法。
- Python 测试（启用相关模块时）。
- 站内链接。
- 隐私契约。

### 第六步：部署

部署是独立动作。AI 在需要登录第三方账户、创建服务、写入远端仓库或改变生产状态前，应向用户说明目标和影响并取得相应授权。

## 维护协议

AI 接到修改任务时：

1. 确认任务属于哪个模块。
2. 确认是否影响 Production。
3. 找到该模块的唯一配置源和数据契约。
4. 避免同时改变 UI、数据格式和 API。
5. 运行模块检查和完整生产构建。
6. 汇报是否改变用户现有流程。

## 错误输出

工具支持人类文本和 JSON 两种输出。稳定顶层字段如下：

```json
{
  "ok": false,
  "command": "check",
  "checks": [],
  "errors": ["具体阻断原因"],
  "warnings": [],
  "next": "建议的下一步"
}
```

AI 不应依赖不稳定的日志文本推断失败原因。

## 当前能力边界

- Core 初始化 CLI 只写入不存在的新目录；Full Profile 不自动复制为新站点。
- Worker 源码和部署契约位于 `workers/`，但工具不会创建 Cloudflare 账户资源、写入 Secret 或部署服务。
- 生产公开服务地址集中在 `config/production/` 与 `config/development/`；现有 Koobai URL 不会被示例配置自动替换。
- 当前仓库包含真实个人内容和数据，Starter 不复制这些文件。
- 分层许可证已经确认；AI 必须保留真实内容、数据、图片和 Koobai 品牌的排除边界。

因此当前可以构建生产参考站、生成带 MIT License 和第三方归属文件的隔离 Core 新站点，并在用户明确选择后按四个独立权限边界配置 Worker。任何 GitHub/Cloudflare 外部写操作仍是独立授权动作。
