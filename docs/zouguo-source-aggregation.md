# 走过多来源聚合

第 3 步让 `/zouguo/index.json` 同时聚合三类 Markdown：

- `content/zouguo/*.md`：独立走过，来源类型 `zouguo`。
- `content/laodao/**/*.md`：仅聚合 `laodaotags` 含“走过”的内容，来源类型 `laodao`。
- `content/posts/*.md`：仅聚合 `tags` 含“走过”的内容，来源类型 `post`。

三类来源共用 `zouguo` Front Matter 地点块。Tag 内容缺少事件时间或结构化地点时，Hugo 会用包含源文件路径的错误终止构建，不能静默忽略或使用错误坐标。

## 展示规则

- 独立走过和唠叨显示去除 Markdown 图片后的短文字，并按正文顺序提取图片。
- 随笔只同步标题、原文链接和图片，生成 feed 的 `summary` 固定为空。
- 随笔封面优先；若正文已出现同一 URL，只保留一次。
- 随笔标题在时间线中直接链接原文章，点击链接不会触发地图定位。

## 更新与删除

记录身份固定为 `source.type + source.id`。修改原 Markdown 会更新原项；删除原文件或移除“走过”Tag 后，下次全量构建自然移除，不另建复制记录或删除队列。

自动化测试覆盖加入、移除 Tag、图片去重、随笔正文隔离、缺地点阻断构建和重复构建不产生重复项。
