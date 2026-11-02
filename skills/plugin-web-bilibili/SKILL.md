---
name: plugin-web-bilibili
description: Use when configuring or diagnosing the Bilibili provider inside dsh-plugin-bilibili — the plugin's own config keys, the BILIBILI_SESSDATA credential, WBI/risk-control behavior, cid fallback, and the BilibiliError code table.
---

# B 站提供方与故障排查（plugin-web-bilibili）

插件版本：0.3.0（独立插件 dsh-plugin-bilibili，已在 DeepSeek Harness 0.2.0-rc.2 上验证类型与测试面）。关联技能：plugin-tool-bilibili（模型侧工具用法，正常使用时先看它）。

## 功能概述

宿主侧是 **BilibiliOfficialProvider**（提供方 id：`bilibili-official`），它**随插件一起加载，不发布独立的 `ctx.bilibili` 服务**，因此不能从别的插件按服务名取用。它负责：搜索风控引导（匿名 buvid3）、搜索风控自动降级、视频详情（含 cid 兜底）、WBI 签名、字幕轨下载、mp4 直链、预览帧/封面抓取、HTTP 状态到错误码的映射与超时。模型只通过 plugin-tool-bilibili 的五个工具间接用到它。

插件本身声明的依赖只有 `tools` 与 `systemPrompt` 两个服务（0.2.3 起不再有注册期的注入）。`bilibili_frames` 在**执行时**读取 `attachments` 服务：因此它在所有挂载了本插件的作用域里都注册、都可见，缺少附件存储时那一次调用返回结构化错误 `bilibili_frames: no attachment service is mounted in this scope`，而不是工具不存在。

## 适用场景

该用：排查工具报错的原因、理解错误码含义、配置凭据或端点。
不该用：把它当成可调用工具；用它做通用网页搜索。
易误用：把 BILIBILI_SESSDATA 当成 cookie 全串（只填 SESSDATA 的值即可，裸 token 会被自动补 `SESSDATA=` 前缀）；混淆 -101 与 -404 的处理。

## 关键行为

- 搜索路径每个实例首次会访问 `https://www.bilibili.com/` 引导匿名 buvid3 cookie，以降低 -412 风控概率。
- **搜索风控自动降级**：调用方未显式指定 order 时，若默认综合排序被 -412 定向风控拦截，插件自动改用 pubdate 排序重试一次；显式指定 order（或降级后仍被风控）则直接抛 BILIBILI_RISK_CONTROL，不做静默改序。
- **cid 兜底**：视频详情优先取 `pages[0].cid`，缺失或为 0（如风控把响应裁剪）时自动回退 `data.cid`，保证 playurl/subtitles/frames 不会拿 cid=0 去请求。
- 字幕走 WBI 签名接口，签名密钥缓存 12 小时（`BILIBILI_WBI_KEY_TTL_MS`）；多数视频的 AI 字幕需要登录凭据。
- mp4 直链用 `/x/player/playurl`（fnval=0、platform=html5 的 durl 单段流）；拿不到 durl 报 BILIBILI_PLAYURL_UNAVAILABLE。
- 画面帧走 WBI 签名的 `/x/player/wbi/v2` 的 preview_pic（预览雪碧图），缺失时工具层退回封面；extract 模式另需宿主装有 ffmpeg。
- 所有请求拒绝重定向；cookie 只发给 API 主机（默认 `https://api.bilibili.com`），绝不发给字幕 CDN 或图片 CDN。
- `bilibili_frames` 在工具层校验当前路由是否声明支持图片输入，并把帧作为图片内容块注入本次调用（消息来源 kind 为插件自有的 `bilibili-frames`）。

## 凭据与配置键

凭据解析顺序**只有两步**：插件配置里的字面量 `cookie`，然后是启动环境变量 `process.env[cookieEnv]`。这条插件**不接 harness 的 credentials seam**（那是内置 `ctx.bilibili` 服务的做法，已随内置包移除）。实践中把 `BILIBILI_SESSDATA=...` 写进 `~/.dsh/.env`：launcher/watchdog 会把 .env 的每个 KEY=VALUE 注入服务器进程环境，插件由此读到。

插件配置键（宿主 profile 的 cordis patch 里给，或由 bundle 自带的 `cordis.patch.yml` 提供默认）：

- `baseUrl`：API 主机，默认 `https://api.bilibili.com`。
- `cookie`：字面量 SESSDATA（secret，不建议直接写进配置文件）。
- `cookieEnv`：凭据所在的环境变量名，默认 `BILIBILI_SESSDATA`。
- `userAgent`：默认是一个 Chrome 126 的桌面 UA。
- `requestTimeoutMs`：单请求超时，默认 30000。
- `subtitleLanguage`：首选字幕语言标签，默认 `zh-CN`。
- `searchMaxPageSize`：`bilibili_search` 每页上限，默认 20。
- `subtitleMaxChars`：字幕转录字符上限，默认 80000。
- `timeoutMs`：工具协作超时预算，默认 30000。

没有 `provider` 选择键：本插件只带 bilibili-official 这一个提供方。

## 错误码表

- BILIBILI_RISK_CONTROL：-412 风控拒绝；未显式指定 order 时插件已自动降级重试一次，仍失败请稍后重试。
- BILIBILI_FORBIDDEN：-403 被拒绝。
- BILIBILI_NOT_FOUND：-404 视频不存在或已删除。
- BILIBILI_LOGIN_REQUIRED：-101 该数据需要登录 cookie（常见于字幕、高清晰度直链）。
- BILIBILI_SUBTITLES_UNAVAILABLE：无可用字幕轨或字幕体为空。
- BILIBILI_PLAYURL_UNAVAILABLE：无可用 mp4 直链（可能需要登录或更高清晰度权限）。
- BILIBILI_REDIRECT_REFUSED：出现重定向，凭据安全保护生效。
- BILIBILI_BAD_RESPONSE：非 JSON 或信封缺 code 字段。
- BILIBILI_API_ERROR：信封 code 非 0 且不属于上面这些具体映射。
- BILIBILI_REQUEST_FAILED：网络失败，含超时。
- BILIBILI_WBI_KEYS_UNAVAILABLE：拿不到签名密钥。

## 异常与回退

工具报错时：先按错误码分类，再决定重试或换路径（详见 plugin-tool-bilibili）。若怀疑凭据问题，检查 `~/.dsh/.env` 里 `BILIBILI_SESSDATA` 是否存在且未过期；本插件不负责获取或续期凭据。`bilibili_frames` 另要求当前作用域挂载 `attachments` 服务、且当前模型声明支持图片输入，两者不满足时报普通 Error（不复用 BilibiliError 码表）：没有附件存储时报 `no attachment service is mounted in this scope`（工具依然可见，属执行期失败），模型不支持图片时报 `does not declare image input`。

## 环境相关

- 若该机器存在 TLS 中间层（公司代理、杀软 HTTPS 扫描），服务器需以 `NODE_OPTIONS=--use-system-ca` 运行，否则请求可能报 BILIBILI_REQUEST_FAILED——这是环境问题，不是插件缺陷。
- 本机代理为 fake-IP/TUN 模式时，B 站与 GitHub 的直连由系统路由接管；若出现 DNS 类失败，先确认代理是否在运行。
