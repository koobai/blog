# 走过地点与边界管线

## 稳定地点身份

- `zouguo.place.id` 是博客自有的稳定 `placeId`，由 App 在用户确认地点时生成或复用。
- 展示名称可以修改；名称变化不产生新地点。
- 只有完全相同的 `placeId` 才会归并。相近名称、时间或坐标永远不参与模糊去重。
- 国家使用 ISO 3166-1 alpha-2；中国省、市使用六位行政区代码；海外省/州、市保留地点提供方的稳定代码。

## 坐标和隐私

Markdown 只保存可以公开的坐标，不保存设备原始 GPS 副本。`privacy: public` 表示可以按声明精度公开；`privacy: reduced` 表示 App 已先降低精度并丢弃原始坐标。`jingzhe.zouguo_places.public_coordinates` 是 App/迁移工具遵循的参考规则。

## 行政区域解析

App 的 MapKit 反向解析负责给新地点提供名称和候选行政区域；构建侧的完整边界目录用于校验、坐标回查与边界裁剪。`resolve_admin_codes` 可以从公开坐标回查目录中的国家、省、市代码。

## 构建期边界裁剪

`tools/build_zouguo_boundary_catalog.py` 从 Natural Earth 世界国家边界及 China-GeoData 中国国家、省、市边界生成完整目录。Hugo 的 `zouguo/boundaries.html` 只选择当前 Markdown 聚合数据引用的边界，再输出带指纹的页面资源。

因此新增省份或海外国家不需要编辑边界 JSON；完整目录约数 MB，但页面实际只下载已走过地区的子集。年份切换继续在浏览器内对这个小子集做显隐，不触发新的网络请求。
