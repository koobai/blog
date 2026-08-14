# 参与惊蛰

感谢参与惊蛰。这个仓库同时承载 Koobai 的生产站点，因此贡献应优先保持现有内容、URL、发布入口和自动化兼容。

## 开始之前

1. 阅读 `README.md`、`AGENTS.md` 和与改动相关的 `docs/` 文档。
2. 使用 Hugo Extended 0.120.0+、Python 3.9+ 和当前 Node.js LTS。
3. 从独立分支开始，不提交 `.dev.vars`、真实 Token、邮箱、轨迹或生产数据库导出。

## 本地验证

```bash
python3 tools/jingzhe.py doctor
python3 tools/jingzhe.py validate
python3 tools/jingzhe.py check
```

Worker 改动还应单独运行：

```bash
node tests/test_workers.mjs
```

若只想验证可复用 Core，可在仓库外的新目录生成：

```bash
python3 tools/jingzhe.py init --output ../jingzhe-check --title "Jingzhe Check"
```

## Pull Request 范围

- 一个 PR 聚焦一个问题，说明行为变化、兼容影响和验证结果。
- 不批量改写 `content/` 的旧文章、Slug、Front Matter 或停用链接。
- 不把真实 `assets/` 数据复制为示例 fixture。
- 不手工编辑 `public/`、`resources/` 或 Hugo 构建锁文件。
- 不把四个 Worker 合并为共享全部 Secrets 的服务。
- 新配置必须提供空值或明显无效的示例，并说明公开变量与 Secret 的区别。
- 需要迁移生产接口时，先提供兼容层、测试环境和回滚方式。

## Issue 与安全问题

普通问题请使用仓库的 Issue 表单。疑似漏洞、Token 泄露、隐私数据暴露或越权问题不要公开提交，按 `SECURITY.md` 私下报告。

## 授权提醒

提交贡献即表示你有权提供相关改动，并同意该贡献按照根目录 MIT License 发布。请勿提交不兼容许可证的代码、未经授权的图片、Koobai 个人内容、真实生产数据或第三方隐私信息；新增第三方组件必须同时记录精确版本与许可证。
