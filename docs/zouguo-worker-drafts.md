# 走过 Publisher 与统一草稿

第 5 步只整理、实现和本地验证服务源码，不部署 Cloudflare，也不对生产 D1 执行迁移。

## Publisher

线上导出的唠叨 Worker 保存在 `workers/publisher/reference/`，只用于确认旧 App 契约。正式 Worker 同时保留旧 App 路径和现有通用代理，并新增独立走过的详情、发布和删除接口。

新建走过使用 `requestId`/`Idempotency-Key` 生成稳定 Markdown 路径。Worker 每次写入前读取目标文件：内容相同则不提交，内容不同则带当前 SHA 更新。这样客户端超时重试不会多生成一条内容。

## D1 草稿迁移

`0002_unified_drafts.sql` 在原 `laodao_drafts` 表增加 `kind` 和 `payload_json`。旧字段继续保留，旧行在迁移时被包装成 `laodao` payload；Worker 返回旧字段和新字段，因此旧客户端可以继续解码，新客户端能恢复走过的完整编辑状态。

D1 仍只是草稿暂存，发布成功后形成的 Markdown 才是正式内容唯一来源。
