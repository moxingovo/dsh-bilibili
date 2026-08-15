/** dsh-bilibili plugin tests against the published @deepseek-ai peer deps. */
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BilibiliOfficialProvider, mapSearchData, mapVideoData, parseSubtitleCues, selectSubtitleTrack, subtitleTracks } from '../src/provider.ts'
import { BilibiliError } from '../src/types.ts'
import { boundTranscript, formatSearchOutput, formatSubtitleOutput, formatVideoOutput, parseSearchArgs, parseSubtitleArgs, parseVideoArgs, subtitleOutput } from '../src/tools.ts'
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
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 0, message: '', data: {} }))
    await new BilibiliOfficialProvider({ cookie: 'bare-token' }).video({ bvid: 'BV1GJ411x7h7' })
    const url = spy.mock.calls[0]?.[0]
    const init = spy.mock.calls[0]?.[1] as RequestInit
    expect(String(url)).toContain('api.bilibili.com')
    expect((init.headers as Record<string, string>).cookie).toBe('SESSDATA=bare-token')
  })

  it('passes a full cookie header through unchanged', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 0, message: '', data: {} }))
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
  it('registers the three tools and executes search end to end', async () => {
    const ctx = new Context()
    await (ctx.plugin(SystemPrompt, {})).await()
    await (ctx.plugin(ToolRuntime, {})).await()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 0, message: '', data: { numResults: 1, result: [{ bvid: 'BV1GJ411x7h7', title: 't', author: 'up' }] } }))
    await (ctx.plugin(plugin, {})).await()
    const names = ctx.tools.schemas().map(s => s.name)
    expect(names).toEqual(['bilibili_search', 'bilibili_video', 'bilibili_subtitles'])
    const result = await ctx.tools.execute({ signal: new AbortController().signal, callId: 'c1' as never, name: 'bilibili_search', arguments: { keyword: 'q' } })
    expect(result.isError).toBe(false)
  })
})
