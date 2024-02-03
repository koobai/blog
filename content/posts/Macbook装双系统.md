---
title: '旧 Macbook 装双系统 Windows 11'
date: 2023-04-27 22:21:25 +0800
slug: windows11
tags: ['折腾','系统']
description: '这些年来一直使用 Mac 电脑，从 iMac 到 2014 款 15 寸 Macbook Pro 再到 2019 款 16 寸 Macbook Pro。不记得从什么时候开始不再使用 Windows 电脑，只记得那会使用 xp、win 7 系统。不过现实中总有那么些事情需要用到 Windows，如：企业网银、某些硬件更新。之前装个 Win 7 虚拟机临时使用下，但从微软发布 Win 11 以后，看到更现代的界面，一直想尝试看看。'
image: https://img.koobai.com/article/win11.webp
---
这些年来一直使用 Mac 电脑，从 iMac 到 2014 款 15 寸 Macbook Pro 再到 2019 款 16 寸 Macbook Pro。不记得从什么时候开始不再使用 Windows 电脑，只记得那会使用 xp、win 7 系统。不过现实中总有那么些事情需要用到 Windows，如：企业网银、某些硬件更新。之前装个 Win 7 虚拟机临时使用下，但从微软发布 Win 11 以后，看到更现代的界面，一直想尝试看看。

本打算继续采用虚拟机方式装 Win 11，但没成功。于是想着 14 款的 Mac 放着也是放着，直接装个双系统。实践的时候发现把事情想简单的了，由于硬件比较老旧，安装过程中遇到不少麻烦，想着再搜不到方法就放弃了，好在最终都解决。以问答形式记录下关键问题，留作备忘。

### 1. 使用什么工具安装？
Mac 自带的“启动转换助理”软件。M系列处理器暂不支持；16 款之前还是哪年之前的 Mac 需要另外准备外置硬盘作为 Win 安装的启动盘，我的 14 款需要。

### 2. 安装时提示“该电脑无法运行 Win 11”怎么办？
在这个界面下，按 Shift+F10 键 ，弹出命令窗口输入“regedit”打开注册表，依次定位到：
```
HKEY_LOCAL_MACHINE\SYSTEM\Setup
创建一个名为 "LabConfig" 的项，在此项下创建两个 DWORD 值：
键名“BypassTPMCheck”，赋值“00000001”
键名“BypassSecureBootCheck”，赋值“00000001”
保存退出
```

### 3. 安装 22H2 之后版本，遇到需要连接到网络才能点击下一步怎么办？
当时因为这个差点就放弃了。在这个界面下，按 Shift+F10 键 ，弹出命令窗口输入“oobe\bypassnro”回车，系统自动重启。再到这个界面的时候，点击“下一步”左边的文字按钮“我没有网络”。

### 4. 安装完，发现没有驱动怎么办？
找到安装盘的 bootcamp 文件夹，整个拷贝到安装好的 Win 系统下，点击文件夹中的 setup.exe 安装 bootcamp 软件，安装完在线更新下 bootcamp 软件。

### 5. 怎么激活系统？原生纯净的系统从哪获取？
自动激活：[Official Site](https://github.com/TGSAN/CMWTAT_Digital_Edition)。系统包iso：[ITELLYOU](https://next.itellyou.cn) 或 [TechBench](https://tb.rg-adguard.net/public.php?lang=zh-CN) 

装之前准备一个有线鼠标，不然过程中很不方便。装完体验下来，界面跟之前的对比漂亮非常多，至于其他的，由于是老硬件，还要啥自行车。自己平常不玩游戏，所以这些年用 Mac 习惯了，而且其他对应的设备也都是 Apple，生态的互通互动方便很多。