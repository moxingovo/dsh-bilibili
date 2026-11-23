/**
 * The official bilibili API provider: search/type video search, the view
 * metadata endpoint, and WBI-signed player subtitle retrieval, all over
 * plain HTTPS JSON. Anonymous by default; an optional cookie unlocks
 * login-gated subtitles. Every request refuses redirects, and the cookie is
 * only ever sent to the configured API host - never to subtitle CDN hosts.
 */
import type { BilibiliComment, BilibiliCommentRepliesResult, BilibiliCommentReply, BilibiliCommentsResult, BilibiliDanmakuEntry, BilibiliDanmakuResult, BilibiliPlayUrlResult, BilibiliPlayerInfo, BilibiliSearchRequest, BilibiliSearchResult, BilibiliSubtitleCue, BilibiliSubtitleTrack, BilibiliSubtitlesResult, BilibiliVideoDetail } from './types.ts';
/** Provider registry id for the official API implementation. */
export declare const BILIBILI_PROVIDER_ID = "bilibili-official";
/** Default API base URL. */
export declare const BILIBILI_DEFAULT_BASE_URL = "https://api.bilibili.com";
/** Default browser-identifying User-Agent header. */
export declare const BILIBILI_DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
/** Default per-request cooperative timeout (ms). */
export declare const BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS = 30000;
/** How long resolved WBI keys are reused before re-fetching from the nav API. */
export declare const BILIBILI_WBI_KEY_TTL_MS: number;
/** The search endpoint hard ceiling on page size. */
export declare const BILIBILI_SEARCH_MAX_PAGE_SIZE = 50;
/** Default subtitle language preference tag. */
export declare const BILIBILI_DEFAULT_SUBTITLE_LANGUAGE = "zh-CN";
/** Homepage URL whose Set-Cookie supplies the anonymous buvid3 bootstrap. */
export declare const BILIBILI_COOKIE_BOOTSTRAP_URL = "https://www.bilibili.com/";
/** Options for one provider instance; the plugin resolves the cookie. */
export interface BilibiliOfficialProviderOptions {
    /** API base URL; defaults to BILIBILI_DEFAULT_BASE_URL. */
    baseUrl?: string;
    /** Optional Cookie header value resolved by the plugin from the environment. */
    cookie?: string;
    /** User-Agent header; defaults to BILIBILI_DEFAULT_USER_AGENT. */
    userAgent?: string;
    /** Per-request timeout (ms); defaults to BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS. */
    requestTimeoutMs?: number;
    /** Preferred subtitle language tag; exact match wins, else the first track. */
    subtitleLanguage?: string;
    /** Epoch-milliseconds clock, injected for deterministic key-ttl tests. */
    now?: () => number;
}
/**
 * The official provider. One instance per plugin; WBI keys are cached
 * per instance and refreshed when the cached pair exceeds its TTL.
 */
export declare class BilibiliOfficialProvider {
    readonly id = "bilibili-official";
    private wbiKeyPair;
    private readonly anonymousCookies;
    private readonly options;
    constructor(options?: BilibiliOfficialProviderOptions);
    /** Always usable: anonymous access needs no credentials. */
    available(): boolean;
    /** Search videos; drops rows without a bvid (ad slots) and strips markup. */
    search(request: BilibiliSearchRequest, signal?: AbortSignal): Promise<BilibiliSearchResult>;
    /** Fetch one video full metadata. */
    video(request: {
        readonly bvid: string;
    }, signal?: AbortSignal): Promise<BilibiliVideoDetail>;
    /** Fetch one video's direct mp4 URL (single-segment durl). */
    playurl(request: {
        readonly bvid: string;
        readonly qn?: number;
    }, signal?: AbortSignal): Promise<BilibiliPlayUrlResult>;
    /** Fetch player endpoint metadata (preview sprite) for one video page. */
    playerInfo(request: {
        readonly bvid: string;
        readonly cid: number;
    }, signal?: AbortSignal): Promise<BilibiliPlayerInfo>;
    /** Fetch raw bytes from an image CDN (sprite/cover); no cookie leaves the API host. */
    fetchBytes(url: string, signal?: AbortSignal): Promise<Uint8Array>;
    /** WBI-signed player metadata for one video page (shared by subtitles and frames). */
    private playerData;
    /**
     * Fetch one video subtitle transcript: view for the default cid,
     * WBI-signed player for the track list, then the selected track JSON
     * from its CDN host.
     */
    subtitles(request: {
        readonly bvid: string;
        readonly language?: string;
    }, signal?: AbortSignal): Promise<BilibiliSubtitlesResult>;
    /**
     * Fetch every danmaku of one video page.
     *
     * The XML list endpoint (`x/v1/dm/list.so`) only returns the first ~600
     * lines, so the complete stream comes from the player's 6-minute protobuf
     * segments (`x/v2/dm/web/seg.so`, segment_index 1..N). The XML endpoint is
     * kept as a fallback when a segment request fails.
     */
    danmaku(request: {
        readonly bvid: string;
        readonly cid?: number;
    }, signal?: AbortSignal): Promise<BilibiliDanmakuResult>;
    /** Fetch one cursor page of top-level comments (WBI-signed main endpoint). */
    comments(request: {
        readonly bvid?: string;
        readonly oid?: number;
        readonly mode?: 'hot' | 'time';
        readonly offset?: string;
    }, signal?: AbortSignal): Promise<BilibiliCommentsResult>;
    /** Fetch one page of replies under a root comment. */
    commentReplies(request: {
        readonly bvid?: string;
        readonly oid?: number;
        readonly root: string;
        readonly page?: number;
        readonly pageSize?: number;
    }, signal?: AbortSignal): Promise<BilibiliCommentRepliesResult>;
    /** Resolve the numeric aid from either an explicit oid or a bvid. */
    private resolveAid;
    /** Fetch one text body (danmaku XML) from the API host, preserving cookies. */
    private fetchText;
    /**
     * One GET against the API host, returning the envelope data on code 0.
     * Refuses any redirect (credential-bearing requests must never follow one)
     * and rejects non-JSON bodies and non-zero business codes.
     */
    private requestJson;
    /** Fetch one binary body (danmaku protobuf) from the API host. */
    private fetchBinary;
    /** Resolve the WBI key pair, reusing a fresh cached pair. */
    private resolveWbiKeys;
    /**
     * Fetch one subtitle track JSON cue file from its CDN host. Deliberately
     * sends no cookie: the API credential is scoped to the API host only.
     */
    private fetchSubtitleCues;
    /**
     * Bootstrap the anonymous buvid3 cookie from the homepage once per
     * instance, before the risk-controlled search endpoint runs. A failed
     * bootstrap is deliberately swallowed: the search still proceeds and any
     * risk control surfaces as its own structured error.
     * @param signal - caller cancellation for the bootstrap request.
     */
    private ensureAnonymousCookies;
    /** Merge every Set-Cookie line of one response into the anonymous jar. */
    private captureCookies;
    /**
     * One Cookie header joining the anonymous jar with the resolved user
     * credential; undefined when both are empty. A credential already carrying
     * an equals sign passes through as a full cookie header; a bare SESSDATA
     * token is wrapped with its cookie name.
     * @param userCookie - the optional resolved credential.
     * @returns the header value, when anything is present.
     */
    private cookieHeader;
    /** Epoch milliseconds from the injected clock or the real one. */
    private now;
    /** Unix seconds from the injected clock or the real one. */
    private nowSec;
}
/**
 * Map a search/type data payload into one normalized result page.
 * @param data - the envelope data payload.
 * @param page - the requested page.
 * @param pageSize - the requested page size.
 * @returns rows, totals, and whether more pages follow.
 */
export declare function mapSearchData(data: unknown, page: number, pageSize: number): BilibiliSearchResult;
/**
 * Map a view data payload into one normalized video detail.
 * @param data - the envelope data payload.
 * @param bvid - the requested bvid (echoed as the canonical identity).
 * @returns the normalized metadata.
 */
export declare function mapVideoData(data: unknown, bvid: string): BilibiliVideoDetail;
/**
 * Extract the track list from a player endpoint data payload.
 * @param data - the envelope data payload.
 * @returns the available tracks.
 * @throws BilibiliError BILIBILI_SUBTITLES_UNAVAILABLE for a missing or empty list.
 */
/** Map a playurl payload into the normalized direct-URL result. */
export declare function mapPlayUrlData(data: unknown, bvid: string, cid: number): BilibiliPlayUrlResult;
/** Extract the preview sprite URL from a player payload; undefined when absent. */
export declare function previewPicOf(data: unknown): string | undefined;
export declare function subtitleTracks(data: unknown): BilibiliSubtitleTrack[];
/**
 * Select one track: an exact language match wins; otherwise the first.
 * @param tracks - the available tracks.
 * @param preferred - the preferred language tag.
 * @returns the selected track.
 */
export declare function selectSubtitleTrack(tracks: readonly BilibiliSubtitleTrack[], preferred: string): BilibiliSubtitleTrack;
/**
 * Parse a subtitle JSON body into validated cues (malformed rows dropped).
 * @param body - the track file parsed JSON.
 * @returns the cues in file order.
 * @throws BilibiliError BILIBILI_SUBTITLES_UNAVAILABLE for a body without cues.
 */
export declare function parseSubtitleCues(body: unknown): readonly BilibiliSubtitleCue[];
/** Decode the minimal XML entities bilibili emits inside danmaku text. */
export declare function decodeXmlEntities(value: string): string;
/**
 * Parse the danmaku XML list into time-ordered entries.
 * A row is `<d p="time,mode,size,color,ts,pool,sender,rowid">text</d>`.
 * Malformed rows are dropped; the endpoint carries no envelope.
 * @param xml - the raw XML body.
 * @returns entries ordered by time ascending.
 */
export declare function parseDanmakuXml(xml: string): BilibiliDanmakuEntry[];
/**
 * Parse one 6-minute danmaku segment protobuf (`DmSegMobileReply`).
 *
 * Only the fields the tool needs are decoded: DanmakuElem.progress (2),
 * mode (3), color (5), midHash (6), content (7). Unknown fields are skipped,
 * so a newer server-side schema does not break parsing.
 * @param bytes - the raw segment body.
 * @returns parsed entries (rows without content are dropped).
 */
export declare function parseDanmakuSegment(bytes: Uint8Array): BilibiliDanmakuEntry[];
/** Map one reply row into the narrow reply shape. */
export declare function mapCommentReply(row: Record<string, unknown>): BilibiliCommentReply;
/** Map one top-level reply row into the comment shape. */
export declare function mapComment(row: Record<string, unknown>): BilibiliComment;
/**
 * Map the WBI main endpoint payload into one cursor page.
 * @param data - the envelope data payload.
 * @param bvid - the requested bvid (empty when the caller passed an oid).
 * @param aid - the numeric oid used.
 * @returns the normalized page.
 */
export declare function mapCommentsData(data: unknown, bvid: string, aid: number): BilibiliCommentsResult;
/**
 * Map the reply/reply endpoint payload into one reply page.
 * @param data - the envelope data payload.
 * @param aid - the numeric oid used.
 * @param root - the root comment rpid.
 * @param page - the requested page number.
 * @returns the normalized reply page.
 */
export declare function mapCommentRepliesData(data: unknown, aid: number, root: string, page: number): BilibiliCommentRepliesResult;
