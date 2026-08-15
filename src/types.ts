/**
 * Vocabulary for the dsh-bilibili plugin: video search, video metadata,
 * and subtitle transcript retrieval over the public bilibili web APIs.
 */

/** Bilibili search sort orders (the search/type endpoint order vocabulary). */
export type BilibiliSearchOrder = 'totalrank' | 'click' | 'pubdate' | 'dm'

/** One search page request. The tool layer owns page and size bounds. */
export interface BilibiliSearchRequest {
  /** Search keyword; the provider percent-encodes it. */
  readonly keyword: string
  /** 1-based result page. */
  readonly page: number
  /** Results per page (the provider ceiling is 50). */
  readonly pageSize: number
  /** Sort order; omitted keeps the API default (comprehensive). */
  readonly order?: BilibiliSearchOrder
}

/** One video row as the search endpoint returns it. */
export interface BilibiliVideoSummary {
  /** Video BV id - the canonical citeable identity. */
  readonly bvid: string
  /** Numeric aid. */
  readonly aid: number
  /** Title with bilibili highlight markup tags stripped. */
  readonly title: string
  /** Search-row description (empty when the API omits it). */
  readonly description: string
  /** Uploader display name. */
  readonly author: string
  /** Uploader numeric mid. */
  readonly authorMid: number
  /** Play count. */
  readonly play: number
  /** Danmaku count. */
  readonly danmaku: number
  /** Favorite count. */
  readonly favorite: number
  /** Comment count. */
  readonly comment: number
  /** Formatted mm:ss duration string. */
  readonly duration: string
  /** ISO-8601 publish instant derived from the API unix seconds. */
  readonly publishAt: string
  /** Cover image URL. */
  readonly coverUrl: string
  /** Canonical watch URL. */
  readonly url: string
}

/** Normalized search outcome. */
export interface BilibiliSearchResult {
  /** Rows for this page; rows missing a bvid (ad slots) are dropped. */
  readonly items: readonly BilibiliVideoSummary[]
  /** The page this result carries. */
  readonly page: number
  /** The requested page size. */
  readonly pageSize: number
  /** Total matches the API reports (numResults). */
  readonly total: number
  /** True when more pages follow. */
  readonly hasMore: boolean
}

/** One multi-part page of a video. */
export interface BilibiliVideoPage {
  /** Page cid; the first page doubles as the video default cid. */
  readonly cid: number
  /** 1-based part index. */
  readonly page: number
  /** Part title. */
  readonly part: string
  /** Part duration in seconds. */
  readonly duration: number
}

/** One video full metadata as the view endpoint returns it. */
export interface BilibiliVideoDetail {
  /** Video BV id. */
  readonly bvid: string
  /** Numeric aid. */
  readonly aid: number
  /** Default (first-page) cid. */
  readonly cid: number
  /** Full title. */
  readonly title: string
  /** Full description. */
  readonly description: string
  /** Uploader display name. */
  readonly author: string
  /** Uploader numeric mid. */
  readonly authorMid: number
  /** Play count. */
  readonly play: number
  /** Danmaku count. */
  readonly danmaku: number
  /** Comment count. */
  readonly comment: number
  /** Favorite count. */
  readonly favorite: number
  /** Coin count. */
  readonly coin: number
  /** Share count. */
  readonly share: number
  /** Like count. */
  readonly like: number
  /** Duration in seconds. */
  readonly duration: number
  /** ISO-8601 publish instant derived from the API unix seconds. */
  readonly publishAt: string
  /** Cover image URL. */
  readonly coverUrl: string
  /** Canonical watch URL. */
  readonly url: string
  /** Partition display name (tname). */
  readonly typeName: string
  /** Multi-part pages. */
  readonly pages: readonly BilibiliVideoPage[]
}

/** One available subtitle track as the player endpoint lists it. */
export interface BilibiliSubtitleTrack {
  /** Bilibili language tag (lan), e.g. zh-CN or ai-zh. */
  readonly language: string
  /** Human-readable language name (lan_doc). */
  readonly languageDoc: string
  /** Absolute JSON subtitle URL. */
  readonly url: string
}

/** One subtitle cue. */
export interface BilibiliSubtitleCue {
  /** Cue start in seconds. */
  readonly from: number
  /** Cue end in seconds. */
  readonly to: number
  /** Cue text. */
  readonly content: string
}

/** Subtitle retrieval outcome. */
export interface BilibiliSubtitlesResult {
  /** Video BV id. */
  readonly bvid: string
  /** The cid whose player metadata supplied the tracks. */
  readonly cid: number
  /** Selected track language tag. */
  readonly language: string
  /** Number of tracks the video exposes. */
  readonly trackCount: number
  /** Selected track cues. */
  readonly cues: readonly BilibiliSubtitleCue[]
  /** Cue texts joined by newlines (the model-facing transcript). */
  readonly transcript: string
}

/**
 * The provider surface the tools execute against (the plugin own provider
 * implements it; kept narrow so consumers see one contract).
 */
export interface BilibiliProviderLike {
  search(request: BilibiliSearchRequest, signal?: AbortSignal): Promise<BilibiliSearchResult>
  video(request: { readonly bvid: string }, signal?: AbortSignal): Promise<BilibiliVideoDetail>
  subtitles(request: { readonly bvid: string; readonly language?: string }, signal?: AbortSignal): Promise<BilibiliSubtitlesResult>
}

/**
 * Typed Bilibili error with a machine-routable, open-string code and
 * chained cause. Codes cover redirect refusal, risk control, missing
 * videos, login-gated data, unavailable subtitles, and malformed responses.
 */
export class BilibiliError extends Error {
  /** Machine-routable error code. */
  readonly code: string
  /** The bilibili business code (code envelope field) when one applied. */
  readonly bilibiliCode?: number

  constructor(message: string, code: string, options: { cause?: unknown; bilibiliCode?: number } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'BilibiliError'
    this.code = code
    if (options.bilibiliCode !== undefined) this.bilibiliCode = options.bilibiliCode
  }
}
