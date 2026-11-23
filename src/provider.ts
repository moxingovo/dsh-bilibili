/**
 * The official bilibili API provider: search/type video search, the view
 * metadata endpoint, and WBI-signed player subtitle retrieval, all over
 * plain HTTPS JSON. Anonymous by default; an optional cookie unlocks
 * login-gated subtitles. Every request refuses redirects, and the cookie is
 * only ever sent to the configured API host - never to subtitle CDN hosts.
 */

import type {
  BilibiliComment,
  BilibiliCommentRepliesResult,
  BilibiliCommentReply,
  BilibiliCommentsResult,
  BilibiliDanmakuEntry,
  BilibiliDanmakuResult,
  BilibiliPlayUrlResult,
  BilibiliPlayerInfo,
  BilibiliSearchRequest,
  BilibiliSearchResult,
  BilibiliSubtitleCue,
  BilibiliSubtitleTrack,
  BilibiliSubtitlesResult,
  BilibiliVideoDetail,
  BilibiliVideoPage,
  BilibiliVideoSummary,
} from './types.ts'
import { BilibiliError } from './types.ts'
import { wbiSign } from './wbi.ts'

/** Provider registry id for the official API implementation. */
export const BILIBILI_PROVIDER_ID = 'bilibili-official'

/** Default API base URL. */
export const BILIBILI_DEFAULT_BASE_URL = 'https://api.bilibili.com'

/** Default browser-identifying User-Agent header. */
export const BILIBILI_DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/** Default per-request cooperative timeout (ms). */
export const BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS = 30_000

/** How long resolved WBI keys are reused before re-fetching from the nav API. */
export const BILIBILI_WBI_KEY_TTL_MS = 12 * 60 * 60 * 1000

/** The search endpoint hard ceiling on page size. */
export const BILIBILI_SEARCH_MAX_PAGE_SIZE = 50

/** Default subtitle language preference tag. */
export const BILIBILI_DEFAULT_SUBTITLE_LANGUAGE = 'zh-CN'

/** Homepage URL whose Set-Cookie supplies the anonymous buvid3 bootstrap. */
export const BILIBILI_COOKIE_BOOTSTRAP_URL = 'https://www.bilibili.com/'

/** Options for one provider instance; the plugin resolves the cookie. */
export interface BilibiliOfficialProviderOptions {
  /** API base URL; defaults to BILIBILI_DEFAULT_BASE_URL. */
  baseUrl?: string
  /** Optional Cookie header value resolved by the plugin from the environment. */
  cookie?: string
  /** User-Agent header; defaults to BILIBILI_DEFAULT_USER_AGENT. */
  userAgent?: string
  /** Per-request timeout (ms); defaults to BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS. */
  requestTimeoutMs?: number
  /** Preferred subtitle language tag; exact match wins, else the first track. */
  subtitleLanguage?: string
  /** Epoch-milliseconds clock, injected for deterministic key-ttl tests. */
  now?: () => number
}

/** The code/message envelope every bilibili API response carries. */
interface BilibiliEnvelope {
  readonly code: number
  readonly message: string
  readonly data: unknown
}

/** Resolved WBI key pair cached between signatures. */
interface WbiKeyPair {
  readonly imgKey: string
  readonly subKey: string
  readonly fetchedAt: number
}

/**
 * The official provider. One instance per plugin; WBI keys are cached
 * per instance and refreshed when the cached pair exceeds its TTL.
 */
export class BilibiliOfficialProvider {
  readonly id = BILIBILI_PROVIDER_ID

  private wbiKeyPair: WbiKeyPair | undefined
  private readonly anonymousCookies = new Map<string, string>()
  private readonly options: BilibiliOfficialProviderOptions

  constructor(options: BilibiliOfficialProviderOptions = {}) {
    this.options = options
  }

  /** Always usable: anonymous access needs no credentials. */
  available(): boolean {
    return true
  }

  /** Search videos; drops rows without a bvid (ad slots) and strips markup. */
  async search(request: BilibiliSearchRequest, signal?: AbortSignal): Promise<BilibiliSearchResult> {
    await this.ensureAnonymousCookies(signal)
    const params: Record<string, string | number> = {
      search_type: 'video',
      keyword: request.keyword,
      page: request.page,
      page_size: request.pageSize,
    }
    if (request.order !== undefined) params.order = request.order
    try {
      const data = await this.requestJson('/x/web-interface/search/type', params, signal)
      return mapSearchData(data, request.page, request.pageSize)
    } catch (error: unknown) {
      // B站会定向风控默认综合排序(totalrank),而 pubdate/dm 排序通常放行:
      // 仅当调用方未显式指定排序时,遇到风控自动降级为 pubdate 重试一次;
      // 显式指定排序(或降级后仍被风控)则原样抛出。
      if (request.order === undefined && error instanceof BilibiliError && error.code === 'BILIBILI_RISK_CONTROL') {
        const fallbackData = await this.requestJson('/x/web-interface/search/type', { ...params, order: 'pubdate' }, signal)
        return mapSearchData(fallbackData, request.page, request.pageSize)
      }
      throw error
    }
  }

  /** Fetch one video full metadata. */
  async video(request: { readonly bvid: string }, signal?: AbortSignal): Promise<BilibiliVideoDetail> {
    const data = await this.requestJson('/x/web-interface/view', { bvid: request.bvid }, signal)
    return mapVideoData(data, request.bvid)
  }

  /** Fetch one video's direct mp4 URL (single-segment durl). */
  async playurl(request: { readonly bvid: string; readonly qn?: number }, signal?: AbortSignal): Promise<BilibiliPlayUrlResult> {
    const detail = await this.video(request, signal)
    const data = await this.requestJson('/x/player/playurl', {
      bvid: request.bvid,
      cid: detail.cid,
      qn: request.qn ?? 64,
      fnval: 0,
      platform: 'html5',
      high_quality: 1,
    }, signal)
    return mapPlayUrlData(data, request.bvid, detail.cid)
  }

  /** Fetch player endpoint metadata (preview sprite) for one video page. */
  async playerInfo(request: { readonly bvid: string; readonly cid: number }, signal?: AbortSignal): Promise<BilibiliPlayerInfo> {
    const data = await this.playerData(request.bvid, request.cid, signal)
    const previewPic = previewPicOf(data)
    return previewPic === undefined ? {} : { previewPic }
  }

  /** Fetch raw bytes from an image CDN (sprite/cover); no cookie leaves the API host. */
  async fetchBytes(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    const absolute = url.startsWith('//') ? 'https:' + url : url
    const timeoutMs = this.options.requestTimeoutMs ?? BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS
    const signals: AbortSignal[] = []
    if (signal !== undefined) signals.push(signal)
    signals.push(AbortSignal.timeout(timeoutMs))
    let response: Response
    try {
      response = await fetch(absolute, { signal: AbortSignal.any(signals), redirect: 'manual', headers: {
        'user-agent': this.options.userAgent ?? BILIBILI_DEFAULT_USER_AGENT,
      } })
    } catch (cause: unknown) {
      if (signal?.aborted === true) throw cause
      throw new BilibiliError('bilibili image fetch failed: ' + String(cause), 'BILIBILI_REQUEST_FAILED', { cause })
    }
    if (response.status >= 300 && response.status < 400) {
      throw new BilibiliError('bilibili refused an image redirect (HTTP ' + String(response.status) + ')', 'BILIBILI_REDIRECT_REFUSED')
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  /** WBI-signed player metadata for one video page (shared by subtitles and frames). */
  private async playerData(bvid: string, cid: number, signal?: AbortSignal): Promise<unknown> {
    const pair = await this.resolveWbiKeys(signal)
    const signed = wbiSign({ bvid, cid }, pair.imgKey, pair.subKey, this.nowSec())
    return this.requestJson('/x/player/wbi/v2', signed, signal)
  }

  /**
   * Fetch one video subtitle transcript: view for the default cid,
   * WBI-signed player for the track list, then the selected track JSON
   * from its CDN host.
   */
  async subtitles(request: { readonly bvid: string; readonly language?: string }, signal?: AbortSignal): Promise<BilibiliSubtitlesResult> {
    const detail = await this.video(request, signal)
    const data = await this.playerData(request.bvid, detail.cid, signal)
    const tracks = subtitleTracks(data)
    const track = selectSubtitleTrack(tracks, request.language ?? this.options.subtitleLanguage ?? BILIBILI_DEFAULT_SUBTITLE_LANGUAGE)
    const cues = await this.fetchSubtitleCues(track.url, signal)
    return {
      bvid: request.bvid,
      cid: detail.cid,
      language: track.language,
      trackCount: tracks.length,
      cues,
      transcript: cues.map(cue => cue.content).join('\n'),
    }
  }

  /**
   * Fetch every danmaku of one video page.
   *
   * The XML list endpoint (`x/v1/dm/list.so`) only returns the first ~600
   * lines, so the complete stream comes from the player's 6-minute protobuf
   * segments (`x/v2/dm/web/seg.so`, segment_index 1..N). The XML endpoint is
   * kept as a fallback when a segment request fails.
   */
  async danmaku(request: { readonly bvid: string; readonly cid?: number }, signal?: AbortSignal): Promise<BilibiliDanmakuResult> {
    const detail = await this.video(request, signal)
    const cid = request.cid ?? detail.cid
    const segmentCount = Math.min(Math.max(Math.ceil(detail.duration / 360), 1), 30)
    const entries: BilibiliDanmakuEntry[] = []
    let failed = false
    for (let index = 1; index <= segmentCount; index++) {
      try {
        const bytes = await this.fetchBinary('/x/v2/dm/web/seg.so', {
          type: 1,
          oid: cid,
          pid: detail.aid,
          segment_index: index,
        }, signal)
        entries.push(...parseDanmakuSegment(bytes))
      } catch (error: unknown) {
        if (signal?.aborted === true) throw error
        failed = true
        break
      }
    }
    if (failed || entries.length === 0) {
      const xml = await this.fetchText('/x/v1/dm/list.so', { oid: cid }, signal)
      return { bvid: request.bvid, cid, title: detail.title, entries: parseDanmakuXml(xml) }
    }
    entries.sort((a, b) => a.time - b.time)
    return { bvid: request.bvid, cid, title: detail.title, entries }
  }

  /** Fetch one cursor page of top-level comments (WBI-signed main endpoint). */
  async comments(
    request: { readonly bvid?: string; readonly oid?: number; readonly mode?: 'hot' | 'time'; readonly offset?: string },
    signal?: AbortSignal,
  ): Promise<BilibiliCommentsResult> {
    const resolved = await this.resolveAid(request, signal)
    const pair = await this.resolveWbiKeys(signal)
    const signed = wbiSign({
      oid: resolved.aid,
      type: 1,
      mode: request.mode === 'time' ? 2 : 3,
      pagination_str: JSON.stringify({ offset: request.offset ?? '' }),
      plat: 1,
      web_location: 1315875,
    }, pair.imgKey, pair.subKey, this.nowSec())
    const data = await this.requestJson('/x/v2/reply/wbi/main', signed, signal)
    return mapCommentsData(data, resolved.bvid, resolved.aid)
  }

  /** Fetch one page of replies under a root comment. */
  async commentReplies(
    request: { readonly bvid?: string; readonly oid?: number; readonly root: string; readonly page?: number; readonly pageSize?: number },
    signal?: AbortSignal,
  ): Promise<BilibiliCommentRepliesResult> {
    const resolved = await this.resolveAid(request, signal)
    const page = request.page ?? 1
    const pageSize = request.pageSize ?? 20
    const data = await this.requestJson('/x/v2/reply/reply', {
      type: 1,
      oid: resolved.aid,
      root: request.root,
      pn: page,
      ps: pageSize,
    }, signal)
    return mapCommentRepliesData(data, resolved.aid, request.root, page)
  }

  /** Resolve the numeric aid from either an explicit oid or a bvid. */
  private async resolveAid(
    request: { readonly bvid?: string; readonly oid?: number },
    signal?: AbortSignal,
  ): Promise<{ bvid: string; aid: number }> {
    if (request.oid !== undefined) {
      return { bvid: request.bvid ?? '', aid: request.oid }
    }
    const bvid = request.bvid?.trim() ?? ''
    if (bvid.length === 0) throw new BilibiliError('comments need a bvid or an oid', 'BILIBILI_BAD_REQUEST')
    const detail = await this.video({ bvid }, signal)
    return { bvid, aid: detail.aid }
  }

  /** Fetch one text body (danmaku XML) from the API host, preserving cookies. */
  private async fetchText(path: string, params: Readonly<Record<string, string | number>>, signal?: AbortSignal): Promise<string> {
    const url = new URL(path, this.options.baseUrl ?? BILIBILI_DEFAULT_BASE_URL)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
    const cookie = this.cookieHeader(this.options.cookie)
    const headers: Record<string, string> = {
      accept: 'text/xml,application/xml,*/*',
      'user-agent': this.options.userAgent ?? BILIBILI_DEFAULT_USER_AGENT,
    }
    if (cookie !== undefined) headers.cookie = cookie
    const timeoutMs = this.options.requestTimeoutMs ?? BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS
    const signals: AbortSignal[] = []
    if (signal !== undefined) signals.push(signal)
    signals.push(AbortSignal.timeout(timeoutMs))
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.any(signals), redirect: 'manual', headers })
    } catch (cause: unknown) {
      if (signal?.aborted === true) throw cause
      throw new BilibiliError('bilibili request failed: ' + String(cause), 'BILIBILI_REQUEST_FAILED', { cause })
    }
    this.captureCookies(response)
    if (response.status >= 300 && response.status < 400) {
      throw new BilibiliError('bilibili refused a redirect (HTTP ' + String(response.status) + ') from ' + url.host, 'BILIBILI_REDIRECT_REFUSED')
    }
    if (!response.ok) throw new BilibiliError('bilibili returned HTTP ' + String(response.status), 'BILIBILI_REQUEST_FAILED')
    return await response.text()
  }

  /**
   * One GET against the API host, returning the envelope data on code 0.
   * Refuses any redirect (credential-bearing requests must never follow one)
   * and rejects non-JSON bodies and non-zero business codes.
   */
  private async requestJson(
    path: string,
    params: Readonly<Record<string, string | number>>,
    signal?: AbortSignal,
    allowBusinessError = false,
  ): Promise<unknown> {
    const url = new URL(path, this.options.baseUrl ?? BILIBILI_DEFAULT_BASE_URL)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
    const cookie = this.cookieHeader(this.options.cookie)
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': this.options.userAgent ?? BILIBILI_DEFAULT_USER_AGENT,
    }
    if (cookie !== undefined) headers.cookie = cookie
    const timeoutMs = this.options.requestTimeoutMs ?? BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS
    const signals: AbortSignal[] = []
    if (signal !== undefined) signals.push(signal)
    signals.push(AbortSignal.timeout(timeoutMs))
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.any(signals), redirect: 'manual', headers })
    } catch (cause: unknown) {
      if (signal?.aborted === true) throw cause
      throw new BilibiliError('bilibili request failed: ' + String(cause), 'BILIBILI_REQUEST_FAILED', { cause })
    }
    this.captureCookies(response)
    if (response.status >= 300 && response.status < 400) {
      throw new BilibiliError('bilibili refused a redirect (HTTP ' + String(response.status) + ') from ' + url.host, 'BILIBILI_REDIRECT_REFUSED')
    }
    let body: unknown
    try {
      body = await response.json()
    } catch (cause: unknown) {
      throw new BilibiliError('bilibili response was not JSON (HTTP ' + String(response.status) + ')', 'BILIBILI_BAD_RESPONSE', { cause })
    }
    const envelope = narrowEnvelope(body)
    // nav 在未登录时返回 -101, 但 data.wbi_img 仍然可用 —— WBI 签名必需的密钥
    // 就在这里, 所以 nav 必须容忍业务错误码。
    if (envelope.code !== 0 && !allowBusinessError) throw businessError(envelope)
    return envelope.data
  }

  /** Fetch one binary body (danmaku protobuf) from the API host. */
  private async fetchBinary(path: string, params: Readonly<Record<string, string | number>>, signal?: AbortSignal): Promise<Uint8Array> {
    const url = new URL(path, this.options.baseUrl ?? BILIBILI_DEFAULT_BASE_URL)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
    const cookie = this.cookieHeader(this.options.cookie)
    const headers: Record<string, string> = {
      accept: '*/*',
      'user-agent': this.options.userAgent ?? BILIBILI_DEFAULT_USER_AGENT,
    }
    if (cookie !== undefined) headers.cookie = cookie
    const timeoutMs = this.options.requestTimeoutMs ?? BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS
    const signals: AbortSignal[] = []
    if (signal !== undefined) signals.push(signal)
    signals.push(AbortSignal.timeout(timeoutMs))
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.any(signals), redirect: 'manual', headers })
    } catch (cause: unknown) {
      if (signal?.aborted === true) throw cause
      throw new BilibiliError('bilibili request failed: ' + String(cause), 'BILIBILI_REQUEST_FAILED', { cause })
    }
    this.captureCookies(response)
    if (response.status >= 300 && response.status < 400) {
      throw new BilibiliError('bilibili refused a redirect (HTTP ' + String(response.status) + ') from ' + url.host, 'BILIBILI_REDIRECT_REFUSED')
    }
    if (!response.ok) throw new BilibiliError('bilibili returned HTTP ' + String(response.status), 'BILIBILI_REQUEST_FAILED')
    return new Uint8Array(await response.arrayBuffer())
  }

  /** Resolve the WBI key pair, reusing a fresh cached pair. */
  private async resolveWbiKeys(signal?: AbortSignal): Promise<WbiKeyPair> {
    const cached = this.wbiKeyPair
    const now = this.now()
    if (cached !== undefined && now - cached.fetchedAt < BILIBILI_WBI_KEY_TTL_MS) return cached
    const data = await this.requestJson('/x/web-interface/nav', {}, signal, true)
    const pair = wbiKeysFromData(data, this.now())
    this.wbiKeyPair = pair
    return pair
  }

  /**
   * Fetch one subtitle track JSON cue file from its CDN host. Deliberately
   * sends no cookie: the API credential is scoped to the API host only.
   */
  private async fetchSubtitleCues(rawUrl: string, signal?: AbortSignal): Promise<readonly BilibiliSubtitleCue[]> {
    const url = rawUrl.startsWith('//') ? 'https:' + rawUrl : rawUrl
    const timeoutMs = this.options.requestTimeoutMs ?? BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS
    const signals: AbortSignal[] = []
    if (signal !== undefined) signals.push(signal)
    signals.push(AbortSignal.timeout(timeoutMs))
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.any(signals), redirect: 'manual', headers: {
        accept: 'application/json',
        'user-agent': this.options.userAgent ?? BILIBILI_DEFAULT_USER_AGENT,
      } })
    } catch (cause: unknown) {
      if (signal?.aborted === true) throw cause
      throw new BilibiliError('bilibili subtitle fetch failed: ' + String(cause), 'BILIBILI_REQUEST_FAILED', { cause })
    }
    if (response.status >= 300 && response.status < 400) {
      throw new BilibiliError('bilibili refused a subtitle redirect (HTTP ' + String(response.status) + ')', 'BILIBILI_REDIRECT_REFUSED')
    }
    let body: unknown
    try {
      body = await response.json()
    } catch (cause: unknown) {
      throw new BilibiliError('bilibili subtitle response was not JSON (HTTP ' + String(response.status) + ')', 'BILIBILI_BAD_RESPONSE', { cause })
    }
    return parseSubtitleCues(body)
  }

  /**
   * Bootstrap the anonymous buvid3 cookie from the homepage once per
   * instance, before the risk-controlled search endpoint runs. A failed
   * bootstrap is deliberately swallowed: the search still proceeds and any
   * risk control surfaces as its own structured error.
   * @param signal - caller cancellation for the bootstrap request.
   */
  private async ensureAnonymousCookies(signal?: AbortSignal): Promise<void> {
    if (this.anonymousCookies.size > 0) return
    const timeoutMs = this.options.requestTimeoutMs ?? BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS
    const signals: AbortSignal[] = []
    if (signal !== undefined) signals.push(signal)
    signals.push(AbortSignal.timeout(timeoutMs))
    try {
      const response = await fetch(BILIBILI_COOKIE_BOOTSTRAP_URL, {
        signal: AbortSignal.any(signals),
        redirect: 'manual',
        headers: { 'user-agent': this.options.userAgent ?? BILIBILI_DEFAULT_USER_AGENT },
      })
      this.captureCookies(response)
    } catch {
      // Only the bootstrap fetch is swallowed: the homepage cookie is an
      // availability aid, never a precondition for search execution.
    }
  }

  /** Merge every Set-Cookie line of one response into the anonymous jar. */
  private captureCookies(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const match = /^([A-Za-z0-9_.-]+)=([^;]*)/.exec(line)
      if (match === null) continue
      this.anonymousCookies.set(match[1] ?? '', match[2] ?? '')
    }
  }

  /**
   * One Cookie header joining the anonymous jar with the resolved user
   * credential; undefined when both are empty. A credential already carrying
   * an equals sign passes through as a full cookie header; a bare SESSDATA
   * token is wrapped with its cookie name.
   * @param userCookie - the optional resolved credential.
   * @returns the header value, when anything is present.
   */
  private cookieHeader(userCookie?: string): string | undefined {
    const parts: string[] = []
    for (const [name, value] of this.anonymousCookies) parts.push(name + "=" + value)
    if (userCookie !== undefined && userCookie.length > 0) {
      parts.push(userCookie.includes('=') ? userCookie : 'SESSDATA=' + userCookie)
    }
    return parts.length > 0 ? parts.join('; ') : undefined
  }

  /** Epoch milliseconds from the injected clock or the real one. */
  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  /** Unix seconds from the injected clock or the real one. */
  private nowSec(): number {
    return Math.floor(this.now() / 1000)
  }
}

/**
 * Map a search/type data payload into one normalized result page.
 * @param data - the envelope data payload.
 * @param page - the requested page.
 * @param pageSize - the requested page size.
 * @returns rows, totals, and whether more pages follow.
 */
export function mapSearchData(data: unknown, page: number, pageSize: number): BilibiliSearchResult {
  const record = asRecord(data)
  const total = finiteNumber(record.numResults, 0)
  const rows = asRecordArray(record.result)
  const items: BilibiliVideoSummary[] = []
  for (const row of rows) {
    const bvid = nonEmptyString(row.bvid)
    if (bvid === undefined) continue // ad slots and pagination artifacts carry no bvid
    items.push({
      bvid,
      aid: finiteNumber(row.aid, 0),
      title: stripHighlight(row.title),
      description: nonEmptyString(row.description) ?? '',
      author: nonEmptyString(row.author) ?? '',
      authorMid: finiteNumber(row.mid, 0),
      play: finiteNumber(row.play, 0),
      danmaku: finiteNumber(row.danmaku, 0),
      favorite: finiteNumber(row.favorites, 0),
      comment: finiteNumber(row.video_review, 0),
      duration: nonEmptyString(row.duration) ?? '',
      publishAt: isoFromUnixSeconds(row.pubdate),
      coverUrl: urlOf(row.pic),
      url: videoUrl(bvid),
    })
  }
  return { items, page, pageSize, total, hasMore: page * pageSize < total }
}

/**
 * Map a view data payload into one normalized video detail.
 * @param data - the envelope data payload.
 * @param bvid - the requested bvid (echoed as the canonical identity).
 * @returns the normalized metadata.
 */
export function mapVideoData(data: unknown, bvid: string): BilibiliVideoDetail {
  const record = asRecord(data)
  const owner = asRecord(record.owner)
  const stat = asRecord(record.stat)
  const pages: BilibiliVideoPage[] = []
  for (const row of asRecordArray(record.pages)) {
    pages.push({
      cid: finiteNumber(row.cid, 0),
      page: finiteNumber(row.page, 0),
      part: nonEmptyString(row.part) ?? '',
      duration: finiteNumber(row.duration, 0),
    })
  }
  const firstPage = pages[0]
  // B站会把 cid 放回 data.cid;个别响应里 pages[0].cid 可能缺失/为 0(如风控裁剪),
  // 此时必须回退到 data.cid,否则后续 playurl/subtitles/frames 全部带 0 请求失败。
  const firstCid = firstPage !== undefined && firstPage.cid > 0 ? firstPage.cid : finiteNumber(record.cid, 0)
  return {
    bvid,
    aid: finiteNumber(record.aid, 0),
    cid: firstCid,
    title: nonEmptyString(record.title) ?? '',
    description: nonEmptyString(record.desc) ?? '',
    author: nonEmptyString(owner.name) ?? '',
    authorMid: finiteNumber(owner.mid, 0),
    play: finiteNumber(stat.view, 0),
    danmaku: finiteNumber(stat.danmaku, 0),
    comment: finiteNumber(stat.reply, 0),
    favorite: finiteNumber(stat.favorite, 0),
    coin: finiteNumber(stat.coin, 0),
    share: finiteNumber(stat.share, 0),
    like: finiteNumber(stat.like, 0),
    duration: finiteNumber(record.duration, 0),
    publishAt: isoFromUnixSeconds(record.pubdate),
    coverUrl: urlOf(record.pic),
    url: videoUrl(bvid),
    typeName: nonEmptyString(record.tname) ?? '',
    pages,
  }
}

/**
 * Extract the track list from a player endpoint data payload.
 * @param data - the envelope data payload.
 * @returns the available tracks.
 * @throws BilibiliError BILIBILI_SUBTITLES_UNAVAILABLE for a missing or empty list.
 */
/** Map a playurl payload into the normalized direct-URL result. */
export function mapPlayUrlData(data: unknown, bvid: string, cid: number): BilibiliPlayUrlResult {
  const record = asRecord(data)
  const durl = asRecordArray(record.durl)
  const first = durl[0]
  if (first === undefined) {
    throw new BilibiliError('this video exposes no playable mp4 url (login or higher-quality access may be required)', 'BILIBILI_PLAYURL_UNAVAILABLE')
  }
  const url = nonEmptyString(asRecord(first).url)
  if (url === undefined) throw new BilibiliError('the playurl payload carries no stream address', 'BILIBILI_PLAYURL_UNAVAILABLE')
  return {
    bvid,
    cid,
    url,
    quality: finiteNumber(record.quality, 0),
    size: finiteNumber(asRecord(first).size, 0),
  }
}

/** Extract the preview sprite URL from a player payload; undefined when absent. */
export function previewPicOf(data: unknown): string | undefined {
  return nonEmptyString(asRecord(data).preview_pic)
}

export function subtitleTracks(data: unknown): BilibiliSubtitleTrack[] {
  const record = asRecord(data)
  const subtitle = asRecord(record.subtitle)
  const rows = asRecordArray(subtitle.subtitles)
  const tracks: BilibiliSubtitleTrack[] = []
  for (const row of rows) {
    const language = nonEmptyString(row.lan)
    const url = nonEmptyString(row.subtitle_url)
    if (language === undefined || url === undefined) continue
    tracks.push({ language, languageDoc: nonEmptyString(row.lan_doc) ?? '', url })
  }
  if (tracks.length === 0) {
    throw new BilibiliError('this video exposes no accessible subtitle track (many tracks require a logged-in cookie)', 'BILIBILI_SUBTITLES_UNAVAILABLE')
  }
  return tracks
}

/**
 * Select one track: an exact language match wins; otherwise the first.
 * @param tracks - the available tracks.
 * @param preferred - the preferred language tag.
 * @returns the selected track.
 */
export function selectSubtitleTrack(
  tracks: readonly BilibiliSubtitleTrack[],
  preferred: string,
): BilibiliSubtitleTrack {
  const first = tracks[0]
  if (first === undefined) throw new BilibiliError('no subtitle track to select', 'BILIBILI_SUBTITLES_UNAVAILABLE')
  const exact = tracks.find(track => track.language === preferred)
  return exact ?? first
}

/**
 * Parse a subtitle JSON body into validated cues (malformed rows dropped).
 * @param body - the track file parsed JSON.
 * @returns the cues in file order.
 * @throws BilibiliError BILIBILI_SUBTITLES_UNAVAILABLE for a body without cues.
 */
export function parseSubtitleCues(body: unknown): readonly BilibiliSubtitleCue[] {
  const rows = asRecordArray(asRecord(body).body)
  const cues: BilibiliSubtitleCue[] = []
  for (const row of rows) {
    const content = nonEmptyString(row.content)
    if (content === undefined) continue
    const from = numeric(row.from)
    const to = numeric(row.to)
    if (from === undefined || to === undefined) continue
    cues.push({ from, to, content })
  }
  if (cues.length === 0) {
    throw new BilibiliError('the subtitle track body contains no usable cues', 'BILIBILI_SUBTITLES_UNAVAILABLE')
  }
  return cues
}

/** Narrow an envelope, rejecting bodies missing the code field. */
function narrowEnvelope(body: unknown): BilibiliEnvelope {
  const record = asRecord(body)
  const code = numeric(record.code)
  if (code === undefined) throw new BilibiliError('bilibili response lacks a numeric code field', 'BILIBILI_BAD_RESPONSE')
  return { code, message: nonEmptyString(record.message) ?? '', data: record.data }
}

/** Map a non-zero envelope code into the structured error. */
function businessError(envelope: BilibiliEnvelope): BilibiliError {
  const detail = envelope.message.length > 0 ? ': ' + envelope.message : ''
  switch (envelope.code) {
    case -412: return new BilibiliError('bilibili risk control rejected the request' + detail, 'BILIBILI_RISK_CONTROL', { bilibiliCode: envelope.code })
    case -403: return new BilibiliError('bilibili denied the request' + detail, 'BILIBILI_FORBIDDEN', { bilibiliCode: envelope.code })
    case -404: return new BilibiliError('bilibili could not find the video' + detail, 'BILIBILI_NOT_FOUND', { bilibiliCode: envelope.code })
    case -101: return new BilibiliError('bilibili requires a logged-in cookie for this data' + detail, 'BILIBILI_LOGIN_REQUIRED', { bilibiliCode: envelope.code })
    default: return new BilibiliError('bilibili API error ' + String(envelope.code) + detail, 'BILIBILI_API_ERROR', { bilibiliCode: envelope.code })
  }
}

/**
 * Extract the WBI key filename stems from a nav data payload.
 * @param data - the envelope data payload.
 * @param fetchedAt - epoch milliseconds this pair resolves at (the injected clock).
 * @returns the resolved pair stamped for TTL reuse.
 */
function wbiKeysFromData(data: unknown, fetchedAt: number): WbiKeyPair {
  const wbiImg = asRecord(asRecord(data).wbi_img)
  const imgUrl = nonEmptyString(wbiImg.img_url)
  const subUrl = nonEmptyString(wbiImg.sub_url)
  const imgKey = keyStem(imgUrl)
  const subKey = keyStem(subUrl)
  if (imgKey === undefined || subKey === undefined) {
    throw new BilibiliError('bilibili returned no usable WBI key material', 'BILIBILI_WBI_KEYS_UNAVAILABLE')
  }
  return { imgKey, subKey, fetchedAt }
}

/** The filename stem between the final slash and final dot, when present. */
function keyStem(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  const lastSlash = url.lastIndexOf('/')
  if (lastSlash === -1) return undefined
  const base = url.slice(lastSlash + 1)
  const lastDot = base.lastIndexOf('.')
  const stem = lastDot === -1 ? base : base.slice(0, lastDot)
  return stem.length > 0 ? stem : undefined
}

/** Wrap a record-like value; non-objects become an empty record. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Wrap an array-like value; non-arrays become an empty array. */
function asRecordArray(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
}

/** A finite number, with the supplied fallback for absent or non-numeric values. */
function finiteNumber(value: unknown, fallback: number): number {
  const parsed = numeric(value)
  return parsed === undefined ? fallback : parsed
}

/** A finite numeric reading of the value, when the value is numeric. */
function numeric(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value
}

/** A non-blank string reading of the value, when it is one. */
function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Strip bilibili keyword highlight markup from a search title. */
function stripHighlight(title: unknown): string {
  const text = nonEmptyString(title) ?? ''
  return text.replace(/<[^>]*>/g, '')
}

/** Unix-seconds into an ISO-8601 string, empty when the value is invalid. */
function isoFromUnixSeconds(value: unknown): string {
  const seconds = numeric(value)
  if (seconds === undefined || seconds <= 0) return ''
  return new Date(seconds * 1000).toISOString()
}

/** A http(s) URL reading, empty for anything else. */
function urlOf(value: unknown): string {
  const text = nonEmptyString(value)
  if (text === undefined) return ''
  try {
    const parsed = new URL(text)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? text : ''
  } catch {
    return ''
  }
}

/** The canonical watch URL for a bvid. */
function videoUrl(bvid: string): string {
  return 'https://www.bilibili.com/video/' + bvid
}

/** Decode the minimal XML entities bilibili emits inside danmaku text. */
export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

/**
 * Parse the danmaku XML list into time-ordered entries.
 * A row is `<d p="time,mode,size,color,ts,pool,sender,rowid">text</d>`.
 * Malformed rows are dropped; the endpoint carries no envelope.
 * @param xml - the raw XML body.
 * @returns entries ordered by time ascending.
 */
export function parseDanmakuXml(xml: string): BilibiliDanmakuEntry[] {
  const entries: BilibiliDanmakuEntry[] = []
  const rowPattern = /<d\s+p="([^"]*)"[^>]*>([\s\S]*?)<\/d>/g
  for (const match of xml.matchAll(rowPattern)) {
    const fields = (match[1] ?? '').split(',')
    const time = Number(fields[0])
    if (!Number.isFinite(time) || time < 0) continue
    const text = decodeXmlEntities(match[2] ?? '').trim()
    if (text.length === 0) continue
    const mode = Number(fields[1])
    const color = Number(fields[3])
    entries.push({
      time,
      mode: Number.isFinite(mode) ? mode : 1,
      color: Number.isFinite(color) ? color : 0xffffff,
      sender: fields[6] ?? '',
      text,
    })
  }
  entries.sort((a, b) => a.time - b.time)
  return entries
}

/** A mutable byte cursor for the minimal protobuf reader below. */
interface ByteCursor {
  position: number
}

/** Read one base-128 varint; protobuf lengths/values never exceed 2^53 here. */
function readVarint(bytes: Uint8Array, cursor: ByteCursor): number {
  let shift = 0
  let value = 0
  while (cursor.position < bytes.length) {
    const byte = bytes[cursor.position++] ?? 0
    value += (byte & 0x7f) * Math.pow(2, shift)
    if ((byte & 0x80) === 0) return value
    shift += 7
    // int64 fields (danmaku id) need up to 10 bytes; values beyond 2^53 lose
    // precision, but those fields are only skipped, never used as numbers.
    if (shift > 63) break
  }
  throw new BilibiliError('danmaku protobuf varint is truncated', 'BILIBILI_BAD_RESPONSE')
}

/** Skip one protobuf field of an unknown/irrelevant tag. */
function skipField(bytes: Uint8Array, cursor: ByteCursor, wireType: number): void {
  if (wireType === 0) {
    readVarint(bytes, cursor)
  } else if (wireType === 1) {
    cursor.position += 8
  } else if (wireType === 2) {
    cursor.position += readVarint(bytes, cursor)
  } else if (wireType === 5) {
    cursor.position += 4
  } else {
    // 旧式 group 标记(3/4)不应出现; 真遇到时跳一个字节继续, 让整段仍可用。
    cursor.position += 1
  }
  if (cursor.position > bytes.length) {
    throw new BilibiliError('danmaku protobuf is truncated', 'BILIBILI_BAD_RESPONSE')
  }
}

/**
 * Parse one 6-minute danmaku segment protobuf (`DmSegMobileReply`).
 *
 * Only the fields the tool needs are decoded: DanmakuElem.progress (2),
 * mode (3), color (5), midHash (6), content (7). Unknown fields are skipped,
 * so a newer server-side schema does not break parsing.
 * @param bytes - the raw segment body.
 * @returns parsed entries (rows without content are dropped).
 */
export function parseDanmakuSegment(bytes: Uint8Array): BilibiliDanmakuEntry[] {
  const decoder = new TextDecoder()
  const entries: BilibiliDanmakuEntry[] = []
  const cursor: ByteCursor = { position: 0 }
  try {
  while (cursor.position < bytes.length) {
    const key = readVarint(bytes, cursor)
    const field = Math.floor(key / 8)
    const wireType = key % 8
    if (field !== 1 || wireType !== 2) {
      skipField(bytes, cursor, wireType)
      continue
    }
    const length = readVarint(bytes, cursor)
    const end = cursor.position + length
    if (end > bytes.length) throw new BilibiliError('danmaku protobuf element is truncated', 'BILIBILI_BAD_RESPONSE')
    const elemBytes = bytes.subarray(cursor.position, end)
    cursor.position = end
    // 个别元素会带服务端新增字段; 单条解析失败不应丢掉整段。
    const elemCursor: ByteCursor = { position: 0 }
    try {
    let progress = -1
    let mode = 1
    let color = 0xffffff
    let sender = ''
    let text = ''
    while (elemCursor.position < elemBytes.length) {
      const elemKey = readVarint(elemBytes, elemCursor)
      const elemField = Math.floor(elemKey / 8)
      const elemWire = elemKey % 8
      if (elemWire === 0) {
        const value = readVarint(elemBytes, elemCursor)
        if (elemField === 2) progress = value
        else if (elemField === 3) mode = value
        else if (elemField === 5) color = value
      } else if (elemWire === 2) {
        const elementLength = readVarint(elemBytes, elemCursor)
        const start = elemCursor.position
        elemCursor.position = start + elementLength
        if (elemField === 6) sender = decoder.decode(elemBytes.subarray(start, elemCursor.position))
        else if (elemField === 7) text = decoder.decode(elemBytes.subarray(start, elemCursor.position))
      } else {
        skipField(elemBytes, elemCursor, elemWire)
      }
    }
    if (progress < 0 || text.length === 0) continue
    entries.push({ time: progress / 1000, mode, color, sender, text })
    } catch {
      continue
    }
  }
  } catch {
    // 段尾/新字段导致的整体失步: 保留已解析出的条目。
  }
  return entries
}

/** Map one reply row into the narrow reply shape. */
export function mapCommentReply(row: Record<string, unknown>): BilibiliCommentReply {
  const member = asRecord(row.member)
  const content = asRecord(row.content)
  return {
    rpid: nonEmptyString(row.rpid_str) ?? String(finiteNumber(row.rpid, 0)),
    author: nonEmptyString(member.uname) ?? '',
    content: nonEmptyString(content.message) ?? '',
    like: finiteNumber(row.like, 0),
    createdAt: finiteNumber(row.ctime, 0),
  }
}

/** Map one top-level reply row into the comment shape. */
export function mapComment(row: Record<string, unknown>): BilibiliComment {
  const member = asRecord(row.member)
  const content = asRecord(row.content)
  return {
    rpid: nonEmptyString(row.rpid_str) ?? String(finiteNumber(row.rpid, 0)),
    author: nonEmptyString(member.uname) ?? '',
    authorMid: finiteNumber(member.mid, 0),
    content: nonEmptyString(content.message) ?? '',
    like: finiteNumber(row.like, 0),
    replyCount: finiteNumber(row.rcount, 0),
    createdAt: finiteNumber(row.ctime, 0),
    replies: asRecordArray(row.replies).map(mapCommentReply),
  }
}

/**
 * Map the WBI main endpoint payload into one cursor page.
 * @param data - the envelope data payload.
 * @param bvid - the requested bvid (empty when the caller passed an oid).
 * @param aid - the numeric oid used.
 * @returns the normalized page.
 */
export function mapCommentsData(data: unknown, bvid: string, aid: number): BilibiliCommentsResult {
  const record = asRecord(data)
  const cursor = asRecord(record.cursor)
  const legacyPage = asRecord(record.page)
  const total = finiteNumber(cursor.all_count, finiteNumber(legacyPage.acount, 0))
  const nextOffset = nonEmptyString(asRecord(cursor.pagination_reply).next_offset)
  const items = asRecordArray(record.replies).map(mapComment)
  // 热门排序有时会在末页之后再多给一个空页(next_offset 仍存在); 空页即视为结束。
  const exhausted = items.length === 0
  const isEnd = cursor.is_end === true || nextOffset === undefined || exhausted
  return {
    bvid,
    aid,
    total,
    items,
    ...nextOffset === undefined || exhausted ? {} : { nextOffset },
    isEnd,
  }
}

/**
 * Map the reply/reply endpoint payload into one reply page.
 * @param data - the envelope data payload.
 * @param aid - the numeric oid used.
 * @param root - the root comment rpid.
 * @param page - the requested page number.
 * @returns the normalized reply page.
 */
export function mapCommentRepliesData(data: unknown, aid: number, root: string, page: number): BilibiliCommentRepliesResult {
  const record = asRecord(data)
  const pageInfo = asRecord(record.page)
  const items = asRecordArray(record.replies).map(mapCommentReply)
  const total = finiteNumber(pageInfo.count, items.length)
  const size = finiteNumber(pageInfo.size, items.length)
  const num = finiteNumber(pageInfo.num, page)
  return {
    aid,
    root,
    total,
    items,
    page,
    hasMore: size > 0 && num * size < total,
  }
}

