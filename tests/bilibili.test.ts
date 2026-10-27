/** dsh-bilibili plugin tests against the published @deepseek-ai peer deps. */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BilibiliOfficialProvider, browserHeaders, BILIBILI_BROWSER_HEADERS, mapPlayUrlData, mapSearchData, mapVideoData, parseSubtitleCues, previewPicOf, selectSubtitleTrack, subtitleTracks } from '../src/provider.ts'
import { BilibiliError } from '../src/types.ts'
import { boundTranscript, formatPlayUrlOutput, formatSearchOutput, formatSubtitleOutput, formatVideoOutput, parsePlayUrlArgs, parseSearchArgs, parseSubtitleArgs, parseVideoArgs, subtitleOutput } from '../src/tools.ts'
import { DEFAULT_FFMPEG_ENV, parseFramesArgs, resolveFfmpegCommand } from '../src/frames.ts'
import * as plugin from '../src/index.ts'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

afterEach(() => { vi.restoreAllMocks() })

describe('mappers', () => {
  it('maps search rows and drops ad slots', () => {
    const result = mapSearchData({
      numResults: 5,
      result: [
        { bvid: 'BV1GJ411x7h7', aid: 1, title: '<em>title</em>', author: 'up', mid: 10, play: 100, pubdate: 1600000000, pic: 'https://i0.hdslb.com/bfs/x.jpg' },
        { aid: 999 },
      ],
    }, 1, 10)
    expect(result.total).toBe(5)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.bvid).toBe('BV1GJ411x7h7')
    expect(result.items[0]?.title).toBe('title')
    expect(result.items[0]?.url).toBe('https://www.bilibili.com/video/BV1GJ411x7h7')
  })

  it('maps video detail with pages and defaults', () => {
    const detail = mapVideoData({
      title: 't', desc: 'd', owner: { name: 'up', mid: 10 }, stat: { view: 5 },
      pages: [{ cid: 1, page: 1, part: 'p1', duration: 60 }],
    }, 'BV1GJ411x7h7')
    expect(detail).toMatchObject({ bvid: 'BV1GJ411x7h7', cid: 1, title: 't', author: 'up', pages: [{ cid: 1, page: 1, part: 'p1', duration: 60 }] })
  })

  it('maps video detail falling back to data.cid when pages[0].cid is missing', () => {
    const detail = mapVideoData({
      title: 't', cid: 41112569704, owner: { name: 'up' },
      pages: [{ cid: 0, page: 1, part: 'p1', duration: 60 }],
    }, 'BV1GJ411x7h7')
    expect(detail.cid).toBe(41112569704)
    expect(detail.pages).toEqual([{ cid: 0, page: 1, part: 'p1', duration: 60 }])
  })

  it('maps subtitle tracks and parses cues', () => {
    const tracks = subtitleTracks({ subtitle: { subtitles: [
      { lan: 'ai-zh', lan_doc: 'AI Chinese', subtitle_url: 'https://aisubtitle.example/1.json' },
      { lan: 'zh-CN', lan_doc: 'Chinese', subtitle_url: 'https://sub.example/2.json' },
      { bad: true },
    ] } })
    expect(tracks).toHaveLength(2)
    expect(selectSubtitleTrack(tracks, 'zh-CN').language).toBe('zh-CN')
    expect(selectSubtitleTrack(tracks, 'en-US').language).toBe('ai-zh')
    const cues = parseSubtitleCues({ body: [
      { from: 0, to: 1, content: 'hi' },
      { from: 1, to: 2, content: 'there' },
      { from: 'bad', to: 2, content: 'x' },
    ] })
    expect(cues).toEqual([{ from: 0, to: 1, content: "hi" }, { from: 1, to: 2, content: "there" }])
    expect(() => subtitleTracks({ subtitle: { subtitles: [] } })).toThrow(BilibiliError)
    expect(() => parseSubtitleCues({ body: [] })).toThrow(BilibiliError)
  })
})

describe('argument parsing', () => {
  it('validates and defaults search arguments', () => {
    expect(parseSearchArgs({ keyword: ' q ' }, 20)).toEqual({ keyword: 'q', page: 1, pageSize: 10 })
    expect(() => parseSearchArgs({ keyword: '' }, 20)).toThrow()
    expect(() => parseSearchArgs({ keyword: 'q', pageSize: 21 }, 20)).toThrow()
    expect(() => parseSearchArgs({ keyword: 'q', order: 'nope' }, 20)).toThrow()
    expect(parseSearchArgs({ keyword: 'q', order: 'pubdate', page: 2, pageSize: 5 }, 20)).toEqual({ keyword: 'q', page: 2, pageSize: 5, order: 'pubdate' })
  })

  it('validates the BV id pattern and subtitle language', () => {
    expect(parseVideoArgs({ bvid: ' BV1GJ411x7h7 ' })).toEqual({ bvid: 'BV1GJ411x7h7' })
    expect(() => parseVideoArgs({ bvid: 'av123' })).toThrow()
    expect(() => parseVideoArgs({ bvid: '' })).toThrow()
    expect(parseSubtitleArgs({ bvid: 'BV1GJ411x7h7', language: ' zh-CN ' })).toEqual({ bvid: 'BV1GJ411x7h7', language: 'zh-CN' })
    expect(() => parseSubtitleArgs({ bvid: 'nope' })).toThrow()
    expect(() => parseSubtitleArgs({ bvid: 'BV1GJ411x7h7', language: '   ' })).toThrow()
  })
})

describe('formatting', () => {
  it('formats search, video, and subtitle outputs', () => {
    const search = formatSearchOutput({ items: [{ bvid: "BV1GJ411x7h7", aid: 1, title: "t", description: "", author: "up", authorMid: 1, play: 5, danmaku: 0, favorite: 0, comment: 0, duration: "01:00", publishAt: "2020-01-01T00:00:00.000Z", coverUrl: "", url: "https://www.bilibili.com/video/BV1GJ411x7h7" }], page: 1, pageSize: 10, total: 1, hasMore: false })
    expect(search).toContain('[t](https://www.bilibili.com/video/BV1GJ411x7h7)')
    expect(search).toContain('UP: up')
    expect(formatSearchOutput({ items: [], page: 1, pageSize: 10, total: 0, hasMore: false })).toBe('No videos found for this query on bilibili.')
    expect(formatVideoOutput(mapVideoData({ title: 't', owner: { name: 'up' } }, 'BV1GJ411x7h7'))).toContain('Title: t')
    const out = subtitleOutput({ bvid: 'BV1GJ411x7h7', cid: 1, language: 'zh-CN', trackCount: 1, cues: [{ from: 0, to: 1, content: 'a' }], transcript: '0123456789' }, 4)
    expect(out.truncated).toBe(true)
    expect(out.transcript).toBe('0123')
    expect(formatSubtitleOutput(out)).toContain('(Transcript truncated')
    expect(boundTranscript('abc', 3)).toEqual({ transcript: 'abc', truncated: false })
    expect(boundTranscript('abcd', 3)).toEqual({ transcript: 'abc', truncated: true })
  })
})

describe('provider request handling', () => {
  it('wraps a bare token as SESSDATA and scopes the cookie to the API host', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ code: 0, message: '', data: {} }))
    await new BilibiliOfficialProvider({ cookie: 'bare-token' }).video({ bvid: 'BV1GJ411x7h7' })
    const url = spy.mock.calls[0]?.[0]
    const init = spy.mock.calls[0]?.[1] as RequestInit
    expect(String(url)).toContain('api.bilibili.com')
    expect((init.headers as Record<string, string>).cookie).toBe('SESSDATA=bare-token')
  })

  it('falls back to pubdate ordering once when an implicit search hits risk control', async () => {
    const okBody = { code: 0, message: '', data: { numResults: 1, result: [
      { bvid: 'BV1GJ411x7h7', aid: 1, title: 't', author: 'a', mid: 1, play: 1, pubdate: 1600000000, pic: 'https://i0.hdslb.com/bfs/x.jpg' },
    ] } }
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: '', data: {} })) // homepage bootstrap
      .mockResolvedValueOnce(jsonResponse({ code: -412, message: 'request was banned', data: {} }))
      .mockResolvedValueOnce(jsonResponse(okBody))
    const result = await new BilibiliOfficialProvider().search({ keyword: 'q', page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
    const secondUrl = String(spy.mock.calls[1]?.[0])
    const thirdUrl = String(spy.mock.calls[2]?.[0])
    expect(secondUrl).toContain('search/type')
    expect(thirdUrl).toContain('order=pubdate')
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('does not degrade when the caller explicitly selected an order', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: '', data: {} }))
      .mockResolvedValueOnce(jsonResponse({ code: -412, message: 'request was banned', data: {} }))
    await expect(new BilibiliOfficialProvider().search({ keyword: 'q', page: 1, pageSize: 10, order: 'totalrank' }))
      .rejects.toMatchObject({ code: 'BILIBILI_RISK_CONTROL' })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('passes a full cookie header through unchanged', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ code: 0, message: '', data: {} }))
    await new BilibiliOfficialProvider({ cookie: 'SESSDATA=abc; bili_jct=xyz' }).video({ bvid: 'BV1GJ411x7h7' })
    const init = spy.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).cookie).toBe('SESSDATA=abc; bili_jct=xyz')
  })

  it('refuses redirects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('moved', { status: 301 }))
    await expect(new BilibiliOfficialProvider().video({ bvid: 'BV1GJ411x7h7' })).rejects.toMatchObject({ code: 'BILIBILI_REDIRECT_REFUSED' })
  })

  it('maps business codes -412, -101, and -404', async () => {
    const cases: Array<[number, string]> = [[-412, 'BILIBILI_RISK_CONTROL'], [-101, 'BILIBILI_LOGIN_REQUIRED'], [-404, 'BILIBILI_NOT_FOUND']]
    for (const [code, expected] of cases) {
      vi.restoreAllMocks()
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code, message: 'm', data: null }))
      await expect(new BilibiliOfficialProvider().video({ bvid: 'BV1GJ411x7h7' })).rejects.toMatchObject({ code: expected })
    }
  })

  it('fetches subtitles through a WBI-signed player request and the track CDN without the cookie', async () => {
    const provider = new BilibiliOfficialProvider({ cookie: 'secret', now: () => 1_600_000_000_000 })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/x/web-interface/view')) return jsonResponse({ code: 0, message: '', data: { title: 't', cid: 42, pages: [{ cid: 42, page: 1, part: 'p', duration: 10 }], owner: {}, stat: {} } })
      if (url.includes('/x/web-interface/nav')) return jsonResponse({ code: 0, message: '', data: { wbi_img: { img_url: 'https://i0.hdslb.com/bfs/wbi/0123456789abcdef0123456789abcdef.png', sub_url: 'https://i0.hdslb.com/bfs/wbi/fedcba9876543210fedcba9876543210.png' } } })
      if (url.includes('/x/player/wbi/v2')) return jsonResponse({ code: 0, message: '', data: { subtitle: { subtitles: [{ lan: 'zh-CN', lan_doc: 'Chinese', subtitle_url: 'https://aisubtitle.example/1.json' }] } } })
      if (url.includes('aisubtitle.example')) return jsonResponse({ body: [{ from: 0, to: 1, content: 'hello' }] })
      throw new Error('unexpected fetch: ' + url)
    })
    const result = await provider.subtitles({ bvid: 'BV1GJ411x7h7' })
    expect(result.language).toBe('zh-CN')
    expect(result.cid).toBe(42)
    expect(result.transcript).toBe('hello')
    const playerCall = fetchMock.mock.calls.find(call => String(call[0]).includes('/x/player/wbi/v2'))
    const playerUrl = String(playerCall?.[0])
    expect(playerUrl).toContain('w_rid=')
    expect(playerUrl).toContain('wts=')
    expect(playerUrl).toContain('bvid=BV1GJ411x7h7')
    const cdnCall = fetchMock.mock.calls.find(call => String(call[0]).includes('aisubtitle.example'))
    const cdnHeaders = cdnCall?.[1]?.headers as Record<string, string> | undefined
    expect(cdnHeaders?.cookie).toBeUndefined()
  })
})

describe('plugin composition', () => {
  it('registers all five tools on the plugin fiber and executes search end to end', async () => {
    const ctx = new Context()
    await (ctx.plugin(SystemPrompt, {})).await()
    await (ctx.plugin(ToolRuntime, {})).await()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 0, message: '', data: { numResults: 1, result: [{ bvid: 'BV1GJ411x7h7', title: 't', author: 'up' }] } }))
    await (ctx.plugin(plugin, {})).await()
    const names = ctx.tools.schemas().map(s => s.name)
    // bilibili_frames belongs to this list: it is registered on the plugin's own
    // fiber so a host-domain mount reaches agent scopes too. A Cordis child fiber
    // (the old `ctx.inject(['attachments'], …)`) would have kept it invisible
    // there, because a child's registrations reach only that child's descendants.
    expect(names).toEqual(['bilibili_search', 'bilibili_video', 'bilibili_subtitles', 'bilibili_playurl', 'bilibili_frames'])
    const result = await ctx.tools.execute({ signal: new AbortController().signal, callId: 'c1' as never, name: 'bilibili_search', arguments: { keyword: 'q' } })
    expect(result.isError).toBe(false)
  })

  it('fails bilibili_frames closed when no attachment service is mounted', async () => {
    const ctx = new Context()
    await (ctx.plugin(SystemPrompt, {})).await()
    await (ctx.plugin(ToolRuntime, {})).await()
    await (ctx.plugin(plugin, {})).await()
    // Registered but unusable here: the tool reports the missing store at
    // execution time instead of disappearing from the registry.
    expect(ctx.tools.schemas().map(s => s.name)).toContain('bilibili_frames')
    const result = await ctx.tools.execute({ signal: new AbortController().signal, callId: 'c2' as never, name: 'bilibili_frames', arguments: { bvid: 'BV1GJ411x7h7' } })
    expect(result.isError).toBe(true)
  })
})

describe('playurl and frames', () => {
  it('maps a playurl payload into the normalized result', () => {
    const result = mapPlayUrlData({ quality: 64, durl: [{ url: 'https://upos.example/v.mp4', size: 1024 }] }, 'BV1GJ411x7h7', 41112569704)
    expect(result).toEqual({ bvid: 'BV1GJ411x7h7', cid: 41112569704, url: 'https://upos.example/v.mp4', quality: 64, size: 1024 })
  })

  it('rejects a playurl payload without durl', () => {
    expect(() => mapPlayUrlData({ quality: 0, durl: [] }, 'BV1GJ411x7h7', 1)).toThrow(BilibiliError)
  })

  it('extracts the preview sprite URL when present', () => {
    expect(previewPicOf({ preview_pic: 'https://i0.hdslb.com/bfs/preview/x.jpg' })).toBe('https://i0.hdslb.com/bfs/preview/x.jpg')
    expect(previewPicOf({})).toBeUndefined()
  })

  it('validates playurl args and formats output', () => {
    expect(parsePlayUrlArgs({ bvid: 'BV1GJ411x7h7' })).toEqual({ bvid: 'BV1GJ411x7h7', qn: 64 })
    expect(parsePlayUrlArgs({ bvid: ' BV1GJ411x7h7 ', qn: 32 })).toEqual({ bvid: 'BV1GJ411x7h7', qn: 32 })
    expect(() => parsePlayUrlArgs({ bvid: '' })).toThrow('bvid must be a non-empty string')
    expect(() => parsePlayUrlArgs({ bvid: 'BV1GJ411x7h7', qn: 100 })).toThrow('qn must be one of')
    expect(formatPlayUrlOutput('https://x/v.mp4', 64, 2 * 1024 * 1024)).toContain('2.0 MB')
    expect(formatPlayUrlOutput('https://x/v.mp4', 32, 500 * 1024)).toContain('500 KB')
  })

  it('validates frames args', () => {
    expect(parseFramesArgs({ bvid: 'BV1GJ411x7h7' })).toEqual({ bvid: 'BV1GJ411x7h7', mode: 'auto', count: 8 })
    expect(parseFramesArgs({ bvid: 'BV1GJ411x7h7', mode: 'extract', count: 4 })).toEqual({ bvid: 'BV1GJ411x7h7', mode: 'extract', count: 4 })
    expect(() => parseFramesArgs({ bvid: 'BV1GJ411x7h7', mode: 'bogus' })).toThrow('mode must be one of')
    expect(() => parseFramesArgs({ bvid: 'BV1GJ411x7h7', count: 0 })).toThrow('count must be an integer between 1 and')
    expect(() => parseFramesArgs({ bvid: '' })).toThrow('bvid must be a non-empty string')
  })
})

describe('browser headers', () => {
  it('sends the full browser header set instead of only a user agent', () => {
    const headers = browserHeaders('ua')
    expect(headers['user-agent']).toBe('ua')
    expect(headers.referer).toBe('https://www.bilibili.com/')
    expect(headers.origin).toBe('https://www.bilibili.com')
    expect(headers['accept-language']).toContain('zh-CN')
    expect(headers['sec-ch-ua']).toContain('Chromium')
    expect(headers['sec-fetch-site']).toBe('same-site')
  })

  it('merges per-call headers without mutating the shared set', () => {
    const headers = browserHeaders('ua', { accept: 'application/json' })
    expect(headers.accept).toBe('application/json')
    expect(BILIBILI_BROWSER_HEADERS).not.toHaveProperty('accept')
  })

  it('attaches them to a provider request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ code: 0, message: '', data: {} }))
    await new BilibiliOfficialProvider().video({ bvid: 'BV1GJ411x7h7' })
    const headers = (spy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
    expect(headers.referer).toBe('https://www.bilibili.com/')
    expect(headers['sec-ch-ua']).toContain('Chromium')
  })
})

describe('cookie sources', () => {
  it('re-reads a cookie file on every request, so rotation needs no restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-bili-cookie-'))
    const file = join(dir, 'sessdata.txt')
    writeFileSync(file, 'first-token\n')
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ code: 0, message: '', data: {} }))
    const provider = new BilibiliOfficialProvider({ cookieFile: file })
    await provider.video({ bvid: 'BV1GJ411x7h7' })
    writeFileSync(file, 'second-token\n')
    await provider.video({ bvid: 'BV1GJ411x7h7' })
    const first = (spy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
    const second = (spy.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>
    expect(first.cookie).toBe('SESSDATA=first-token')
    expect(second.cookie).toBe('SESSDATA=second-token')
  })

  it('prefers the literal option, then the file, then the environment', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-bili-cookie-'))
    const file = join(dir, 'sessdata.txt')
    writeFileSync(file, 'from-file')
    process.env.DSH_BILI_TEST_ENV = 'from-env'
    try {
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ code: 0, message: '', data: {} }))
      await new BilibiliOfficialProvider({ cookie: 'from-literal', cookieFile: file, cookieEnv: 'DSH_BILI_TEST_ENV' }).video({ bvid: 'BV1GJ411x7h7' })
      await new BilibiliOfficialProvider({ cookieFile: file, cookieEnv: 'DSH_BILI_TEST_ENV' }).video({ bvid: 'BV1GJ411x7h7' })
      await new BilibiliOfficialProvider({ cookieFile: join(dir, 'missing.txt'), cookieEnv: 'DSH_BILI_TEST_ENV' }).video({ bvid: 'BV1GJ411x7h7' })
      const cookies = spy.mock.calls.map(call => ((call[1] as RequestInit).headers as Record<string, string>).cookie)
      expect(cookies).toEqual(['SESSDATA=from-literal', 'SESSDATA=from-file', 'SESSDATA=from-env'])
    } finally {
      delete process.env.DSH_BILI_TEST_ENV
    }
  })
})

describe('ffmpeg resolution', () => {
  it('prefers the configured path, then the environment, then PATH', () => {
    expect(resolveFfmpegCommand({ ffmpegPath: 'D:/ff/ffmpeg.exe' }, {})).toBe('D:/ff/ffmpeg.exe')
    expect(resolveFfmpegCommand({}, { [DEFAULT_FFMPEG_ENV]: 'E:/ff/ffmpeg.exe' })).toBe('E:/ff/ffmpeg.exe')
    expect(resolveFfmpegCommand({ ffmpegPath: '   ' }, {})).toBe('ffmpeg')
    expect(resolveFfmpegCommand({}, {})).toBe('ffmpeg')
  })

  it('honours a custom environment variable name', () => {
    expect(resolveFfmpegCommand({ ffmpegEnv: 'MY_FFMPEG' }, { MY_FFMPEG: 'x/ffmpeg' })).toBe('x/ffmpeg')
    expect(resolveFfmpegCommand({ ffmpegEnv: 'MY_FFMPEG' }, { [DEFAULT_FFMPEG_ENV]: 'y/ffmpeg' })).toBe('ffmpeg')
  })
})
