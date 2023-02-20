---
title: "Github Action 自动构建 Hugo, 并通过 Webhook 同步到宝塔指定目录"
date: 2023-02-20
tags: ['博客','折腾','Hugo']
description: '折腾博客的乐趣就是不停的折腾，一个评论插件就搞来搞去的，为此还特意买了轻量服务器，索性也把 Hugo 搬过去。只是原先自动同步到腾讯 COS 就不可用，而且域名还指定了境外访问路径，导致更新博客的流程变得非常复杂。最终通过 Google，总算解决：本地提交 hugo 源码到 Github，自动触发构建并同步到宝塔指定的网站目录。'
image: images/article/webhooks.svg
---

折腾博客的乐趣就是不停的折腾，一个评论插件就搞来搞去的，为此还特意买了轻量服务器，索性也把 Hugo 搬过去。只是原先自动同步到腾讯 COS 就不可用，而且域名还指定了境外访问路径，导致更新博客的流程变得非常复杂。最终通过 Google，总算解决：本地提交 hugo 源码到 Github，自动触发构建并同步到宝塔指定的网站目录。

部署步骤流程记录下：

**1.** 在 Github 的 Hugo 源码仓库根目录，新建".github/workflows/xxx.yml 文件，复制以下代码。作用：借助 Github Action 实现自动构建，并同步到另外一个仓库。其中 "PERSONAL_TOKEN" 为另外仓库的访问密钥；"external_repository" 为另外仓库地址。

```yml
name: Githubblog

on:
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          submodules: true
          fetch-depth: 0

      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v2
        with:
          hugo-version: 'latest'
          extended: true

      - name: Build
        run: hugo --minify

      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          personal_token: ${{ secrets.PERSONAL_TOKEN }}
          external_repository: koobai/koobai.github.io
          publish_dir: ./public
```

**2.** 打开宝塔面板，终端生成 git 公钥

```yml
# Git全局配置和单个仓库的用户名邮箱配置
git config --global user.name  "username"
git config --global user.email  "your@email.com"

# 生成git公钥用于自动拉取
ssh-keygen -t rsa -C "你的@email.com"

# 查看git公钥
cat ~/.ssh/id_rsa.pub
```
**3.** 添加公钥到到Github：头像--Settings--SSH and GPG keys--New SSH key

**4.** 打开宝塔面板商店，安装WebHook插件--添加执行脚本 (复制以下代码)。其中"gitHttp为需同步的github仓库地址"，"gh-pages"为仓库分支名称。

```yml
#!/bin/bash
echo ""
#输出当前时间
date --date='0 days ago' "+%Y-%m-%d %H:%M:%S"
echo "Start"
#判断宝塔WebHook参数是否存在
if [ ! -n "$1" ];
then 
          echo "param参数错误"
          echo "End"
          exit
fi
#git项目路径（$1是param后面的参数，指向你的服务器的目录）
gitPath="/www/wwwroot/$1"
#git 网址 (替换成你的git地址，ssh方式)
gitHttp="git@github.com:koobai/koobai.github.io.git"
 
echo "Web站点路径：$gitPath"
 
#判断项目路径是否存在
if [ -d "$gitPath" ]; then
        cd $gitPath
        #判断是否存在git目录
        if [ ! -d ".git" ]; then
                echo "在该目录下克隆 git"
                git clone $gitHttp gittemp
                mv gittemp/.git .
                rm -rf gittemp
        fi
        #拉取最新的项目文件（此处为git拉取命令可根据需求自定义）
        #git reset --hard origin/gh-pages
        #git pull origin gh-pages
        git fetch --all && git reset --hard origin/gh-pages && git pull
        #设置目录权限
        chown -R www:www $gitPath
        echo "End"
        exit
else
        echo "该项目路径不存在"
        echo "End"
        exit
fi
```
**5.** 查看WebHook插件密钥，复制密钥地址。添加到Github需同步的仓库--Settings--Webhooks--Add webhook。其中Content type选择application/json。

```
格式如：https://面板地址:面板端口/hook?access_key=密钥&param=需同步到的目录名称
```
**6.** 初始化宝塔网站目录
```sh
cd 网站目录

# 初始化git 执行
git init

# 连接远程仓库
git remote add origin git@github.com:yourName/repositoryname.git

# 拉取想要的分支代码(gh-pages分支名称)
git pull origin gh-pages

# 等待完成
```

至此，步骤全部完成。当本地提交新文件到Github hugo源码 main 分支，就会自动触发（hugo生成静态文件——同步到另一个仓库——同步到宝塔网站指定目录）。如果域名指定境外访问路径是vercel或cloudflare服务，当hugo源码更新的时候也会自动触发构建更新。

详细步骤参考资料：<a href="https://juejin.cn/post/6974203582602018829" target="_blank">GitHub+webHook实现项目代码自动更新 </a>

**题外**: 由于使用了轻量服务器，原先备案过的域名也需要重新接入备案。整个流程下来发现，现在备案审核速度是相当的快，必须点个赞。周一提交服务商，周二服务商提交管理局，周三审核通过。周三上午提交公安网安，下午审核通过。

测试下拉取