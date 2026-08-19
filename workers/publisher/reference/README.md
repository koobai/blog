# Publisher 线上参考快照

`koobai-app-laodao.js` 是 2026-08-20 从已部署 Cloudflare Worker 手动导出的参考快照，保留当时 App 上传、唠叨详情、删除和发布接口的真实行为。

该目录不是 Worker 构建入口，不会被部署，也不应直接覆盖 `workers/publisher/src/index.js`。后续走过发布开发只用它核对线上兼容契约，改动仍应落在正式源码、OpenAPI 和自动化测试中。

快照未包含具体密钥，仅引用 Worker 运行时绑定 `ADMIN_TOKEN`、`GH_TOKEN` 和 `R2_BUCKET`。
