---
title: "Github 自动构建 Hugo, 并通过 Webhook 同步到宝塔指定目录"
date: 2023-02-20
slug: hugo_action_webhooks
tags: ['博客','折腾','Hugo']
description: '折腾博客的乐趣就是不停的折腾，一个评论插件就搞来搞去的，为此还特意买了轻量服务器，索性也把 Hugo 搬过去。只是原先同步到腾讯 COS 就不可用，而且域名还指定了境外访问路径，导致更新博客的流程变得非常复杂。最终通过 Google，总算解决：本地提交 hugo 源码到 Github，自动触发构建并同步到宝塔指定的网站目录。'
image: https://img.koobai.com/article/webhooks2.svg
---
(2024.01.19晚更新) 折腾博客的乐趣就是不停的折腾，一个评论插件就搞来搞去的，为此还特意买了轻量服务器，索性也把 Hugo 搬过去。只是原先自动同步到腾讯 COS 就不可用，而且域名还指定了境外访问路径，导致更新博客的流程变得非常复杂。最终通过 Google，总算解决：本地提交 hugo 源码到 Github，自动触发构建并同步到宝塔指定的网站目录。

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

~~**2.** 打开宝塔面板，终端生成 git 公钥~~

```yml
# 安装 Git
yum -y install git

# Git全局配置和单个仓库的用户名邮箱配置
git config --global user.name  "username"
git config --global user.email  "your@email.com"

# 生成git公钥用于自动拉取（一路回车）
ssh-keygen -t rsa -C "你的@email.com"

# 查看git公钥
cat ~/.ssh/id_rsa.pub
```

~~**3.** 添加公钥到到 Github：头像--Settings--SSH and GPG keys--New SSH key~~

**4.** 打开宝塔面板商店，安装 WebHook 插件--添加执行脚本 (复制以下代码)。~~其中"gitHttp 为需同步的 github 仓库地址"，"gh-pages"为仓库分支名称。~~

```
cd 网站目录
git config pull.rebase true
git pull
echo Onion Site Updated! $(TZ=UTC-8 date +"%Y-%m-%d"" ""%T")
echo ======================================================
```

**以下代码已过时，暂不使用。**

```script
#!/bin/bash
echo ""
#输出当前时间
date --date='0 days ago' "+%Y-%m-%d %H:%M:%S"
echo "Start"
#git分支名称
branch="gh-pages"
#git项目路径
gitPath="/www/wwwroot/$1"
#git 仓库地址
gitHttp="git@github.com:koobai/koobai.github.io.git"
echo "Web站点路径：$gitPath"
#判断项目路径是否存在
if [ -d "$gitPath" ]; then
        cd $gitPath
        #判断是否存在git目录
        if [ ! -d ".git" ]; then
                echo "在该目录下克隆 git"
                sudo git clone $gitHttp gittemp
                sudo mv gittemp/.git .
                sudo rm -rf gittemp
        fi
        echo "拉取最新的项目文件"
        #sudo git reset --hard origin/$branch
        git remote add origin $gitHttp
        git branch --set-upstream-to=origin/$branch $branch
        sudo git reset --hard origin/$branch
        sudo git pull $gitHttp  2>&1
        echo "设置目录权限"
        sudo chown -R www:www $gitPath
        echo "End"
        exit
else
        echo "该项目路径不存在"
                echo "新建项目目录"
        mkdir $gitPath
        cd $gitPath
        #判断是否存在git目录
        if [ ! -d ".git" ]; then
                echo "在该目录下克隆 git"
                sudo git clone $gitHttp gittemp
                sudo mv gittemp/.git .
                sudo rm -rf gittemp
        fi
        echo "拉取最新的项目文件"
        #sudo git reset --hard origin/$branch
        sudo git pull gitHttp 2>&1
        echo "设置目录权限"
        sudo chown -R www:www $gitPath
        echo "End"
        exit
fi
```

**5.** 查看 WebHook 插件密钥，复制密钥地址。添加到 Github 需同步的仓库--Settings--Webhooks--Add webhook。其中 Content type 选择 application/json。

```
格式如：https://面板地址:面板端口/hook?access_key=密钥&param=需同步到的目录名称
```

**6.** 初始化宝塔网站目录

```
在宝塔终端执行：

cd 网站目录
git clone --depth 1 https://mirror.ghproxy.com/https://github.com/koobai/koobai.github.io --single-branch .
或
git clone --depth 1 --branch main https://mirror.ghproxy.com/https://github.com/koobai/koobai.github.io .

解释上面意思：--depth 1 只克隆最新的一次提交。mirror.ghproxy.com为github加速地址，koobai为github用户名，koobai.github.io为仓库名。最后 . 为当前目录。
--single-branch 克隆一个分支。或 --branch main 克隆 main 分支。

```

**以下代码已过时，暂不使用。**

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

至此，步骤全部完成。当本地提交新文件到 Github hugo 源码 main 分支，就会自动触发（hugo 生成静态文件——同步到另一个仓库——同步到宝塔网站指定目录）。如果域名指定境外访问路径是 vercel 或 cloudflare 服务，当 hugo 源码更新的时候也会自动触发构建更新。

**题外**: 由于使用了轻量服务器，原先备案过的域名也需要重新接入备案。整个流程下来发现，现在备案审核速度是相当的快，必须点个赞。周一提交服务商，周二服务商提交管理局，周三审核通过。周三上午提交公安网安，下午审核通过。
