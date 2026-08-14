# Security Policy

## 支持范围

安全修复面向最新稳定版本和 `main` 分支。旧版本是否回补取决于问题影响和修复风险。

## 私下报告漏洞

请优先使用 GitHub 仓库的 Private vulnerability reporting。若该功能尚未开启，可发送邮件至 `hi@koobai.com`，主题注明 `[Jingzhe Security]`。

请提供：

- 受影响的版本或 Commit。
- 受影响的路由、Worker 或页面。
- 最小复现步骤和影响说明。
- 已采取的安全隔离措施。

不要在公开 Issue 中粘贴 Token、密码、评论邮箱、数据库内容、精确位置或未修复的利用细节。

## 重点安全边界

- Publisher 的 GitHub Token 与 R2 权限。
- 浏览器管理员 Token 和在线写作入口。
- Comments 数据库中的邮箱与回复通知。
- Likes 的访客哈希盐和防刷逻辑。
- 运动轨迹、精确坐标与 AI payload。
- GitHub Actions 与 Cloudflare Secrets。

安全设计和部署要求见 [Worker 部署入口](workers/README.md) 与 [隐私边界](docs/privacy.md)。

## 响应原则

维护者会先确认收到报告，再评估影响、准备兼容修复和发布说明。涉及生产凭据时应先撤销或轮换 Secret；涉及隐私数据时应避免在日志和讨论中扩大暴露范围。
