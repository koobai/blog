---
title: '博客折腾随记及 CSS Grid 属性'
date: 2023-06-12 15:43:33 +0800
slug: grid
tags: ['博客','折腾','感悟']
description: '最近一直在不断的折腾博客，就跟唠叨里说的一样：对博客的折腾真是越折腾越来劲，一旦停下来，瞬间心里觉得空落落的。几乎把各个页面都重新梳理优化了下，特别是首页，各模块的信息流都给聚合起来了。因为更新博文的频率实在是不高，也许降低博文信息展示权重，让其首页更丰富起来，可读性更高点。'
image: https://img.koobai.com/article/grid.webp
---
最近一直在不断的折腾博客，就跟唠叨里说的一样：对博客的折腾真是越折腾越来劲，一旦停下来，瞬间心里觉得空落落的。几乎把各个页面都重新梳理优化了下，特别是首页，各模块的信息流都给聚合起来了。因为更新博文的频率实在是不高，也许降低博文信息展示权重，让其首页更丰富起来，可读性更高点。

折腾过程中，ChatGPT 给出了 CSS display: grid; 属性，想起之前 [风记星辰](https://www.thyuu.com/word/tips/75680) 也分享过，真是不了解不知道，一试用，发现用于并列容器的布局实在是太好用了，一直困扰我的自适应、等高等宽问题迎刃而解。索性把现有的页面全部基于 Grid 属性更改掉。其中 grid-gap 也很牛逼，不像以前用 margin-right 导致最右边的容器也会空出一定的距离。
```css
display: grid;
grid-gap: 10px; /* 中间空10px间距 */
/* grid-template-columns 各个使用方法 */
grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));/* 根据浏览器窗口自适应布局，最小容器宽度340 */
grid-template-columns: auto 1fr; /* 第一列宽度根据元素宽度自适应，第二列使用剩余容器空间 */
grid-template-columns: 1fr 1fr; /* 两列等宽 */
grid-template-columns: repeat(4, 1fr); /* 多列等宽，4为平均分为四列 */
```

现在折腾博客是完全离不开 ChatGPT 了，数据分离、交互动画、随机调用、布局样式，都通过它来实现，只要你多问几次或者完善对话语句，基本上都能给到你想要的答案。真是做到每个页面的最终呈现，都有它的贡献。自己一个完全看不懂 JS 的人，页面居然也用了不少 JS 效果。

当然有时候问着问着也烦，不想再问，始终给不到自己想要的效果。这个时候要么作罢，要么隔段时间新建窗口重新问，也许想要的答案就来了。目前使用的是免费 3.5 版本，如果 4.0 版本，估计更简单易用，特别是能访问互联网之后，期待未来～

有时候在想，这样折腾博客的意义是什么，日志没写多少，每天净搞些有的没的，内容才是重要的才对，再说折腾来折腾去，也没几个人看，图啥？嗯。。。。，开心最重要。意义就在于不停的折腾，就跟开头说的一样：一旦停下来，瞬间心里觉得空落落的。

感谢折腾过程中，[林木木](https://immmmm.com/) 、[风记星辰](https://www.thyuu.com/word/tips/75680) 老师帮忙。同时折腾过程中，又认识了一些新朋友 [小饿](https://dongjunke.cn/)、[linlinxing](https://linlinxing.com/)、[小熊](https://www.saphead.cn/)、[wananaiko](https://wananaiko.com/)、[老麦](https://laomai.org/)、[大大的小蜗牛](https://eallion.com/)、[忆往事](https://zhou.ge/)、[归臧](https://nuoea.com/)、[叶子笔记](https://yzrss.com/)、[少岱山](https://www.shaodaishan.com/) 等等，博客真好。