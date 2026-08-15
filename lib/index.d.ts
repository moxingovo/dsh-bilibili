/**
 * dsh-bilibili: one DeepSeek Harness plugin that registers the Bilibili
 * capability (bilibili_search / bilibili_video / bilibili_subtitles) with
 * its official API provider. Anonymous by default with risk-control
 * bootstrapping; an optional SESSDATA from the environment unlocks
 * login-gated subtitles.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { BilibiliOfficialProvider, BILIBILI_DEFAULT_BASE_URL, BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS, BILIBILI_DEFAULT_SUBTITLE_LANGUAGE, BILIBILI_DEFAULT_USER_AGENT, BILIBILI_PROVIDER_ID, BILIBILI_SEARCH_MAX_PAGE_SIZE, BILIBILI_WBI_KEY_TTL_MS, BILIBILI_COOKIE_BOOTSTRAP_URL, mapSearchData, mapVideoData, subtitleTracks, selectSubtitleTrack, parseSubtitleCues } from './provider.ts';
export type { BilibiliOfficialProviderOptions } from './provider.ts';
export { BilibiliError } from './types.ts';
export type { BilibiliProviderLike, BilibiliSearchOrder, BilibiliSearchRequest, BilibiliSearchResult, BilibiliSubtitleCue, BilibiliSubtitleTrack, BilibiliSubtitlesResult, BilibiliVideoDetail, BilibiliVideoPage, BilibiliVideoSummary, } from './types.ts';
export { BILIBILI_SEARCH_DEFAULT_PAGE_SIZE, BILIBILI_SUBTITLES_MAX_CHARS, BVID_PATTERN, applyBilibiliSearchTool, applyBilibiliVideoTool, applyBilibiliSubtitleTool, boundTranscript, formatSearchOutput, formatSubtitleOutput, formatVideoOutput, parseSearchArgs, parseSubtitleArgs, parseVideoArgs, presentSearchCall, presentSearchResult, presentSubtitleCall, presentSubtitleResult, presentVideoCall, presentVideoResult, subtitleOutput, } from './tools.ts';
export type { BilibiliSearchArgs, BilibiliSubtitleOutput } from './tools.ts';
export { MIXIN_KEY_ENC_TAB, mixinKey, wbiSign } from './wbi.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "dsh-bilibili";
/** Services required before the plugin starts. */
export declare const inject: string[];
/** Default cooperative tool-call timeout budget (ms). */
export declare const DEFAULT_BILIBILI_TOOL_TIMEOUT_MS = 30000;
/** Environment variable naming the optional Bilibili session cookie. */
export declare const DEFAULT_COOKIE_ENV = "BILIBILI_SESSDATA";
/** Plugin config; every field is optional with env and constant defaults. */
export interface Config {
    /** API base URL override; defaults to api.bilibili.com. */
    baseUrl?: string;
    /** Literal Cookie header value; prefer cookieEnv so no secret enters config files. */
    cookie?: string;
    /** Environment variable naming the cookie; defaults to BILIBILI_SESSDATA. */
    cookieEnv?: string;
    /** User-Agent header. */
    userAgent?: string;
    /** Per-request timeout (ms). */
    requestTimeoutMs?: number;
    /** Preferred subtitle language tag. */
    subtitleLanguage?: string;
    /** Page-size ceiling for bilibili_search. */
    searchMaxPageSize?: number;
    /** Transcript character cap for bilibili_subtitles. */
    subtitleMaxChars?: number;
    /** Cooperative timeout budget (ms) for each tool. */
    timeoutMs?: number;
}
export declare const Config: z<Config>;
/**
 * Register the Bilibili provider and all three tools. The provider reads
 * the cookie from process.env[cookieEnv]; tool registrations are
 * effect-scoped, so they unregister with the plugin fiber.
 * @param ctx - context whose tools and systemPrompt registries receive the
 *   registrations.
 * @param config - schemastery-defaulted plugin config.
 */
export declare function apply(ctx: Context, config: Config): void;
