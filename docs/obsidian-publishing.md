# Obsidian 发布内容格式

发布 Vault 使用三个内容目录。`准备发布`会从 CouchDB 只读导出这些目录，转换后执行 lint 与完整静态生成；`确认发布`才会提交并推送 GitHub。

## 博客文章

文件放在 `Blog/`，例如 `Blog/我的文章.md`：

```md
---
channel: blog
publish: true
draft: false
title: 我的文章
description: 文章摘要
date: 2026-08-28T20:00:00+08:00
slug: my-post
categories:
  - 技术
tags:
  - Nuxt
type: tech
image: https://img.aspirinna.cloud/posts/example.jpg
---

这里是 Markdown 正文。
```

`type` 只能是 `tech` 或 `story`。`slug` 只能使用小写字母、数字和连字符，并决定最终文章文件名。

## 即刻动态

文件放在 `Moments/`，一条动态对应一个 Markdown：

```md
---
channel: moment
publish: true
draft: false
createdAt: 2026-08-28T20:30:00+08:00
images:
  - https://img.aspirinna.cloud/posts/example.jpg
location: 山东威海
tags:
  - 日常
  - 摄影
---

这里是动态正文。正文会按照纯文本显示并保留换行。
```

`createdAt` 必须包含时间和时区，并且不能与另一条动态重复。`images`、`location`、`tags` 都可以省略。

## 项目条目

文件放在 `Projects/`，例如 `Projects/aspirinna-clarity.md`：

```md
---
channel: project
publish: true
draft: false
id: aspirinna-clarity
name: Aspirinna Clarity
description: 基于 Nuxt 构建的个人博客与发布系统。
link: https://github.com/Aspirinna/aspirinna-clarity
type: website
relation: created
icon: tabler:notebook
---
```

`relation` 支持：

- `created`：创建的项目
- `participation`：参与的项目
- `design`：设计的作品
- `using`：正在使用

`icon` 可以使用 Iconify 名称，也可以填写图片 URL。

## 发布开关

只有同时满足下面三个条件的文件才会进入网站：

```yaml
channel: blog | moment | project
publish: true
draft: false
```

改成 `publish: false` 或 `draft: true` 后，下次完整发布会从对应页面移除该内容。三个目录都至少保留一个 Markdown；需要清空某个频道时，可以保留一份 `publish: false` 的占位草稿。
