/**
 * The official bilibili API provider: search/type video search, the view
 * metadata endpoint, and WBI-signed player subtitle retrieval, all over
 * plain HTTPS JSON. Anonymous by default; an optional cookie unlocks
 * login-gated subtitles. Every request refuses redirects, and the cookie is
 * only ever sent to the configured API host - never to subtitle CDN hosts.
 */
import type { BilibiliPlayUrlResult, BilibiliPlayerInfo, BilibiliSearchRequest, BilibiliSearchResult, BilibiliSubtitleCue, BilibiliSubtitleTrack, BilibiliSubtitlesResult, BilibiliVideoDetail } from './types.ts';
/** Provider registry id for the official API implementation. */
export declare const BILIBILI_PROVIDER_ID = "bilibili-official";
/** Default API base URL. */
export declare const BILIBILI_DEFAULT_BASE_URL = "https://api.bilibili.com";
/** Default browser-identifying User-Agent header. */
export declare const BILIBILI_DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
/**
 * The headers a real browser sends to bilibili beside its user agent.
 *
 * Risk control fingerprints the whole header set, not only the user agent: a
 * request carrying `user-agent` alone answers `-412` ("request was banned") or
 * an empty result page even when a valid SESSDATA cookie is attached. Measured
 * on 2026-10-27 against `/x/web-interface/wbi/search/type`: UA only -> 0 rows,
 * UA plus these headers -> 20 rows.
 */
export declare const BILIBILI_BROWSER_HEADERS: Readonly<Record<string, string>>;
/**
 * Build the browser-consistent header set for one request.
 * @param userAgent - the configured or default user agent.
 * @param extra - per-call headers merged last (for example `accept`).
 * @returns a fresh header record every request may mutate.
 */
export declare function browserHeaders(userAgent: string, extra?: Readonly<Record<string, string>>): Record<string, string>;
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
    /**
     * File holding a bare SESSDATA token or a full Cookie header. Re-read on
     * every request, so a rotated token applies without restarting the app; a
     * missing or unreadable file is ignored.
     */
    cookieFile?: string;
    /** Environment variable naming the cookie, read when neither cookie nor cookieFile resolves. */
    cookieEnv?: string;
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
     * One GET against the API host, returning the envelope data on code 0.
     * Refuses any redirect (credential-bearing requests must never follow one)
     * and rejects non-JSON bodies and non-zero business codes.
     */
    private requestJson;
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
    /** The effective user agent for every request this provider makes. */
    private userAgent;
    /**
     * Resolve the optional user credential. The literal option wins, then a
     * readable cookie file (re-read on every request, so a rotated token applies
     * without a restart), then the environment variable. A bare SESSDATA token
     * and a full Cookie header are both accepted.
     * @returns the credential text, or undefined for anonymous access.
     */
    private resolveCookie;
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
