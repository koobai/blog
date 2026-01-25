---
title: Hugo 通过 Github 自动推送到宝塔 (2026 年版备忘)
date: 2026-01-25 16:43:00 +0800
slug: hugo_action_github
tags:
  - 博客
  - 折腾
  - Hugo
description: 太久没折腾博客了，服务器失效了也没打算续费，昨天兴致来了，把费续上。既然网站正常了，就想着顺手折腾下。但太久没整了，完全忘光，之前的一篇日志还是手动传到 Github，然后手动把静态文件传到宝塔。为了方便，还是得把链路打通：本地通过 VC 上传，Github 自动构建 Hugo 静态文件，然后自动推送到宝塔。
image: https://img.koobai.com/article/githubrsync.webp
---
太久没折腾博客了，服务器失效了也没打算续费，昨天兴致来了，把费续上。既然网站正常了，就想着顺手折腾下。但太久没整了，完全忘光，之前的一篇日志还是手动传到 Github，然后手动把静态文件传到宝塔。为了方便，还是得把链路打通：本地通过 VC 上传，Github 自动构建 Hugo 静态文件，然后自动推送到宝塔。得益于 ai 的进步，本地到 Github 很快搞定，但原先的 WebHook 不知道为什么不启作用，来回跟 ai 聊也无效，记得以前 WebHook 也老是失效。干脆让 ai 换个思路不用 WebHook 了，于是有了这篇备忘～
### 宝塔面板端

打开宝塔终端，创建推送用户
```yml
useradd -m -s /bin/bash deploy

# 建立一个名为 `deploy` 的受限账户，专门负责搬运文件，即便密钥泄露也拿不到系统 `root` 权限。
# 为了更安全可禁止 root SSH 远程登录，修改 `/etc/ssh/sshd_config` -> `PermitRootLogin no`，重新启动 systemctl restart sshd
```

生成并授权 SSH 密钥
```yml
# 生成密钥
ssh-keygen -t rsa -b 4096 -f ~/.ssh/github_actions

# 配置权限：
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/  # 复制已有的公钥授权
chown -R deploy:deploy /home/deploy/.ssh      # 修正所有权
chmod 700 /home/deploy/.ssh                   # 设置目录权限
chmod 600 /home/deploy/.ssh/authorized_keys   # 设置文件权限
```

赋予静态文件存储目录权限及安装 rsync
```yml
chown -R deploy:deploy /www/wwwroot/blog
chmod -R 755 /www/wwwroot/blog
# 作用：让 `deploy` 用户有权读写该网站目录，否则 `rsync` 会报错。

yum install -y rsync --disablerepo=docker-ce-stable # 安装依赖：确保系统有同步工具

```

获取私钥内容
```yml
cat ~/.ssh/github_actions

# 完整复制从 `-----BEGIN RSA PRIVATE KEY-----` 到结尾的所有字符。
```

### GitHub 仓库端

打开 Hugo 源码仓库 -> Settings -> Secrets and variables -> Actions，点击 New repository secret 添加以下三项：
```yml
SERVER_IP # 服务器公网IP
SERVER_SSH_KEY #粘贴刚才的私钥内容
REMOTE_PATH #静态文件在服务器的根目录（如 `/www/wwwroot/blog`）
```

### 完整的部署脚本

GitHub Actions 脚本，新建.github/workflows/Githubblog.yml

```yml
name: Githubblog

on:
  workflow_dispatch:  # 支持手动运行
  push:
    branches:
      - main  # 监听 main 分支推送

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          submodules: true
          fetch-depth: 0

      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: 'latest'
          extended: true

      - name: Build
        run: hugo --minify  # hugo 编译静态文件 HTML

      # 1. 发布到本仓库的 gh-pages 分支
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
          publish_branch: gh-pages

      # 2. 通过 rsync 同步到宝塔
      - name: Deploy to BT Panel via rsync
        uses: burnett01/rsync-deployments@v8
        with:
          switches: -avz --delete
          path: public/
          remote_path: ${{ secrets.REMOTE_PATH }}
          remote_host: ${{ secrets.SERVER_IP }}
          remote_user: deploy  
          remote_key: ${{ secrets.SERVER_SSH_KEY }}
```

完美搞定，似乎折腾的乐趣又勾起来了，把 [Apps](/apps) 页面内容也重新梳理更新了下，上次更新还是 2023 年，几年过去了，软件使用是有一些变化～