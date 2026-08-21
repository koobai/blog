# 走过数据契约

本文档记录已经落地的业务语义。实际机器约束位于 `schemas/frontmatter/` 和 `schemas/data/zouguo-feed-v1.schema.json`；后者因兼容原因保留历史文件名，但当前契约版本为 v2。

## 一句话原则

Markdown 是唯一事实来源；生成 JSON 只是 Hugo 对三类 Markdown 的归一化读模型，便于地图和时间线一次读取。

这两者不是两份需要人工同步的数据：

1. App 或网页编辑器只写 Markdown。
2. Hugo 在构建期扫描、校验和归一化。
3. JSON 由构建自动产生，不接受手工编辑。
4. 删除 Markdown 或移除“走过”Tag 后，下次构建自动删除对应 JSON 项。

## 三类来源

| 来源 | 进入条件 | 正文在卡片的用法 | 图片来源 | 点击去向 |
|---|---|---|---|---|
| 独立走过 | `content/zouguo/` 下且 `type: "zouguo"` | 显示短文字 | 按 Markdown 出现顺序 | 走过记录自身 |
| 唠叨 | `laodaotags` 含“走过” | 显示唠叨短文字 | 按 Markdown 出现顺序 | 原唠叨 |
| 随笔 | `tags` 含“走过” | 只显示标题，不复制长正文 | 封面图优先，再按正文顺序去重 | 原随笔详情页 |

“走过”是唯一触发 Tag，不扫描其他名称。

## 共享 Front Matter 块

三类来源都使用同一个 `zouguo` 嵌套块，避免用一段地名文字反复地理编码。

```yaml
zouguo:
  occurred_at: 2026-08-19T18:20:00+08:00
  place:
    id: cn-zj-hz-example-lake
    name: 示例城 · 湖边
    longitude: 120.01
    latitude: 30.01
    precision: poi
    country: 中国
    country_code: CN
    region: 示例省
    region_code: CN-EX
    locality: 示例城
    locality_code: EXAMPLE
    provider: mapbox
    provider_id: example-provider-id
```

### 时间语义

- `date` 是 Markdown 的发布时间。
- `zouguo.occurred_at` 是真正经过该地点的时间。
- 两者都必须带时区。事后补录时两者必然不同，因此不使用发布时间覆盖事件时间。

### 地点语义

- `place.id` 由博客拥有，是稳定身份；Mapbox 或其他供应商的标签改名不能改变它。
- `name` 是卡片上的公开显示名。
- `longitude` 与 `latitude` 是对外公开的坐标，不是必然保留设备原始 GPS。
- `precision` 可为 `exact`、`poi`、`locality`、`region` 或 `approximate`，表示公开坐标精度。
- `country_code` 使用 ISO 3166-1 alpha-2；中国省、市代码由客户端确认并由构建期边界目录校验或回填。海外没有可靠行政区代码时只保留国家覆盖，不猜测省/州、市代码。
- `provider` 和 `provider_id` 只用于追溯地理编码候选项，不参与记录身份。

## Markdown 格式

### 独立走过

```yaml
---
title: ""
date: 2026-08-19T19:10:00+08:00
type: "zouguo"
draft: false
zouguo:
  occurred_at: 2026-08-19T18:20:00+08:00
  place:
    id: cn-zj-hz-example-lake
    name: 示例城 · 湖边
    longitude: 120.01
    latitude: 30.01
    precision: poi
    country: 中国
    country_code: CN
---

雨停了，湖面慢慢亮起来。

![湖边](https://example.com/lakeside.webp)
```

`title` 可以留空；归一化时使用 `place.name` 作为卡片标题。

### 带“走过”的唠叨

```yaml
---
date: 2026-08-19T19:10:00+08:00
laodaotags: ["走过"]
zouguo:
  occurred_at: 2026-08-19T18:20:00+08:00
  place:
    id: cn-zj-hz-example-lake
    name: 示例城 · 湖边
    longitude: 120.01
    latitude: 30.01
    precision: poi
    country_code: CN
---
```

现有 `location` 和 `latlng` 字段可为普通唠叨继续保留，但不能替代带“走过”Tag 内容的结构化 `zouguo` 块。

### 带“走过”的随笔

```yaml
---
title: "一篇合成的旅行随笔"
date: 2026-08-20T20:00:00+08:00
tags: ["走过"]
zouguo:
  occurred_at: 2026-08-16T14:30:00+08:00
  place:
    id: cn-zj-hz-example-hill
    name: 示例城 · 山脚
    longitude: 120.03
    latitude: 30.03
    precision: approximate
    country_code: CN
---
```

## 图片规则

- Markdown 正文是图片顺序的唯一事实来源，不再并行维护一个 Front Matter 图片数组。
- 独立走过和唠叨按正文首次出现顺序提取。
- 随笔先放已有封面图；若正文已包含同一 URL，不重复。
- 生成 JSON 将每张图归一化为 `url`/`original`、`alt` 及可选 `width`/`height`；Production 可额外生成 `thumb`、`small`、`large` 和对应宽度，灯箱仍回到原图。
- 纯文字记录的 `images` 是空数组，不使用占位图。

## 身份、去重与删除

- 生成记录身份是 `source.type + source.id`，对外 `id` 固定为 `<source.type>:<source.id>`。
- 只做精确来源身份去重；禁止根据文字、时间相近或坐标相近模糊合并。
- 编辑同一文件不改变 `source.id`。
- 删除或移除 Tag 不发送额外删除事件；下次全量构建自然移除生成项。

## 生成 JSON 边界

顶层结构固定为：

```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-08-20T12:00:00+08:00",
  "items": []
}
```

单项必须包含：

- 稳定 `id` 和 `source`。
- `title`、`summary`、`occurredAt` 与 `publishedAt`。
- 已归一化的 `place`。
- 始终存在的 `images` 数组。
- `capabilities`：明确该来源能否编辑、删除、移出聚合或打开原文。

完整字段、枚举、坐标范围、来源规则和随笔约束以 `schemas/data/zouguo-feed-v1.schema.json` 为准。

## 错误处理

以下情况不得静默跳过，应在构建或发布前给出包含源文件的明确错误：

- 带“走过”Tag 但没有 `zouguo` 块。
- 缺事件时间、缺地点 ID、缺坐标或坐标越界。
- 国家代码、坐标精度或来源类型不在契约中。
- 生成身份重复或 `id` 与来源身份不一致。
- 随笔来源尝试将长正文复制到 `summary`。

## 当前实现

Hugo 聚合、原型数据退出、App/Publisher 写入、地点解析、构建期边界裁剪和统一草稿均已接入当前实现。本文只定义数据与来源边界；页面体验、边界生成、App 交互和 Worker 部署以 [`zouguo.md`](zouguo.md) 及各项目源码为准，不能据此手工修改生成 JSON。
