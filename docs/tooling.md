# AI 工具链

`tools/jingzhe.py` 是惊蛰面向人类和 AI 编程助手的统一维护入口，只依赖 Python 标准库。它不会发送仓库数据到外部服务，也不会改变 Koobai 已有的本地写作、网页发布、数据同步和 Cloudflare Pages 部署方式。

## 设计边界

- [koobai.com](https://koobai.com) 是唯一在线演示和 Full Profile 参考实现。
- 不维护第二个演示站或第二套需要同步的内容。
- Core 只在临时目录、用户指定的新目录或 Starter 打包任务中按需生成。
- `init` 不复制根目录真实 `content/`、`assets/` 或生产配置。
- 所有写入命令拒绝覆盖已有目录或文件。
- 历史 `content/` 只读。Secret 扫描可报告旧教程代码特征，但不会要求自动改写文章。

## 推荐流程

```bash
python3 tools/jingzhe.py doctor
python3 tools/jingzhe.py validate
python3 tools/jingzhe.py check
```

AI 应先运行 `doctor --json` 获取稳定字段，再根据 `errors`、`warnings` 和每项检查的 `id` 决定下一步。命令成功返回退出码 `0`，阻断错误返回非零退出码。

## doctor

```bash
python3 tools/jingzhe.py doctor
python3 tools/jingzhe.py doctor --environment development --json
```

检查 Git、Hugo Extended、Python、Node、当前 Profile 和已启用功能所需的公开配置。工作区有未提交改动时只发出警告，工具不会覆盖这些改动。

## validate

```bash
python3 tools/jingzhe.py validate --json
```

校验以下机器契约：

- JSON Schema 和功能注册表可解析。
- Production 与 Development 配置可解析且公开实例配置没有漂移。
- 已启用功能的公开参数完整。
- 五个 Worker 的源码、示例配置、OpenAPI 与 D1 迁移文件完整。
- 观影、运动和月报数据满足当前结构约束。

校验只读取历史内容和数据，不会批量格式化或回写文件。

## check

```bash
python3 tools/jingzhe.py check
```

完整门禁包含：

- Production 严格 Hugo 构建。
- Production 内部链接与静态资源检查。
- 临时 Core Starter 生成、严格构建、链接检查和生产身份扫描。
- 浏览器与 Worker JavaScript 语法检查。
- 浏览器、运动与 Worker 契约测试。
- Python 单元测试。
- 代码、配置、工作流和 Starter 的高置信度 Secret 扫描。

`tests/` 是上述兼容与隐私契约的测试源码，不是 Hugo 生成目录。`check` 会自动发现全部 `test_*.py`、`test_*.js` 和 `test_*.mjs`；增加或删除测试文件时无需手工维护一份重复清单。测试不会复制进 Core Starter，也不会进入生成的网站。

生产站已经停用但仍存在于历史内容中的路径记录在 `data/jingzhe/linkcheck_allowlist.json`。这不是重新启用旧链接，也不会修改旧文章。

## init

在仓库外选择一个不存在的新目录：

```bash
python3 tools/jingzhe.py init \
  --output ../my-jingzhe \
  --title "我的站点" \
  --author "作者名" \
  --description "站点说明" \
  --base-url "https://example.org/"
```

当前安全初始化只开放 `core` Profile。工具会生成通用配置、Core 主题子集、Archetype、Schema 和两条明确标注的合成内容，然后自动执行严格构建与隐私扫描。失败时会清理本次创建的半成品目录。

工具拒绝写入 `/`、用户主目录、当前生产仓库或任何已经存在的路径。需要重试时应选择新的输出目录，不应让 AI 删除未知目录。

## starter

```bash
python3 tools/jingzhe.py starter --output /tmp/jingzhe-core-starter.zip
```

Starter 与 `init` 使用同一生成路径，并在打包前完成构建和隐私扫描。压缩包包含 `STARTER_MANIFEST.json`，明确声明 Profile 和生产内容/Secret 状态。输出 ZIP 已存在时拒绝覆盖。

GitHub 的 `Build Core Starter` 工作流只支持手动触发并上传构建产物；它不部署网站，也不读取生产 Secrets。

## Pull Request CI

`.github/workflows/quality.yml` 在 Pull Request 上运行统一 `check`。它具有只读仓库权限，不部署、不提交文件，也不使用 Koobai 的生产 Secrets。正式站仍由 `githubblog.yml` 部署到 Cloudflare Pages；数据同步与月报继续使用各自独立的工作流。

## JSON 输出

所有命令都支持 `--json`。顶层稳定字段为：

```json
{
  "ok": true,
  "command": "validate",
  "checks": [],
  "errors": [],
  "warnings": []
}
```

新增字段可以向后兼容地出现。AI 应按 `id` 和 `ok` 判断检查状态，不应解析中文日志或依赖检查数组的固定顺序。
