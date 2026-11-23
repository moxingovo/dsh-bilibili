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

/** One direct-play mp4 URL as the playurl endpoint returns it. */
export interface BilibiliPlayUrlResult {
  /** Video BV id. */
  readonly bvid: string
  /** The cid used for the request. */
  readonly cid: number
  /** Direct mp4 URL (single-segment durl). */
  readonly url: string
  /** The quality actually granted (qn). */
  readonly quality: number
  /** Encoded file size in bytes. */
  readonly size: number
}

/** Player endpoint metadata relevant to frame viewing. */
export interface BilibiliPlayerInfo {
  /** Preview sprite URL (a grid of sampled frames); absent when none is exposed. */
  readonly previewPic?: string
}


/** One parsed danmaku line (the XML list endpoint row). */
export interface BilibiliDanmakuEntry {
  /** Time offset in seconds from the video start. */
  readonly time: number
  /** Danmaku mode: 1 scroll, 4 bottom, 5 top. */
  readonly mode: number
  /** Decimal RGB color. */
  readonly color: number
  /** Hashed sender id (never the numeric uid). */
  readonly sender: string
  /** The danmaku text. */
  readonly text: string
}

/** All danmaku of one video page, ordered by time. */
export interface BilibiliDanmakuResult {
  /** Video BV id. */
  readonly bvid: string
  /** The cid the danmaku belong to. */
  readonly cid: number
  /** Video title (for the response envelope). */
  readonly title: string
  /** Parsed entries, ordered by time ascending. */
  readonly entries: readonly BilibiliDanmakuEntry[]
}

/** One reply preview attached to a top-level comment. */
export interface BilibiliCommentReply {
  /** Reply rpid. */
  readonly rpid: string
  /** Author display name. */
  readonly author: string
  /** Plain-text body. */
  readonly content: string
  /** Like count. */
  readonly like: number
  /** Epoch seconds. */
  readonly createdAt: number
}

/** One top-level comment. */
export interface BilibiliComment {
  /** Comment rpid. */
  readonly rpid: string
  /** Author display name. */
  readonly author: string
  /** Author mid. */
  readonly authorMid: number
  /** Plain-text body. */
  readonly content: string
  /** Like count. */
  readonly like: number
  /** Total replies under this comment. */
  readonly replyCount: number
  /** Epoch seconds. */
  readonly createdAt: number
  /** Preview replies carried by the list endpoint. */
  readonly replies: readonly BilibiliCommentReply[]
}

/** One comments page (cursor paginated). */
export interface BilibiliCommentsResult {
  /** Video BV id. */
  readonly bvid: string
  /** Numeric aid used as oid. */
  readonly aid: number
  /** Total top-level comments the API reports. */
  readonly total: number
  /** This page's comments. */
  readonly items: readonly BilibiliComment[]
  /** Cursor for the next page; absent at the end. */
  readonly nextOffset?: string
  /** True when this is the last page. */
  readonly isEnd: boolean
}

/** One page of replies under a top-level comment. */
export interface BilibiliCommentRepliesResult {
  /** Numeric aid used as oid. */
  readonly aid: number
  /** The root comment rpid. */
  readonly root: string
  /** Total replies under the root comment. */
  readonly total: number
  /** This page's replies. */
  readonly items: readonly BilibiliCommentReply[]
  /** 1-based page number. */
  readonly page: number
  /** True when more reply pages follow. */
  readonly hasMore: boolean
}

/**
 * The provider surface the tools execute against (the plugin own provider
 * implements it; kept narrow so consumers see one contract).
 */
export interface BilibiliProviderLike {
  search(request: BilibiliSearchRequest, signal?: AbortSignal): Promise<BilibiliSearchResult>
  video(request: { readonly bvid: string }, signal?: AbortSignal): Promise<BilibiliVideoDetail>
  subtitles(request: { readonly bvid: string; readonly language?: string }, signal?: AbortSignal): Promise<BilibiliSubtitlesResult>
  playurl(request: { readonly bvid: string; readonly qn?: number }, signal?: AbortSignal): Promise<BilibiliPlayUrlResult>
  playerInfo(request: { readonly bvid: string; readonly cid: number }, signal?: AbortSignal): Promise<BilibiliPlayerInfo>
  fetchBytes(url: string, signal?: AbortSignal): Promise<Uint8Array>
  danmaku(request: { readonly bvid: string; readonly cid?: number }, signal?: AbortSignal): Promise<BilibiliDanmakuResult>
  comments(request: { readonly bvid?: string; readonly oid?: number; readonly mode?: 'hot' | 'time'; readonly offset?: string }, signal?: AbortSignal): Promise<BilibiliCommentsResult>
  commentReplies(request: { readonly bvid?: string; readonly oid?: number; readonly root: string; readonly page?: number; readonly pageSize?: number }, signal?: AbortSignal): Promise<BilibiliCommentRepliesResult>
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