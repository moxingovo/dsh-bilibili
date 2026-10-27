# dsh-plugin-bilibili

[中文](README.zh.md) | **English** · [Changelog](CHANGELOG.md) · [Releases](https://github.com/moxingovo/dsh-bilibili/releases)

A **Bilibili retrieval plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
After install the agent gains five tools:

- `bilibili_search` — find videos by keyword: title, uploader, play count, duration, publish date.
- `bilibili_video` — full metadata for one video: counts, partition, multi-part pages, description.
- `bilibili_subtitles` — the subtitle transcript of one video, merged into plain text.
- `bilibili_playurl` — the direct mp4 play URL (and granted quality/size) for downloads or frame extraction.
- `bilibili_frames` — real video frames (preview sprite grid, cover fallback, or ffmpeg extraction) as image blocks, so image-capable models can watch the actual footage instead of relying on subtitles alone.

Anonymous by default: search bootstraps an anonymous cookie automatically and metadata always works.
Set a SESSDATA cookie to unlock login-gated subtitle tracks (where most AI subtitles live), higher-quality
play URLs, and the frames preview path. Effectively read-only: the plugin reads metadata, subtitles and
frame images only — it never stores or re-uploads videos.

> Unofficial community plugin — not affiliated with DeepSeek or Bilibili.
>
> **Harness compatibility**: **0.2.3** is verified on **DeepSeek Harness 0.1.7-rc.2** and
> **0.1.6-alpha.2** (Typert API Gateway) from one build. The 0.1.0–0.1.5 line works as well —
> nothing in the plugin uses the 0.1.6+ codec API. Version map in [Compatibility](#compatibility).

## Install

```sh
dsh plugin --profile web add dsh-plugin-bilibili

# or directly from Git:
dsh plugin --profile web add git+https://github.com/moxingovo/dsh-bilibili
```

Restart `dsh web`. New conversations gain `bilibili_search`, `bilibili_video`, `bilibili_subtitles`,
`bilibili_playurl` and `bilibili_frames`.

Mount it in an agent preset instead when only that preset should see the tools:

```yaml
- id: dsh-plugin-bilibili
  name: 'dsh-plugin-bilibili'
```

## Optional SESSDATA

Log into bilibili.com, open DevTools → Application → Cookies → the `bilibili.com` entry, and copy the
**bare** `SESSDATA` value — not the whole cookie header. Put it in the environment or in your
`$DSH_HOME/.env` (the launcher injects every `KEY=VALUE` line of that file into the server process):

```sh
BILIBILI_SESSDATA=<your-bare-token>
```

Without it only publicly visible subtitle tracks are returned; videos whose tracks require login fail
with the structured code `BILIBILI_LOGIN_REQUIRED`. A bare token is fine — the plugin prefixes
`SESSDATA=` itself.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `baseUrl` | `https://api.bilibili.com` | API host. |
| `cookie` | — | Literal SESSDATA token (secret; prefer `cookieEnv`). |
| `cookieFile` | — | File holding a bare `SESSDATA` token or a full Cookie header; re-read on every request, so a rotated token needs no restart. Wins over `cookieEnv`; an unreadable file falls through. |
| `cookieEnv` | `BILIBILI_SESSDATA` | Environment variable naming the optional SESSDATA token. |
| `ffmpegPath` | — | ffmpeg executable for `bilibili_frames` extract mode (absolute path or PATH name). Defaults to `BILI_FFMPEG`, then `ffmpeg` on PATH. |
| `userAgent` | Chrome 126 desktop UA | User-Agent header. |
| `requestTimeoutMs` | `30000` | Per-request timeout in ms. |
| `subtitleLanguage` | `zh-CN` | Preferred subtitle language tag; exact match wins, else the first track. |
| `searchMaxPageSize` | `20` | Page-size ceiling for `bilibili_search`. |
| `subtitleMaxChars` | `80000` | Transcript character cap for `bilibili_subtitles`, value-level with a `truncated` flag. |
| `timeoutMs` | `30000` | Cooperative tool-call timeout budget. |

Override any field in `profiles/web/cordis.patch.yml` — later layers win per row:

```yaml
- id: bilibili
  name: 'dsh-plugin-bilibili'
  config:
    subtitleLanguage: ai-zh
```

This package is self-contained: it registers the tools and carries its own Bilibili REST provider.
It does **not** publish a `ctx.bilibili` service, so no other plugin can consume it by service key
(an earlier in-tree line did — see [Compatibility](#compatibility)).

## Tools and error codes

Tools fail with structured errors carrying these codes:

| Code | Meaning |
|---|---|
| `BILIBILI_RISK_CONTROL` | `-412` risk control. Retry later; an implicit search already retried once with `pubdate`. |
| `BILIBILI_FORBIDDEN` | `-403` refused. |
| `BILIBILI_NOT_FOUND` | `-404` video missing or deleted. |
| `BILIBILI_LOGIN_REQUIRED` | `-101` needs the login cookie (subtitles, higher-quality play URLs). |
| `BILIBILI_SUBTITLES_UNAVAILABLE` | No accessible track, or an empty subtitle body. |
| `BILIBILI_PLAYURL_UNAVAILABLE` | No usable mp4 direct URL for this video. |
| `BILIBILI_REDIRECT_REFUSED` | A redirect was refused — the credential-safety guard. |
| `BILIBILI_BAD_RESPONSE` | Non-JSON body, or an envelope without a `code` field. |
| `BILIBILI_API_ERROR` | Envelope `code` non-zero and not covered by a specific mapping above. |
| `BILIBILI_REQUEST_FAILED` | Network failure, including timeouts. |
| `BILIBILI_WBI_KEYS_UNAVAILABLE` | Signing keys could not be obtained. |

`bilibili_frames` is registered on the plugin's own fiber like the other four tools, so it is
**visible everywhere the plugin is mounted** (including a host-domain `bundles` mount). It needs two
things at **execution time**: an `attachments` service in the calling scope, and a model route that
declares image input. Either one missing fails that single call with a structured error
(`no attachment service is mounted in this scope` / `does not declare image input`) instead of
removing the tool from the registry — always visible, failing closed. See the CHANGELOG "fixes"
section for why.

## Skills

Two companion skills ship in `skills/`:

- `plugin-tool-bilibili` — tool usage: arguments, return shapes, error routing, fallbacks.
- `plugin-web-bilibili` — the host-side provider: config keys, the SESSDATA credential, WBI /
  risk-control behaviour, and the full error-code table.

**DeepSeek Harness does not auto-load skills that live inside a plugin package.** Copy them into your
user skill root, or point a preset's `skill-filesystem` at the installed package:

```sh
# user root — available to every preset that mounts skill-filesystem
cp -r node_modules/dsh-plugin-bilibili/skills/* ~/.dsh/skills/
```

```yaml
# or, in an agent preset: keep the skills in the package and reference them
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    customSkillDirs:
      - '<DSH_HOME>/profiles/web/node_modules/dsh-plugin-bilibili/skills'
```

Either way the agent consults the matching skill before calling the tools.

## Security

- The cookie is read from the environment (or an explicit literal config value) only; it never enters
  logs or tool output.
- Every request refuses redirects, so the cookie can never be forwarded to another origin.
- The cookie is sent only to the configured API host (`api.bilibili.com` by default); subtitle CDN
  downloads carry no cookie.
- No video or audio download (`bilibili_frames`' `extract` mode downloads the mp4 to a temp directory
  to run ffmpeg, then deletes it).

## Development

Node 22 or newer:

```sh
npm ci
npm test          # 20 tests, fully offline (mocked HTTP)
npm run typecheck # runs against the published DeepSeek Harness packages
npm run build
```

The repo pins its dependency tree in `package-lock.json`, and CI runs exactly these four commands
(`.github/workflows/ci.yml`). Release steps live in [RELEASE.md](RELEASE.md).

## Known issue

Early rc releases of the official DeepSeek Harness packages declare an unpublished peer dependency:
dsh-agent 0.0.1-rc.1/rc.2 and dsh-session 0.0.1-rc.1/rc.2 list @deepseek-ai/dsh-type-meta, which is not
on the npm registry. A fresh install whose resolver lands on those versions fails with a 404 for
@deepseek-ai/dsh-type-meta (reproduced with pnpm 11 and the npmmirror mirror; npm resolves 0.0.1-rc.5
and succeeds). Workarounds: npm with the committed package-lock.json (`npm ci`), or `dsh plugin add`
inside an already-installed harness workspace, whose lockfile pins resolvable versions. This is an
upstream rc-stage publishing issue and disappears once upstream fixes the metadata.

## Compatibility

| Plugin | DeepSeek Harness | Notes |
|---|---|---|
| 0.2.3 | **0.1.7-rc.2**, 0.1.6-alpha.2 | 0.1.7 removed the shared `plugin` message-source kind; `bilibili_frames` declares its own `bilibili-frames` kind. One build serves both. |
| 0.2.2 | 0.1.6-alpha.2 | Verified, no code change (the plugin does not use the typert codec API). |
| 0.2.0–0.2.1 | 0.1.0 – 0.1.6 | `bilibili_playurl` and `bilibili_frames` landed here. |
| 0.1.x | 0.1.0 line | `bilibili_search` / `bilibili_video` / `bilibili_subtitles` only. |

Live-verified on 0.1.7-rc.2: `bilibili_search`, `bilibili_video`, `bilibili_playurl`.
`bilibili_subtitles` returns the documented `BILIBILI_SUBTITLES_UNAVAILABLE` for videos without a
track. Typecheck, build and all 20 tests pass against `@deepseek-ai/*@0.1.7-rc.2`.

## License

MIT — see [LICENSE](LICENSE).
