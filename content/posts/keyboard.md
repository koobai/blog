---
title: 入手机械键盘路程 & VIA改键注释备忘
date: 2023-01-06
tags: ['键盘','VIA']
description: "2021年03月在京东购买了京造K2（Keychron K2），这是第一把机械键盘。同年12月购买了sspai × Keychron 联名的K3，买它就单纯觉得白色好看。到此，客制化三个字也没听过，时间到了22年06月，sspai × Keychron 联名出了Q1，觉得配色也蛮好看，看介绍，才知道客制化概念，觉得蛮有意思的，于是买了这把Q1回来。 "
image: https://img.koobai.com/article/zoom.jpg
---
### 入手机械键盘到客制化机械键盘路程

2021年03月在京东购买了京造K2（Keychron K2），这是第一把机械键盘。同年12月购买了sspai × Keychron 联名的K3，买它就单纯觉得白色好看。到此，客制化三个字也没听过，时间到了22年06月，sspai × Keychron 联名出了Q1，觉得配色也蛮好看，看介绍，才知道客制化概念，蛮有意思，于是买了这把Q1回来。

入手之后，从完全不懂，到开始改轴下垫、贴美纹纸、换卫星轴、数据线定制、VIA自定义，还蛮有乐趣～ 

7月份，见微博上有人说某个品牌一个小时卖了6000把键盘，这时才知道 Link 65。之后看到 ZOOM 65 R2开团，几个特性促成了上车： 蓝牙、65键 、带旋钮（用惯了Q1旋钮，非常方便）。

谈不上入坑，对雨滴、麻将、HiFi等，也没感觉。更多是因为颜值～～

### VIA软件中的宏、any使用注释备忘：

完整的按键对照表参考文档：[https://docs.qmk.fm/#/keycodes](https://docs.qmk.fm/#/keycodes) <br />
LGUI = 左cmd键，LALT = 左option键，LCTL = 左control键，LSFT = 左shift键 <br />
(缩写写法对应按键：G = CMD，A = Option，C = Control，S = Shift)

Mac 系统下 VIA 软件中的 Win = Command，Alt = Option 

### 1. 宏使用(自定义按键)

左侧MACROS选项菜单为宏，宏对应0-15个按键，<br />
写法如：{KC_LGUI,KC_C}，意思为CMD+C  <br />
写法如2：{KC_LGUI,KC_LSFT,KC_4}，意思为cmd+shift+4

### 2. any键使用(更自主的自定义按键)

文档：[https://docs.qmk.fm/#/feature_advanced_keycodes](https://docs.qmk.fm/#/feature_advanced_keycodes) <br />
写法如：G(KC_C) 意思为CMD+C <br />
写法如2：SGUI(kc_4) 意思为cmd+shift+4 

### 3. any特殊用法：键盘切换层 ( LAYER 0 1 2 3 )
使用方法文档：[https://docs.qmk.fm/#/feature_layers?id=switching-and-toggling-layers](https://docs.qmk.fm/#/feature_layers?id=switching-and-toggling-layers)

### a. 单击切换层

写法如：TO(0) 或 直接在软件中选择TO(0)按键。意思为单击进入键盘第零层

### b. 按住（长按）切换层

写法如：MO(1) 或 直接在软件中选择MO(1)按键。意思为按住(长按)进入键盘第一层，松开回到原始层

### c. 按住(长按)为切换层，单击正常按键

写法如：LT(1,KC_C) 意思为按住(长按)进入键盘第一层，单击为字母c

### d. 按住(长按)为修饰键（可多个组合），单击正常按键

修饰键为：command、optio等等 <br />
使用方法文档：[https://docs.qmk.fm/#/mod_tap](https://docs.qmk.fm/#/mod_tap) <br />
写法如：MT(MOD_LGUI,KC_C) 意思为按住为CMD键，单击为字母C  <br />
写法如2：MT(MOD_LGUI|MOD_LSFT,KC_C) 意思为按住为cmd+shift键，单击为字母C  

### 4. RGB灯效

文档参考：[https://docs.qmk.fm/#/feature_rgblight](https://docs.qmk.fm/#/feature_rgblight)