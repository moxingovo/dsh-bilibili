---
name: plugin-tool-bilibili
description: Use before calling bilibili_search, bilibili_video, or bilibili_subtitles — find Bilibili videos, read their metadata, and extract subtitle transcripts; covers argument formats, error codes, and fallbacks.
---

# B 站工具套件使用指南（plugin-tool-bilibili）

插件版本：0.1.0-rc.5。关联插件：plugin-web-bilibili（宿主服务与错误码背景）、plugin-tool-github（GitHub 侧对应工具）。

## 功能概述

本插件提供三个工具：bilibili_search 按关键词搜 B 站视频；bilibili_video 读单个视频的完整元数据；bilibili_subtitles 下载并合并视频的字幕文稿。不能做：下载视频或音频、读弹幕、发评论、登录态操作。

## 适用场景

该用：用户要找 B 站视频、查某视频的 UP 主/播放量/简介/分 P、或需要「某视频讲了什么」的字幕全文。
不该用：通用网页搜索请用 web_search；下载视频；评论互动。
易误用：把 URL 当 keyword 传入；bvid 格式写错；对无字幕视频反复尝试 subtitles。

## 调用时机

用户提到 B 站时：先 bilibili_search 找到候选视频；锁定一个后按需 bilibili_video 读详情、bilibili_subtitles 提取文稿。目标明确（用户直接给了 BV 号）则跳过 search。

## 参数详解

bilibili_search：
- keyword：必填，字符串，任意长度，首尾空白会被去除。
- page：可选，正整数，默认 1，第几页结果。
- pageSize：可选，正整数，1 到 20，默认 10。超过 20 会报错。
- order：可选，只能是 totalrank（综合，默认）、click（播放多）、pubdate（最新发布）、dm（弹幕多）。
返回：total 总条数、hasMore 是否有下一页、items 数组，每项含 bvid、title、author、play、duration、publishAt、url、description。

bilibili_video：
- bvid：必填，格式为 BV 加 10 位字母或数字，例如 BV1GJ411x7h7。格式不对直接报错。
返回：title、author、authorMid、play/danmaku/comment/favorite/coin/share/like、duration（秒）、publishAt、description、typeName、pages（分 P 列表，每项含 cid、page、part、duration）、url。

bilibili_subtitles：
- bvid：必填，格式同上。
- language：可选，语言标签，如 zh-CN、ai-zh、en。精确匹配优先；不匹配则取第一条轨。
返回：language（实际选中的语言）、trackCount（总轨数）、cueCount（字幕条数）、transcript（合并后的全文，按行拼接）、truncated（是否因超过 80000 字符被截断）。

## 最小调用示例

找视频：bilibili_search，keyword 传 何同学。
读详情：bilibili_video，bvid 传 BV1uCptzTEt8。
提取文稿：bilibili_subtitles，bvid 传 BV1uCptzTEt8，language 传 ai-zh。
拿到结果后引用视频链接时用返回里的 url 字段。

## 常见错误与规避

- bvid 报错：确认是 BV 开头的 12 位字符串，从搜索结果里直接复制 bvid 字段。
- pageSize 超过 20：降低 pageSize 或翻页。
- BILIBILI_RISK_CONTROL（风控）：搜索接口偶发，稍等几秒重试一次即可；本插件已自动携带匿名 buvid3，通常不再出现。
- BILIBILI_LOGIN_REQUIRED 或 BILIBILI_SUBTITLES_UNAVAILABLE：该视频字幕需要登录或根本没有字幕轨。不要重试，直接走回退方案。
- 返回的 title 已去除高亮标签，直接使用即可。

## 异常与回退

- 任何网络类错误（BILIBILI_REQUEST_FAILED）：重试一次，仍失败则告知用户稍后再试。
- 字幕拿不到：改用 bilibili_video 读标题与简介，引用视频 url 给用户，并说明「该视频没有可提取的字幕」；不要编造内容。
- 搜索无结果：换更短的关键词，或改用 web_search 搜索站点信息。
- 所有错误都带机器可读 code，按上面表格分类处理，不要把错误文本原样复述给用户。
