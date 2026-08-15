# dsh-bilibili

[涓枃](README.zh.md) | English

A Bilibili retrieval plugin for DeepSeek Harness. After install the agent gains three tools:

- bilibili_search 鈥?find videos by keyword: title, uploader, play count, duration, publish date.
- bilibili_video 鈥?full metadata for one video: counts, partition, multi-part pages, description.
- bilibili_subtitles 鈥?the subtitle transcript of one video, merged into plain text.

Anonymous by default: search works with automatic anonymous-cookie bootstrapping, and metadata always works. Set a SESSDATA cookie to unlock login-gated subtitle tracks, which is where most AI subtitles live. The plugin reads metadata and subtitle text only 鈥?it never downloads video or audio streams.

## Install

Run:

    dsh plugin --profile web add git+https://github.com/moxingovo/dsh-bilibili

Restart dsh web. New conversations gain bilibili_search, bilibili_video, and bilibili_subtitles automatically.

## Optional SESSDATA

Log into bilibili.com, open DevTools, go to Application, then Cookies, then the bilibili.com entry, and copy the SESSDATA value 鈥?the bare token, not the whole cookie header. Put it in the environment or in your DSH_HOME .env file:

    BILIBILI_SESSDATA=<your-bare-token>

Without it only publicly visible subtitle tracks are returned; videos whose tracks require login fail with the structured code BILIBILI_LOGIN_REQUIRED.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| cookieEnv | BILIBILI_SESSDATA | Environment variable naming the optional SESSDATA token. |
| requestTimeoutMs | 30000 | Per-request timeout in ms. |
| subtitleLanguage | zh-CN | Preferred subtitle language tag; exact match wins, else the first track. |
| searchMaxPageSize | 20 | Page-size ceiling for bilibili_search. |
| subtitleMaxChars | 80000 | Transcript character cap for bilibili_subtitles, value-level with a truncated flag. |

Override any field in profiles/web/cordis.patch.yml 鈥?later layers win per row.

## Error codes

Tools fail with structured errors carrying these codes: BILIBILI_RISK_CONTROL for -412 鈥?retry later, the plugin already bootstraps the anonymous cookie; BILIBILI_FORBIDDEN for -403; BILIBILI_NOT_FOUND for -404; BILIBILI_LOGIN_REQUIRED for -101, typically subtitles; BILIBILI_SUBTITLES_UNAVAILABLE when no accessible track or an empty body; BILIBILI_REDIRECT_REFUSED as the credential-safety guard; BILIBILI_BAD_RESPONSE for non-JSON or a missing code envelope; BILIBILI_REQUEST_FAILED for network; BILIBILI_WBI_KEYS_UNAVAILABLE when signing keys are missing.

## Security

- The cookie is read from the environment only; it never enters configuration files, logs, or tool output.
- Every request refuses redirects, so the cookie can never be forwarded to another origin.
- The cookie is sent only to api.bilibili.com; subtitle CDN downloads carry no cookie.
- No video or audio download.

## Skills

Two companion skills ship in skills/: plugin-tool-bilibili for tool usage and plugin-web-bilibili for service configuration and error codes. Copy them into your harness skills directory to make the agent consult them before calling the tools.

## Development

Node 22 or newer:

```sh
npm ci
npm test
```

The repo pins its dependency tree in package-lock.json. The test suite runs fully offline (mocked HTTP); the typecheck runs against the published DeepSeek Harness packages.

## Known issue

Early rc releases of the official DeepSeek Harness packages declare an unpublished peer dependency: dsh-agent 0.0.1-rc.1/rc.2 and dsh-session 0.0.1-rc.1/rc.2 list @deepseek-ai/dsh-type-meta, which is not on the npm registry. A fresh install whose resolver lands on those versions fails with a 404 for @deepseek-ai/dsh-type-meta (reproduced with pnpm 11 and the npmmirror mirror; npm resolves 0.0.1-rc.5 and succeeds). Workarounds: npm with the committed package-lock.json (npm ci), or dsh plugin add inside an already-installed harness workspace, whose lockfile pins resolvable versions. This is an upstream rc-stage publishing issue and disappears once upstream fixes the metadata.

## License

MIT, see LICENSE.
