---
name: plugin-web-bilibili
description: Use when configuring or diagnosing the ctx.bilibili host service behind the bilibili tools — provider selection, the BILIBILI_SESSDATA credential, WBI/risk-control behavior, and the full BilibiliError code table.
---

# B 站宿主服务与故障排查（plugin-web-bilibili）

插件版本：0.1.0-rc.5。关联插件：plugin-tool-bilibili（模型侧工具用法，正常使用时先看它）。

## 功能概述

本插件是宿主侧服务 ctx.bilibili 与官方提供方 bilibili-official：负责搜索风控引导（匿名 buvid3）、WBI 签名、字幕轨下载、错误码映射与超时。它不是模型工具，不能直接调用；模型通过 plugin-tool-bilibili 的三个工具间接使用它。

## 适用场景

该用：排查工具报错的原因、理解错误码含义、配置凭据或端点。
不该用：把它当成可调用工具；用它做通用网页搜索。
易误用：把 BILIBILI_SESSDATA 当成 cookie 全串；混淆 -101 与 -404 的处理。

## 关键行为

- 搜索路径每个实例首次会从 bilibili 首页引导匿名 buvid3 cookie，以降低 -412 风控概率。
- 字幕走 WBI 签名接口；多数视频的 AI 字幕需要登录凭据。
- 凭据解析顺序：字面量 cookie 配置，然后凭据 seam，然后启动环境变量 BILIBILI_SESSDATA（裸 token 会被自动补 SESSDATA= 前缀）。
- 所有请求拒绝重定向；cookie 只发给 API 主机，绝不发给字幕 CDN。

## 配置键（部署层）

provider（默认取环境变量 DSH_BILIBILI_PROVIDER）、baseUrl（默认 api.bilibili.com）、cookie（字面量，secret）、cookieEnv（默认 BILIBILI_SESSDATA）、userAgent、requestTimeoutMs（默认 30000）、subtitleLanguage（默认 zh-CN）。

## 错误码表

- BILIBILI_RISK_CONTROL：-412，风控拒绝；稍后重试。
- BILIBILI_FORBIDDEN：-403，被拒绝。
- BILIBILI_NOT_FOUND：-404，视频不存在或已删除。
- BILIBILI_LOGIN_REQUIRED：-101，该数据需要登录 cookie（常见于字幕）。
- BILIBILI_SUBTITLES_UNAVAILABLE：无可用字幕轨或字幕体为空。
- BILIBILI_REDIRECT_REFUSED：出现重定向，凭据安全保护生效。
- BILIBILI_BAD_RESPONSE：非 JSON 或信封缺 code 字段。
- BILIBILI_REQUEST_FAILED：网络失败，含超时。
- BILIBILI_WBI_KEYS_UNAVAILABLE：拿不到签名密钥。
- BILIBILI_PROVIDER_*：提供方选择错误，属部署配置问题。

## 异常与回退

工具报错时：先按错误码分类，再决定重试或换路径（详见 plugin-tool-bilibili）。若怀疑凭据问题，检查部署端 DSH_HOME 下 .env 文件的 BILIBILI_SESSDATA 是否存在且未过期；本插件不负责获取或续期凭据。
