# dsh-plugin-bilibili

**简体中文** | [English](README.md) · [更新日志](CHANGELOG.md) · [下载](https://github.com/moxingovo/dsh-bilibili/releases)

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 打造的 **B 站检索插件**。
安装后 Agent 获得五个工具：

- `bilibili_search` —— 按关键词找视频：标题、UP 主、播放量、时长、发布日期。
- `bilibili_video` —— 单个视频的完整元数据：各项计数、分区、分 P 列表、简介。
- `bilibili_subtitles` —— 单个视频的字幕文稿，合并为纯文本。
- `bilibili_playurl` —— 单个视频的 mp4 直链（含实际清晰度与大小），用于下载或抽帧。
- `bilibili_frames` —— 视频真实画面（预览帧网格、封面回退或 ffmpeg 抽帧）以图片块返回，
  让支持图片输入的模型直接「看」画面，不再只依赖字幕。

默认匿名可用：搜索自带匿名 cookie 引导，元数据始终可用。配置 SESSDATA 后解锁登录可见字幕轨
（多数 AI 字幕都在这一层）、更高清晰度直链与预览帧路径。实际是只读的：插件只读元数据、字幕与
帧画面，绝不存储或再上传视频。

> 非官方社区插件，与 DeepSeek、哔哩哔哩官方均无关。
>
> **Harness 兼容性**：**0.2.3** 已在 **DeepSeek Harness 0.1.7-rc.2** 与 **0.1.6-alpha.2**
> （Typert API Gateway）上验证，同一份构建同时服务两条线；0.1.0–0.1.5 线同样可用 ——
> 本插件不使用 0.1.6+ 的 codec API。版本对照见[兼容性](#兼容性)。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-bilibili

# 或直接从 Git 安装：
dsh plugin --profile web add git+https://github.com/moxingovo/dsh-bilibili
```

重启 `dsh web`，新会话即获得 `bilibili_search`、`bilibili_video`、`bilibili_subtitles`、
`bilibili_playurl` 与 `bilibili_frames`。

只让某个 preset 看见这些工具时，改为在 preset 里挂载：

```yaml
- id: dsh-plugin-bilibili
  name: 'dsh-plugin-bilibili'
```

## 可选 SESSDATA

登录 bilibili.com，打开 DevTools → 应用 → Cookie → 点开 `bilibili.com` 条目，复制 **裸**
`SESSDATA` 值 —— 不是整条 Cookie 头。写入环境变量或 `$DSH_HOME/.env`（launcher 会把该文件里
每一条 `KEY=VALUE` 注入服务器进程环境）：

```sh
BILIBILI_SESSDATA=<你的裸 token>
```

不配置时只返回公开可见的字幕轨；需要登录的字幕以结构化错误码 `BILIBILI_LOGIN_REQUIRED` 失败。
裸 token 即可 —— 插件会自己补 `SESSDATA=` 前缀。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `baseUrl` | `https://api.bilibili.com` | API 主机。 |
| `cookie` | — | 字面量 SESSDATA（secret；优先用 `cookieEnv`）。 |
| `cookieFile` | — | 存放裸 SESSDATA token 或完整 Cookie 头的文件；每次请求重新读取，换 token 不用重启。优先于 `cookieEnv`；文件不可读时回落。 |
| `cookieEnv` | `BILIBILI_SESSDATA` | 存放可选 SESSDATA token 的环境变量名。 |
| `ffmpegPath` | — | `bilibili_frames` extract 模式用的 ffmpeg（绝对路径或 PATH 名）。缺省读 `BILI_FFMPEG`，再回落 PATH 上的 `ffmpeg`。 |
| `userAgent` | Chrome 126 桌面 UA | User-Agent 头。 |
| `requestTimeoutMs` | `30000` | 单请求超时，毫秒。 |
| `subtitleLanguage` | `zh-CN` | 首选字幕语言标签；精确匹配优先，否则取第一条轨。 |
| `searchMaxPageSize` | `20` | `bilibili_search` 页大小上限。 |
| `subtitleMaxChars` | `80000` | `bilibili_subtitles` 文稿字符上限，值层截断并带 `truncated` 标记。 |
| `timeoutMs` | `30000` | 工具协作超时预算。 |

可在 `profiles/web/cordis.patch.yml` 中覆盖任意字段 —— 按行后层覆盖前层：

```yaml
- id: bilibili
  name: 'dsh-plugin-bilibili'
  config:
    subtitleLanguage: ai-zh
```

本包是自包含的：它注册工具并自带 B 站 REST 提供方，**不发布** `ctx.bilibili` 服务，因此其它
插件无法按服务名取用（早期内置包那条线会发布，见[兼容性](#兼容性)）。

## 工具与错误码

工具以结构化错误失败并携带下列代码：

| 代码 | 含义 |
|---|---|
| `BILIBILI_RISK_CONTROL` | `-412` 风控。稍后重试即可；隐式搜索已自动用 `pubdate` 重试过一次。 |
| `BILIBILI_FORBIDDEN` | `-403` 被拒绝。 |
| `BILIBILI_NOT_FOUND` | `-404` 视频不存在或已删除。 |
| `BILIBILI_LOGIN_REQUIRED` | `-101` 需要登录 cookie（字幕、更高清晰度直链）。 |
| `BILIBILI_SUBTITLES_UNAVAILABLE` | 无可访问字幕轨，或字幕体为空。 |
| `BILIBILI_PLAYURL_UNAVAILABLE` | 该视频没有可用 mp4 直链。 |
| `BILIBILI_REDIRECT_REFUSED` | 出现重定向被拒 —— 凭据安全保护生效。 |
| `BILIBILI_BAD_RESPONSE` | 非 JSON 响应，或信封缺 `code` 字段。 |
| `BILIBILI_API_ERROR` | 信封 `code` 非 0 且不属于上面这些具体映射。 |
| `BILIBILI_REQUEST_FAILED` | 网络失败，含超时。 |
| `BILIBILI_WBI_KEYS_UNAVAILABLE` | 拿不到签名密钥。 |

`bilibili_frames` 与其余四个工具一样注册在插件自身的 fiber 上，因此**在所有挂载了本插件的
位置都可见**（宿主域的 profile bundles 挂载也算）。它在**执行时**才需要两样东西：当前作用域
挂载了 `attachments` 服务，且当前模型路由声明了图片输入。任一缺失都会让那一次调用返回结构化
错误（`no attachment service is mounted in this scope` / `does not declare image input`），
而不是让工具从注册表里消失 —— 取舍是"始终可见、失败即报"，见 CHANGELOG 的「修复」一节。

## 技能

`skills/` 下附带两份技能：

- `plugin-tool-bilibili` —— 工具用法：参数、返回结构、错误分流、回退方案。
- `plugin-web-bilibili` —— 宿主侧提供方：配置键、SESSDATA 凭据、WBI 与风控行为、完整错误码表。

**DeepSeek Harness 不会自动加载插件包内的技能。** 把它们复制到用户技能根目录，或在 preset 的
`skill-filesystem` 里指向已安装的包：

```sh
# 用户根目录 —— 每个挂载了 skill-filesystem 的 preset 都能看到
cp -r node_modules/dsh-plugin-bilibili/skills/* ~/.dsh/skills/
```

```yaml
# 或：把技能留在包里，在 agent preset 里引用
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    customSkillDirs:
      - '<DSH_HOME>/profiles/web/node_modules/dsh-plugin-bilibili/skills'
```

两种方式都能让 Agent 在调用工具前先查阅对应技能。

## 安全

- cookie 只从环境变量（或显式的字面量配置）读取，绝不进入日志或工具输出。
- 每次请求拒绝重定向，cookie 不可能被转发到其他源。
- cookie 只发送给配置的 API 主机（默认 `api.bilibili.com`）；字幕 CDN 下载不携带 cookie。
- 不下载视频与音频（`bilibili_frames` 的 `extract` 模式会把 mp4 下到临时目录供 ffmpeg 抽帧，
  随后删除）。

## 开发

需要 Node 22 或更新：

```sh
npm ci
npm test          # 20 项，完全离线（HTTP 全部 mock）
npm run typecheck # 针对已发布的 DeepSeek Harness 包执行
npm run build
```

仓库用 `package-lock.json` 钉死依赖树，CI 跑的就是上面这四条命令
（`.github/workflows/ci.yml`）。发布流程见 [RELEASE.md](RELEASE.md)。

## 已知问题

DeepSeek Harness 官方包的早期 rc 版本声明了未发布的 peer 依赖：dsh-agent 0.0.1-rc.1/rc.2 与
dsh-session 0.0.1-rc.1/rc.2 引用了 @deepseek-ai/dsh-type-meta，该包不在 npm 注册表上。全新安装
时若解析器落到这些版本，会以 @deepseek-ai/dsh-type-meta 的 404 失败（已在 pnpm 11 与
npmmirror 镜像复现；npm 解析到 0.0.1-rc.5 所以成功）。对策：用 npm 配合仓库内的
`package-lock.json`（`npm ci`），或在已装好 harness 的工作区内执行 `dsh plugin add` —— 其
lockfile 已锁定可用版本。这是上游 rc 阶段的发布问题，上游修复元数据后自动消失。

## 兼容性

| 插件版本 | DeepSeek Harness | 说明 |
|---|---|---|
| 0.2.3 | **0.1.7-rc.2**、0.1.6-alpha.2 | 0.1.7 移除了共享的 `plugin` 消息来源 kind，`bilibili_frames` 改为声明自有的 `bilibili-frames` kind；一份构建两条线通用。 |
| 0.2.2 | 0.1.6-alpha.2 | 已验证，无需改代码（本插件不使用 typert codec API）。 |
| 0.2.0–0.2.1 | 0.1.0 – 0.1.6 | `bilibili_playurl` 与 `bilibili_frames` 在这一段落地。 |
| 0.1.x | 0.1.0 线 | 只有 `bilibili_search` / `bilibili_video` / `bilibili_subtitles`。 |

0.1.7-rc.2 上实测：`bilibili_search`、`bilibili_video`、`bilibili_playurl` 可用；
`bilibili_subtitles` 对无字幕视频返回文档化错误 `BILIBILI_SUBTITLES_UNAVAILABLE`。
typecheck、build 与全部 20 项测试针对 `@deepseek-ai/*@0.1.7-rc.2` 通过。

## 许可证

MIT，见 [LICENSE](LICENSE)。
