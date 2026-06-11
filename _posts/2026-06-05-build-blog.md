---
layout: post
title: "[其它]如何使用github搭建一个静态博客(一)"
date: 2026-06-05
---
# 如何使用github轻松搭建个人博客

## 前言

我从开始学会做网页其就想搞个自己的网站了，不过以前一直把一些事情想得太复杂，老是纠结于很多功能。现在看了很多别人的博客，其实很多大佬还是从简制作的，没有什么复杂的后端，只用静态页面去实现博客的功能，就像互联网早期的web页面一样，为了适应2g的加载速度，许多代码从简，也不会使用复杂的css，这种风格启发了我做自己的博客。

## Github Pages

Github是支持个人部署静态页面的，这个功能叫做github pages，可以把一个repository当成一个网站去部署，其自带的静态网页生成器Jekyll，也能很好的把我们平时写的笔记.md转换成静态网页，Github Pages也有官方的使用documentation：https://docs.github.com/en/pages

## 网站搭建步骤

1.第一步，需要创建一个新的仓库，仓库名字为xxx.github.io，这个xxx最好和你的github名字一样，我猜你可能想自己命名网站的域名为bbb.github.io，但是实际上如果这样命名，那么访问时的链接其实会是https://xxx.github.io/bbb.github.io/index.html，很长的一串，而不是你想的https://bbb.github.io/index.html，所以还是正常命名为你的github名字。

![ref1](/assets/images/2026-06-05-build-blog/ref1.png)

2.接下来，在仓库的设置中，按如下设置，这样，仓库的根目录，就成了网站的根目录，这时候在仓库的根目录里放一个index.html，然后再访问https://xxx.github.io/，那么此时网站的内容就是index.html了，如果404可以多刷新几次，网站的部署相对仓库这边有延迟。

![ref2](/assets/images/2026-06-05-build-blog/ref2.png)

## Jekyll搭建步骤

1.在网站的根目录下，按如下目录进行文件夹与文件的创建，其中最重要的文件是\_config.yml，这个文件包含了网站的基本设定，可以选择Jekyll支持的主题、插件等（在github pages上部署的时候，github pages只支持几个指定的主题，可以访问官方文档看看支持什么）；其次是_posts文件夹，用来放你写的文章，Jerkyll会自动把md格式渲染成静态网页；\_layouts文件夹里是一些公共部分，比如可以放网站的导航栏，底部栏等多个网页共通的内容；assets用来放网页的css、js和图片资源，这个不是必须要这么命名的，可以自由来。

``` bash
b14ckb0x@b14ckb0x:~/ntc627.github.io$ tree -L 2
.
├── assets
│   ├── css
│   └── images
├── _config.yml
├── index.html
├── _layouts
│   ├── default.html
│   └── post.html
├── _posts
│   └──2021-06-27-hello-world.md
└── README.md

```

如果你的目录按我如上进行设置，那么现在github仓库看到的文件与文件夹应该类似这样

![ref3](/assets/images/2026-06-05-build-blog/ref3.png)

2.我的_config.yml设置，theme我选择自己编写css，所以空着了，此外还有插件以及一些插件设置，用于控制博客的分页等。

```yml
title: b14ckb0x's space
description: Hack everything
theme: 
paginate: 5
paginate_path: "/page:num/"
plugins:
  - jekyll-feed
  - jekyll-paginate
  - jekyll-sitemap
```

3.在_layouts文件夹里创建的公共文件，可以在其他文件的头部进行引用，比如我这里的index.html里就指定了layout为default，而\_layout中的default.html放的是我的导航栏，那么我就不需要重新把我的导航栏代码再完整复制过来。

``` html
---
layout: default
title: index
---
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>b14ckb0x's space</title>
</head>
```

4.接下来就是文章了，\_posts目录下的文章必须按严格的格式命名，YYYY-MM-DD-title.md，比如2021-06-27-hello-world.md，jekyll只能接受这样的文件命名，符合这个格式才会当成文章渲染。此外，文章的开头必须有前置数据（Front matter），前置数据包裹在两个\-\-\-中间，比如这样：

```markdown
---
layout: post
title: "Hello World"
date: 2021-03-03
---

# Hello world
Test my blog
```

到这里，一个基本的博客就算搭建完了。

## 其它准备

如果之前没有使用过git，那么可以在这里配置一下，这样就可以本地写代码，然后再push到github上。首先，需要把网站的仓库clone下来：

```bash
git clone https://github.com/xxx/xxx.github.io.git
```

之后进入到clone下来的文件夹，就可以自由编辑了，编辑以后需要重新提交到github，步骤如下

```bash
#先添加要提交的文件
git add .
#提交改动
git commit -m "add index.html"
#将本地的改动上传至github
git push
```

push的时候可能会问你用户名和密码，并且每次push都需要填写，这样不仅不方便，也不安全，比较好的方式是配置ssh。

先在本地创建好SSH密钥对，比如：

```bash
ssh-keygen -t ed25519 
```

创建好后，打开公钥文件.pub，把里面的内容复制到github的ssh key设置页面：

![ref4](/assets/images/2026-06-05-build-blog/ref4.png)

之后在本地，git clone下来的那个文件的根目录里执行，把与远程仓库的互动方式从https改成ssh

```bash
~/xxx.github.io$ git remote set-url origin git@github.com:xxx/xxx.github.io.git
```

这样之后就可以直接push了