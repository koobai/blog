# “走过”地图日志

“走过”是惊蛰 Full 参考站中的位置日志：用一句话、图片和真实经过时间记住一个地方，再由 Hugo 把记录聚合成 `/zouguo/` 的地图与列表。

## 已实现能力

- 独立走过、带“走过”Tag 的唠叨、带“走过”Tag 的随笔聚合为同一份读模型。
- 地图按缩放级别展示国家、省/州、城市覆盖和具体地点。
- 有图记录使用圆形缩略图，纯文字记录使用普通圆点；同地点记录可聚合展开。
- 地点卡片和列表共用同一套日期、来源、图片灯箱和随笔跳转规则。
- 浅色/深色地图、桌面端地图联动和移动端独立列表已分别适配。
- 生产环境可选使用 Cloudflare Image Transformations，地图标记优先下载 128px 缩略图，列表使用 640/960px 响应式图片，灯箱仍打开原图。

当前页面以地点为主，不提供年份筛选。日期在当年只显示 `MM-DD`，过往年份显示 `YYYY-MM-DD`。

## 事实来源与三种来源

Markdown 是唯一正式事实来源；`/zouguo/index.json` 和页面内嵌 feed 都由 Hugo 构建生成，不手工维护。

| 来源 | 进入条件 | 页面行为 | 管理行为 |
|---|---|---|---|
| 独立走过 | `content/zouguo/*.md` 且 `type: zouguo` | 显示短文字和正文图片 | 编辑或删除该 Markdown |
| 唠叨 | `laodaotags` 包含“走过” | 显示唠叨文字和图片，标记“来自唠叨” | 回到原唠叨编辑，或只移除聚合关系 |
| 随笔 | `tags` 包含“走过” | 只聚合标题、链接和图片，标记“来自随笔” | 回到原随笔，或只移除聚合关系 |

完整 Front Matter、时间语义、身份与图片规则见 [走过数据契约](zouguo-data-contract.md)。

## 构建与图片管线

1. Hugo 扫描 `content/zouguo/*.md`、带“走过”Tag 的唠叨和随笔。
2. `_partials/zouguo/feed.html` 在构建期把三种来源归一化。
3. `/zouguo/index.html` 与 `/zouguo/index.json` 使用同一份 v2 结果；生成 JSON 不接受手工编辑。
4. 删除独立 Markdown，或从唠叨、随笔移除“走过”Tag 后，对应记录会在下次全量构建中自然消失。

图片顺序以 Markdown 正文首次出现顺序为准，纯文字记录生成空 `images` 数组。Production 开启图片转换后，地图标记使用 128px 缩略图，列表使用 640/960px 响应式图片，灯箱仍打开原图；Development 默认直接使用原图，不消耗转换额度。

## 手工新增一条记录

从 Archetype 生成文件：

```bash
hugo new content zouguo/20260821-example.md
```

然后完成 `zouguo.occurred_at` 和 `zouguo.place`，并在正文中按期望顺序写入文字与图片。坐标顺序在 GeoJSON/前端中始终是 `[longitude, latitude]`；Front Matter 则分别保存 `longitude` 和 `latitude`。

不要为新记录手工编辑页面 JSON 或边界子集。Hugo 会根据 Markdown 地点代码从完整边界目录中裁剪当前页面所需的国家、省和城市边界。

## 在开源站点中启用

“走过”已完整实现在 Full 参考仓库中，但当前 `tools/jingzhe.py init` 只生成 Core，不会自动安装走过页面、地图配置或边界目录。因此，不能把“增加一个虚构功能开关”当作完成安装。

从 Core 站点接入时，AI 或维护者应：

1. 只复用 MIT 程序模块：走过布局、局部模板、CSS、JavaScript、Archetype、Schema、地点契约代码和边界目录构建器。
2. 创建自己的 `/zouguo/` 索引页与 Markdown，不复制 `content/zouguo/`、Koobai 的真实坐标、文字或图片。
3. 配置自己的 Mapbox Public Token 和浅色/深色地图样式，并限制 Token 可使用的站点 URL。
4. 保留边界数据的许可说明，或用自己选择的兼容边界数据重建目录。
5. 使用合成地点先验证构建，再导入自己选择公开的真实位置。

当前 Full 页面复用 `params.services.exercise.mapboxToken`，并在走过布局中使用独立浅色/深色样式。在通用站点中应替换为自己的公开 Token 和样式，不直接沿用 Koobai Production 的样式 ID。

## 可选发布与草稿

只用本地 Markdown 时不需要 Worker。如果要从自己的 App 发布或管理，可部署：

- [Publisher Worker](../workers/publisher/README.md)：独立走过的读取、发布、修改和删除；唠叨同步/移出走过；R2 图片上传。
- [Drafts Worker](../workers/drafts/README.md)：使用 `kind: zouguo` 保存位置、时间、文字和图片顺序。

这两个 Worker 都是可选的高权限管理边界，不是游客打开页面的运行时依赖。必须使用自己的测试仓库、R2、D1 和 Secret 验证后再切换生产。

发布和管理必须遵守以下边界：

- 新建走过使用 `requestId`/`Idempotency-Key` 与稳定 Markdown 路径实现幂等；内容相同不重复提交，更新已有内容时必须携带当前 SHA。
- 独立走过可以删除自己的 Markdown；`laodao`、`post` 只能编辑原来源或移除“走过”Tag 与地点块，不能删除原唠叨或文章。
- Worker 必须校验管理员身份、允许的来源和仓库路径、坐标以及幂等键；客户端不能提交任意仓库、分支或文件路径。
- Drafts 使用 `kind: laodao|zouguo` 和 `payload_json`，同时兼容旧唠叨字段。D1 只负责暂存，发布后的 Markdown 才是正式事实来源。
- Cloudflare Worker、D1 迁移、R2 与生产域名切换都是明确授权后执行的外部动作，不能从源码存在推断已经部署。

博客仓库不包含 Koobai 的 iOS App 源码。本仓库只维护 Markdown/Hugo 契约和 Worker API；其他客户端必须自行实现同一契约，不应假设复制本仓库就会同时获得 App。

## 地点、边界与隐私

- `zouguo.place.id` 是博客自有的稳定地点身份；显示名称可以修改，只有完全相同的 `place.id` 才会归并，不能按文字、时间或坐标相近模糊合并。
- 国家使用 ISO 3166-1 alpha-2。中国地点尽量保存省、市行政区代码；App 可用 MapKit 提供候选，Hugo 构建期目录负责校验和缺失代码回查。中国地名会先规范化，城市匹配受省级父代码约束；直辖市在城市缩放层复用省级轮廓。
- 海外当前保证国家级覆盖；没有可靠省/州、市代码时继续显示地点标记，不猜测行政区代码。
- 完整边界目录位于 `data/jingzhe/zouguo_boundary_catalog.json`，由 `tools/build_zouguo_boundary_catalog.py` 从 Natural Earth 与 China-GeoData 构建。它只参与 Hugo 构建，页面只下载当前记录实际引用的边界子集。
- 新增中国省份或海外国家不需要手工编辑边界 JSON；地图按缩放级别选择国家、省或城市覆盖，不依赖年份筛选。
- 更新边界目录时必须保留 `static/data/zouguo-boundaries.LICENSE.md` 中的来源和许可说明。

- `privacy: public` 表示坐标可按声明精度公开；`privacy: reduced` 要求客户端先降低精度并丢弃原始 GPS。
- 住宅、公司、学校、酒店等敏感地点不应默认使用精确坐标。
- 响应式图片转换开关、尺寸与回退规则见 [配置文档](configuration.md#响应式图片转换)。

## 验证

```bash
node --check themes/jingzhe_v3/assets/js/pages/zouguo.js
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
  tests.test_zouguo_contract \
  tests.test_zouguo_pipeline \
  tests.test_zouguo_places
hugo --environment production --minify --panicOnWarning
```

完整门禁仍使用：

```bash
python3 tools/jingzhe.py check
```

## 相关文档

- [数据契约](zouguo-data-contract.md)
- [配置与响应式图片](configuration.md)
- [隐私与外部数据边界](privacy.md)
- [Publisher Worker](../workers/publisher/README.md)
- [Drafts Worker](../workers/drafts/README.md)
