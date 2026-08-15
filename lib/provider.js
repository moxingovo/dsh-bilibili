/**
 * The official bilibili API provider: search/type video search, the view
 * metadata endpoint, and WBI-signed player subtitle retrieval, all over
 * plain HTTPS JSON. Anonymous by default; an optional cookie unlocks
 * login-gated subtitles. Every request refuses redirects, and the cookie is
 * only ever sent to the configured API host - never to subtitle CDN hosts.
 */
import { BilibiliError } from "./types.js";
import { wbiSign } from "./wbi.js";
/** Provider registry id for the official API implementation. */
export const BILIBILI_PROVIDER_ID = 'bilibili-official';
/** Default API base URL. */
export const BILIBILI_DEFAULT_BASE_URL = 'https://api.bilibili.com';
/** Default browser-identifying User-Agent header. */
export const BILIBILI_DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/** Default per-request cooperative timeout (ms). */
export const BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/** How long resolved WBI keys are reused before re-fetching from the nav API. */
export const BILIBILI_WBI_KEY_TTL_MS = 12 * 60 * 60 * 1000;
/** The search endpoint hard ceiling on page size. */
export const BILIBILI_SEARCH_MAX_PAGE_SIZE = 50;
/** Default subtitle language preference tag. */
export const BILIBILI_DEFAULT_SUBTITLE_LANGUAGE = 'zh-CN';
/** Homepage URL whose Set-Cookie supplies the anonymous buvid3 bootstrap. */
export const BILIBILI_COOKIE_BOOTSTRAP_URL = 'https://www.bilibili.com/';
/**
 * The official provider. One instance per plugin; WBI keys are cached
 * per instance and refreshed when the cached pair exceeds its TTL.
 */
export class BilibiliOfficialProvider {
    id = BILIBILI_PROVIDER_ID;
    wbiKeyPair;
    anonymousCookies = new Map();
    options;
    constructor(options = {}) {
        this.options = options;
    }
    /** Always usable: anonymous access needs no credentials. */
    available() {
        return true;
    }
    /** Search videos; drops rows without a bvid (ad slots) and strips markup. */
    async search(request, signal) {
        await this.ensureAnonymousCookies(signal);
        const params = {
            search_type: 'video',
            keyword: request.keyword,
            page: request.page,
            page_size: request.pageSize,
        };
        if (request.order !== undefined)
            params.order = request.order;
        const data = await this.requestJson('/x/web-interface/search/type', params, signal);
        return mapSearchData(data, request.page, request.pageSize);
    }
    /** Fetch one video full metadata. */
    async video(request, signal) {
        const data = await this.requestJson('/x/web-interface/view', { bvid: request.bvid }, signal);
        return mapVideoData(data, request.bvid);
    }
    /**
     * Fetch one video subtitle transcript: view for the default cid,
     * WBI-signed player for the track list, then the selected track JSON
     * from its CDN host.
     */
    async subtitles(request, signal) {
        const detail = await this.video(request, signal);
        const pair = await this.resolveWbiKeys(signal);
        const signed = wbiSign({ bvid: request.bvid, cid: detail.cid }, pair.imgKey, pair.subKey, this.nowSec());
        const data = await this.requestJson('/x/player/wbi/v2', signed, signal);
        const tracks = subtitleTracks(data);
        const track = selectSubtitleTrack(tracks, request.language ?? this.options.subtitleLanguage ?? BILIBILI_DEFAULT_SUBTITLE_LANGUAGE);
        const cues = await this.fetchSubtitleCues(track.url, signal);
        return {
            bvid: request.bvid,
            cid: detail.cid,
            language: track.language,
            trackCount: tracks.length,
            cues,
            transcript: cues.map(cue => cue.content).join('\n'),
        };
    }
    /**
     * One GET against the API host, returning the envelope data on code 0.
     * Refuses any redirect (credential-bearing requests must never follow one)
     * and rejects non-JSON bodies and non-zero business codes.
     */
    async requestJson(path, params, signal) {
        const url = new URL(path, this.options.baseUrl ?? BILIBILI_DEFAULT_BASE_URL);
        for (const [key, value] of Object.entries(params))
            url.searchParams.set(key, String(value));
        const cookie = this.cookieHeader(this.options.cookie);
        const headers = {
            accept: 'application/json',
            'user-agent': this.options.userAgent ?? BILIBILI_DEFAULT_USER_AGENT,
        };
        if (cookie !== undefined)
            headers.cookie = cookie;
        const timeoutMs = this.options.requestTimeoutMs ?? BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS;
        const signals = [];
        if (signal !== undefined)
            signals.push(signal);
        signals.push(AbortSignal.timeout(timeoutMs));
        let response;
        try {
            response = await fetch(url, { signal: AbortSignal.any(signals), redirect: 'manual', headers });
        }
        catch (cause) {
            if (signal?.aborted === true)
                throw cause;
            throw new BilibiliError('bilibili request failed: ' + String(cause), 'BILIBILI_REQUEST_FAILED', { cause });
        }
        this.captureCookies(response);
        if (response.status >= 300 && response.status < 400) {
            throw new BilibiliError('bilibili refused a redirect (HTTP ' + String(response.status) + ') from ' + url.host, 'BILIBILI_REDIRECT_REFUSED');
        }
        let body;
        try {
            body = await response.json();
        }
        catch (cause) {
            throw new BilibiliError('bilibili response was not JSON (HTTP ' + String(response.status) + ')', 'BILIBILI_BAD_RESPONSE', { cause });
        }
        const envelope = narrowEnvelope(body);
        if (envelope.code !== 0)
            throw businessError(envelope);
        return envelope.data;
    }
    /** Resolve the WBI key pair, reusing a fresh cached pair. */
    async resolveWbiKeys(signal) {
        const cached = this.wbiKeyPair;
        const now = this.now();
        if (cached !== undefined && now - cached.fetchedAt < BILIBILI_WBI_KEY_TTL_MS)
            return cached;
        const data = await this.requestJson('/x/web-interface/nav', {}, signal);
        const pair = wbiKeysFromData(data, this.now());
        this.wbiKeyPair = pair;
        return pair;
    }
    /**
     * Fetch one subtitle track JSON cue file from its CDN host. Deliberately
     * sends no cookie: the API credential is scoped to the API host only.
     */
    async fetchSubtitleCues(rawUrl, signal) {
        const url = rawUrl.startsWith('//') ? 'https:' + rawUrl : rawUrl;
        const timeoutMs = this.options.requestTimeoutMs ?? BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS;
        const signals = [];
        if (signal !== undefined)
            signals.push(signal);
        signals.push(AbortSignal.timeout(timeoutMs));
        let response;
        try {
            response = await fetch(url, { signal: AbortSignal.any(signals), redirect: 'manual', headers: {
                    accept: 'application/json',
                    'user-agent': this.options.userAgent ?? BILIBILI_DEFAULT_USER_AGENT,
                } });
        }
        catch (cause) {
            if (signal?.aborted === true)
                throw cause;
            throw new BilibiliError('bilibili subtitle fetch failed: ' + String(cause), 'BILIBILI_REQUEST_FAILED', { cause });
        }
        if (response.status >= 300 && response.status < 400) {
            throw new BilibiliError('bilibili refused a subtitle redirect (HTTP ' + String(response.status) + ')', 'BILIBILI_REDIRECT_REFUSED');
        }
        let body;
        try {
            body = await response.json();
        }
        catch (cause) {
            throw new BilibiliError('bilibili subtitle response was not JSON (HTTP ' + String(response.status) + ')', 'BILIBILI_BAD_RESPONSE', { cause });
        }
        return parseSubtitleCues(body);
    }
    /**
     * Bootstrap the anonymous buvid3 cookie from the homepage once per
     * instance, before the risk-controlled search endpoint runs. A failed
     * bootstrap is deliberately swallowed: the search still proceeds and any
     * risk control surfaces as its own structured error.
     * @param signal - caller cancellation for the bootstrap request.
     */
    async ensureAnonymousCookies(signal) {
        if (this.anonymousCookies.size > 0)
            return;
        const timeoutMs = this.options.requestTimeoutMs ?? BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS;
        const signals = [];
        if (signal !== undefined)
            signals.push(signal);
        signals.push(AbortSignal.timeout(timeoutMs));
        try {
            const response = await fetch(BILIBILI_COOKIE_BOOTSTRAP_URL, {
                signal: AbortSignal.any(signals),
                redirect: 'manual',
                headers: { 'user-agent': this.options.userAgent ?? BILIBILI_DEFAULT_USER_AGENT },
            });
            this.captureCookies(response);
        }
        catch {
            // Only the bootstrap fetch is swallowed: the homepage cookie is an
            // availability aid, never a precondition for search execution.
        }
    }
    /** Merge every Set-Cookie line of one response into the anonymous jar. */
    captureCookies(response) {
        for (const line of response.headers.getSetCookie()) {
            const match = /^([A-Za-z0-9_.-]+)=([^;]*)/.exec(line);
            if (match === null)
                continue;
            this.anonymousCookies.set(match[1] ?? '', match[2] ?? '');
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
    cookieHeader(userCookie) {
        const parts = [];
        for (const [name, value] of this.anonymousCookies)
            parts.push(name + "=" + value);
        if (userCookie !== undefined && userCookie.length > 0) {
            parts.push(userCookie.includes('=') ? userCookie : 'SESSDATA=' + userCookie);
        }
        return parts.length > 0 ? parts.join('; ') : undefined;
    }
    /** Epoch milliseconds from the injected clock or the real one. */
    now() {
        return this.options.now?.() ?? Date.now();
    }
    /** Unix seconds from the injected clock or the real one. */
    nowSec() {
        return Math.floor(this.now() / 1000);
    }
}
/**
 * Map a search/type data payload into one normalized result page.
 * @param data - the envelope data payload.
 * @param page - the requested page.
 * @param pageSize - the requested page size.
 * @returns rows, totals, and whether more pages follow.
 */
export function mapSearchData(data, page, pageSize) {
    const record = asRecord(data);
    const total = finiteNumber(record.numResults, 0);
    const rows = asRecordArray(record.result);
    const items = [];
    for (const row of rows) {
        const bvid = nonEmptyString(row.bvid);
        if (bvid === undefined)
            continue; // ad slots and pagination artifacts carry no bvid
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
        });
    }
    return { items, page, pageSize, total, hasMore: page * pageSize < total };
}
/**
 * Map a view data payload into one normalized video detail.
 * @param data - the envelope data payload.
 * @param bvid - the requested bvid (echoed as the canonical identity).
 * @returns the normalized metadata.
 */
export function mapVideoData(data, bvid) {
    const record = asRecord(data);
    const owner = asRecord(record.owner);
    const stat = asRecord(record.stat);
    const pages = [];
    for (const row of asRecordArray(record.pages)) {
        pages.push({
            cid: finiteNumber(row.cid, 0),
            page: finiteNumber(row.page, 0),
            part: nonEmptyString(row.part) ?? '',
            duration: finiteNumber(row.duration, 0),
        });
    }
    const firstPage = pages[0];
    const firstCid = firstPage !== undefined ? firstPage.cid : finiteNumber(record.cid, 0);
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
    };
}
/**
 * Extract the track list from a player endpoint data payload.
 * @param data - the envelope data payload.
 * @returns the available tracks.
 * @throws BilibiliError BILIBILI_SUBTITLES_UNAVAILABLE for a missing or empty list.
 */
export function subtitleTracks(data) {
    const record = asRecord(data);
    const subtitle = asRecord(record.subtitle);
    const rows = asRecordArray(subtitle.subtitles);
    const tracks = [];
    for (const row of rows) {
        const language = nonEmptyString(row.lan);
        const url = nonEmptyString(row.subtitle_url);
        if (language === undefined || url === undefined)
            continue;
        tracks.push({ language, languageDoc: nonEmptyString(row.lan_doc) ?? '', url });
    }
    if (tracks.length === 0) {
        throw new BilibiliError('this video exposes no accessible subtitle track (many tracks require a logged-in cookie)', 'BILIBILI_SUBTITLES_UNAVAILABLE');
    }
    return tracks;
}
/**
 * Select one track: an exact language match wins; otherwise the first.
 * @param tracks - the available tracks.
 * @param preferred - the preferred language tag.
 * @returns the selected track.
 */
export function selectSubtitleTrack(tracks, preferred) {
    const first = tracks[0];
    if (first === undefined)
        throw new BilibiliError('no subtitle track to select', 'BILIBILI_SUBTITLES_UNAVAILABLE');
    const exact = tracks.find(track => track.language === preferred);
    return exact ?? first;
}
/**
 * Parse a subtitle JSON body into validated cues (malformed rows dropped).
 * @param body - the track file parsed JSON.
 * @returns the cues in file order.
 * @throws BilibiliError BILIBILI_SUBTITLES_UNAVAILABLE for a body without cues.
 */
export function parseSubtitleCues(body) {
    const rows = asRecordArray(asRecord(body).body);
    const cues = [];
    for (const row of rows) {
        const content = nonEmptyString(row.content);
        if (content === undefined)
            continue;
        const from = numeric(row.from);
        const to = numeric(row.to);
        if (from === undefined || to === undefined)
            continue;
        cues.push({ from, to, content });
    }
    if (cues.length === 0) {
        throw new BilibiliError('the subtitle track body contains no usable cues', 'BILIBILI_SUBTITLES_UNAVAILABLE');
    }
    return cues;
}
/** Narrow an envelope, rejecting bodies missing the code field. */
function narrowEnvelope(body) {
    const record = asRecord(body);
    const code = numeric(record.code);
    if (code === undefined)
        throw new BilibiliError('bilibili response lacks a numeric code field', 'BILIBILI_BAD_RESPONSE');
    return { code, message: nonEmptyString(record.message) ?? '', data: record.data };
}
/** Map a non-zero envelope code into the structured error. */
function businessError(envelope) {
    const detail = envelope.message.length > 0 ? ': ' + envelope.message : '';
    switch (envelope.code) {
        case -412: return new BilibiliError('bilibili risk control rejected the request' + detail, 'BILIBILI_RISK_CONTROL', { bilibiliCode: envelope.code });
        case -403: return new BilibiliError('bilibili denied the request' + detail, 'BILIBILI_FORBIDDEN', { bilibiliCode: envelope.code });
        case -404: return new BilibiliError('bilibili could not find the video' + detail, 'BILIBILI_NOT_FOUND', { bilibiliCode: envelope.code });
        case -101: return new BilibiliError('bilibili requires a logged-in cookie for this data' + detail, 'BILIBILI_LOGIN_REQUIRED', { bilibiliCode: envelope.code });
        default: return new BilibiliError('bilibili API error ' + String(envelope.code) + detail, 'BILIBILI_API_ERROR', { bilibiliCode: envelope.code });
    }
}
/**
 * Extract the WBI key filename stems from a nav data payload.
 * @param data - the envelope data payload.
 * @param fetchedAt - epoch milliseconds this pair resolves at (the injected clock).
 * @returns the resolved pair stamped for TTL reuse.
 */
function wbiKeysFromData(data, fetchedAt) {
    const wbiImg = asRecord(asRecord(data).wbi_img);
    const imgUrl = nonEmptyString(wbiImg.img_url);
    const subUrl = nonEmptyString(wbiImg.sub_url);
    const imgKey = keyStem(imgUrl);
    const subKey = keyStem(subUrl);
    if (imgKey === undefined || subKey === undefined) {
        throw new BilibiliError('bilibili returned no usable WBI key material', 'BILIBILI_WBI_KEYS_UNAVAILABLE');
    }
    return { imgKey, subKey, fetchedAt };
}
/** The filename stem between the final slash and final dot, when present. */
function keyStem(url) {
    if (url === undefined)
        return undefined;
    const lastSlash = url.lastIndexOf('/');
    if (lastSlash === -1)
        return undefined;
    const base = url.slice(lastSlash + 1);
    const lastDot = base.lastIndexOf('.');
    const stem = lastDot === -1 ? base : base.slice(0, lastDot);
    return stem.length > 0 ? stem : undefined;
}
/** Wrap a record-like value; non-objects become an empty record. */
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}
/** Wrap an array-like value; non-arrays become an empty array. */
function asRecordArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'object' && item !== null && !Array.isArray(item));
}
/** A finite number, with the supplied fallback for absent or non-numeric values. */
function finiteNumber(value, fallback) {
    const parsed = numeric(value);
    return parsed === undefined ? fallback : parsed;
}
/** A finite numeric reading of the value, when the value is numeric. */
function numeric(value) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return undefined;
    return value;
}
/** A non-blank string reading of the value, when it is one. */
function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
/** Strip bilibili keyword highlight markup from a search title. */
function stripHighlight(title) {
    const text = nonEmptyString(title) ?? '';
    return text.replace(/<[^>]*>/g, '');
}
/** Unix-seconds into an ISO-8601 string, empty when the value is invalid. */
function isoFromUnixSeconds(value) {
    const seconds = numeric(value);
    if (seconds === undefined || seconds <= 0)
        return '';
    return new Date(seconds * 1000).toISOString();
}
/** A http(s) URL reading, empty for anything else. */
function urlOf(value) {
    const text = nonEmptyString(value);
    if (text === undefined)
        return '';
    try {
        const parsed = new URL(text);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? text : '';
    }
    catch {
        return '';
    }
}
/** The canonical watch URL for a bvid. */
function videoUrl(bvid) {
    return 'https://www.bilibili.com/video/' + bvid;
}
//# sourceMappingURL=provider.js.map