# 走过独立内容管线

第 2 步已将页面数据源从手写 JSON 切换为 Markdown。

## 写入与生成

1. 独立记录写入 `content/zouguo/*.md`。
2. `_partials/zouguo/feed.html` 在 Hugo 构建期读取 Front Matter 与正文图片。
3. `/zouguo/index.html` 与 `/zouguo/index.json` 共享同一个归一化结果。
4. 浏览器只消费页面内嵌的 v1 feed，不读取手写原型 JSON。

`data/jingzhe/zouguo_prototype.json` 已退出并删除。当前 15 条合成记录仅作为开发验收 Markdown，正式迁移时由第 10 步清理。

## 图片与顺序

图片按 Markdown 正文首次出现顺序提取。纯文字记录生成空 `images` 数组；不创建占位图，也不在 Front Matter 并行维护图片数组。

## 本地验收

```bash
python3 -m unittest tests.test_zouguo_pipeline
python3 tools/jingzhe.py check
```

管线测试会在临时内容目录中依次新增、修改、删除一条 Markdown，并验证生成 feed 同步变化；不会修改仓库中的正式内容或 JSON。
