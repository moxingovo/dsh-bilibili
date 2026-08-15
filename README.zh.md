# dsh-plugin-bilibili

[English](README.md) | 中文

为 DeepSeek Harness 打造的 B 站检索插件。安装后 Agent 获得三个工具：

- bilibili_search —— 按关键词找视频：标题、UP 主、播放量、时长、发布日期。
- bilibili_video —— 单个视频的完整元数据：各项计数、分区、分 P 列表、简介。
- bilibili_subtitles —— 单个视频的字幕文稿，合并为纯文本。

默认匿名可用：搜索自带匿名 cookie 引导，元数据始终可用。配置 SESSDATA 后解锁登录可见字幕轨——多数 AI 字幕都在这一层。插件只读元数据与字幕文本，绝不下载视频或音频流。

## 安装

执行：

    dsh plugin --profile web add dsh-plugin-bilibili

    # 或直接从 Git 安装：
    dsh plugin --profile web add git+https://github.com/moxingovo/dsh-bilibili

重启 dsh web，新会话自动获得 bilibili_search、bilibili_video 与 bilibili_subtitles。

## 可选 SESSDATA

登录 bilibili.com，打开 DevTools，进入 应用，再进 Cookie，点开 bilibili.com 条目，复制 SESSDATA 的值——裸 token，不是整条 Cookie 头。写入环境变量或 DSH_HOME 下的 .env 文件：

    BILIBILI_SESSDATA=<你的裸 token>

不配置时只返回公开可见的字幕轨；需要登录的字幕以结构化错误码 BILIBILI_LOGIN_REQUIRED 失败。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| cookieEnv | BILIBILI_SESSDATA | 存放可选 SESSDATA token 的环境变量名。 |
| requestTimeoutMs | 30000 | 单请求超时，毫秒。 |
| subtitleLanguage | zh-CN | 首选字幕语言标签；精确匹配优先，否则取第一条轨。 |
| searchMaxPageSize | 20 | bilibili_search 页大小上限。 |
| subtitleMaxChars | 80000 | bilibili_subtitles 文稿字符上限，值层截断并带 truncated 标记。 |

可在 profiles/web/cordis.patch.yml 中覆盖任意字段——按行后层覆盖前层。

## 错误码

工具以结构化错误失败并携带下列代码：BILIBILI_RISK_CONTROL 对应 -412，稍后重试即可，插件已自动引导匿名 cookie；BILIBILI_FORBIDDEN 对应 -403；BILIBILI_NOT_FOUND 对应 -404；BILIBILI_LOGIN_REQUIRED 对应 -101，通常是字幕；BILIBILI_SUBTITLES_UNAVAILABLE 表示无可访问字幕轨或字幕体为空；BILIBILI_REDIRECT_REFUSED 是凭据安全保护；BILIBILI_BAD_RESPONSE 表示非 JSON 或信封缺 code 字段；BILIBILI_REQUEST_FAILED 表示网络失败；BILIBILI_WBI_KEYS_UNAVAILABLE 表示签名密钥缺失。

## 安全

- cookie 只从环境变量读取，绝不进入配置文件、日志或工具输出。
- 每次请求拒绝重定向，cookie 不可能被转发到其他源。
- cookie 只发送给 api.bilibili.com；字幕 CDN 下载不携带 cookie。
- 不下载视频与音频。

## Skills

随仓库附带两份技能：skills/ 下的 plugin-tool-bilibili 负责工具用法，plugin-web-bilibili 负责服务配置与错误码。把它们复制进你的 harness 技能目录，Agent 便会在调用工具前先查阅。

## 开发

需要 Node 22 或更新：

```sh
npm ci
npm test
```

仓库用 package-lock.json 钉死依赖树。测试套件完全离线运行（HTTP 全部 mock）；类型检查针对已发布的 DeepSeek Harness 包执行。

## 已知问题

DeepSeek Harness 官方包的早期 rc 版本声明了未发布的 peer 依赖：dsh-agent 0.0.1-rc.1/rc.2 与 dsh-session 0.0.1-rc.1/rc.2 引用了 @deepseek-ai/dsh-type-meta，该包不在 npm 注册表上。全新安装时若解析器落到这些版本，会以 @deepseek-ai/dsh-type-meta 的 404 失败（已在 pnpm 11 与 npmmirror 镜像复现；npm 解析到 0.0.1-rc.5 所以成功）。对策：用 npm 配合仓库内的 package-lock.json（npm ci），或在已装好 harness 的工作区内执行 dsh plugin add——其 lockfile 已锁定可用版本。这是上游 rc 阶段的发布问题，上游修复元数据后自动消失。

## 许可证

MIT，见 LICENSE。
