---
title: "Github自动构建Hugo, 并同步到腾讯COS, 同时刷新CDN缓存"
date: 2023-01-15
description: '博客逐步搭建完善，更新了日常使用的App、硬件页面。博客样式标题采用了"得意黑"开源字体。把二级域名改成一级，过程中发现Cloudflare Pages如果要绑定一级，须把域名的DNS服务器解析过去。解析之后，自己的nas访问变得不稳定，时不时的打不开，来来回回折腾了好几次，无解，只好改回去。 vercel可以绑定一级，尝试之后，访问速度太慢，放弃。开始了解国内的云服务，学习到了对象储存、CDN，经过一番对比尝试，最终选择腾讯云的COS对象存储配合内容分发网络CDN搭建。 '
image: images/article/cdn.svg
---
博客逐步搭建完善，更新了日常使用的[App](https://koobai.com/apps/)、[硬件](https://koobai.com/hardware/)页面。博客样式标题采用了"<a href="https://github.com/atelier-anchor/smiley-sans" target="_blank">得意黑</a>"开源字体。把二级域名改成一级，过程中发现Cloudflare Pages如果要绑定一级，须把域名的DNS服务器解析过去。解析之后，自己的nas访问变得不稳定，时不时的打不开，来来回回折腾了好几次，无解，只好改回去。 vercel可以绑定一级，尝试之后，访问速度太慢，放弃。开始了解国内的云服务，学习到了对象储存、CDN，经过一番对比尝试，最终选择腾讯云的COS对象存储配合内容分发网络CDN搭建(主要它的cosbrowser界面是经过设计的ᵔ◡ᵔ；客服也很负责，咨询问题会电话打过来详细教你如何操作)。

在了解部署过程中发现Cyrus's Blog写的"<a href="https://blog.xm.mk/posts/fc83" target="_blank">自动构建Hugo博客部署至腾讯云对象存储COS并刷新CDN</a>"教程，一番折腾，完美。感谢作者。<br />备份记录下过程: (详细的注释可查看Cyrus's Blog)

**准备工作：**

1.到腾讯云访问管理——访问密钥——API密钥管理中，新建一个账户：访问方式改为"编程访问"，用户权限添加"QcloudCOSDataFullControl、 QcloudCDNFullAccess"。完成之后将生成的SecretId、SecretKey复制保存。<br />
2.到Github新建一个仓库(私有公共都行)，把自己hugo生成的站点源文件(不是public下文件)同步过去。<br />
3.在刚创建的仓库——Settings——Secrets and variables——Actions，新建SecretId、SecretKey、Bucket、 Region四个密钥。其中SecretId、SecretKey为上面复制保存的，Bucket(存储桶名称)、 Region(所属地域 )在COS中存储桶列表中获取。

**部署:**

1.在Github仓库根目录，新建".github/workflows"文件夹，并新建xxx.yml文件，复制以下代码到文件里。作用：借助Github Action实现自动部署。

```
name: Build and deploy

# 自动触发构建

on:
  push:
    branches:
      - main

# 构建hugo及生产静态页面

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

# 上传到腾讯COS存储桶

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: 3.9

      - name: Setup coscmd and sdk
        run: sudo pip install coscmd

      - name: Configure coscmd
        env:
          SECRET_ID: ${{ secrets.SecretId }}
          SECRET_KEY: ${{ secrets.SecretKey }}
          BUCKET: ${{ secrets.Bucket }}
          REGION: ${{ secrets.Region }}
        run: coscmd config -a $SECRET_ID -s $SECRET_KEY -b $BUCKET -r $REGION

      - name: Upload to COS
        run: coscmd upload -rfs --delete public/ /

# 刷新腾讯CDN缓存目录

      - name: Flush CDN
        env:
          SECRET_ID: ${{ secrets.SecretId }}
          SECRET_KEY: ${{ secrets.SecretKey }}
        run: |
          pip install --upgrade tencentcloud-sdk-python
          python flush-dns.py -i $SECRET_ID -k $SECRET_KEY

```


2.在Github仓库根目录，新建flush-dns.py文件，复制以下代码到文件里，并将里面的"koobai.com"域名修改成自己的CDN加速域名。作用：通过Python脚本实现刷新CDN缓存，详细参数可参考<a href="https://console.cloud.tencent.com/api/explorer?Product=cdn&Version=2018-06-06&Action=PurgePathCache" target="_blank">腾讯的调用aip文档</a>。

```
import json
import argparse
from tencentcloud.common import credential
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile
from tencentcloud.common.exception.tencent_cloud_sdk_exception import (
    TencentCloudSDKException,
)
from tencentcloud.cdn.v20180606 import cdn_client, models

# 传入参数
parser = argparse.ArgumentParser(description='-i <secretId> -k <secretKey>')
parser.add_argument('-i', '--secretid', type=str, required=True, help='secretId')
parser.add_argument('-k', '--secretkey', type=str, required=True, help='secretKey')
args = parser.parse_args()

try:
    cred = credential.Credential(args.secretid,args.secretkey)
    httpProfile = HttpProfile()
    httpProfile.endpoint = "cdn.tencentcloudapi.com"

    clientProfile = ClientProfile()
    clientProfile.httpProfile = httpProfile
    client = cdn_client.CdnClient(cred, "", clientProfile)

    req = models.PurgePathCacheRequest()
    params = {"Paths": ["https://koobai.com/", "https://www.koobai.com/"], "FlushType": "flush"}
    req.from_json_string(json.dumps(params))

    resp = client.PurgePathCache(req)
    print(resp.to_json_string())

except TencentCloudSDKException as err:
    print(err)
```

自此部署完毕，当有新文件上传到 main 分支，就会自动触发（hugo生成静态文件——上传到COS——刷新CDN缓存）。

**查看是否部署成功：**

1.Github仓库Actions下，查看构建记录<br />
2.COS存储桶下的文件变动<br />
3.CDN刷新预热下，操作记录——目录刷新

**费用：**

COS、CDN费用(包含存储+CDN回源流量+CDN流量+HTTPS请求等)，个人站没什么流量，应该很低，跑一段时间看看。另外腾讯云也提供了六个月一部分免费试用~~

**扩展：**

因为博客源文件在Github里，可以利用vercel平台读取仓库也自动构建一个。如果使用的是阿里云域名DNS服务器，可以在解析请求来源选择"境外"，"记录值"填写vercel平台绑定域名时所提供的。

这样国内网络访问的时候走腾讯CDN，国外访问的时候走vercel平台所提供的节点。