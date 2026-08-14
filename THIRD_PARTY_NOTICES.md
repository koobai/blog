# Third-party Notices

本文件记录随仓库分发的第三方浏览器脚本。它不改变各上游组件的许可证；项目自有代码的 MIT License 与个人内容、数据、图片和品牌边界见 `LICENSE`、`CONTENT_LICENSE.md` 和 `BRAND.md`。

| 本地文件 | 上游与版本 | 许可证 | 本地 SHA-256 |
|---|---|---|---|
| `static/js/Sortable.min.js` | [SortableJS 1.15.7](https://github.com/SortableJS/Sortable) | MIT，`licenses/SortableJS-MIT.txt` | `bf4241bc73fef7f11c59a283a69fe8051cdd31c6d8ff5a2b9ba219e7831fcf76` |
| `static/js/marked.min.js` | [marked 15.0.12](https://github.com/markedjs/marked) | MIT；完整上游文件同时保留 Markdown BSD-3-Clause 条款，见 `licenses/marked-LICENSE.txt` | `3e7e7d7feb3e5d58cb6c804f68ab5c24cc7e5eb6270fd6e5cbb9124739217d0c` |
| `static/js/view-image.min.js` | [ViewImage 2.0.2](https://github.com/Tokinx/ViewImage) | MIT，`licenses/ViewImage-MIT.txt` | `17aad6c9f94b8245cae3fad1abf64dd9cb1027dcf003b23879df6a185a2891f9` |
| `static/js/html-to-image.min.js` | [html-to-image 1.11.13](https://github.com/bubkoo/html-to-image/tree/v1.11.13) | MIT，`licenses/html-to-image-MIT.txt` | `a90b42909d80964269ef6d5f3d1e4a5a7e2a4c263a5d2a76a9e7151901343262` |

`html-to-image` 已用精确版本 1.11.13 的官方发布文件重新 vendoring。原来归属信息不完整且经过本地修改的 `coco-message` 已从仓库删除，由 MIT 授权的项目自有 `static/js/jingzhe-message.js` 以兼容 API 替代，因此不再属于第三方组件。

外部 CDN、API 和远程图片没有复制进 Starter 包，不列为 vendored 代码。Core Starter 只携带 ViewImage，并包含对应的独立 Third-party Notices 与许可证副本。
