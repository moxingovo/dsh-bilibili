/**
 * dsh-bilibili: one DeepSeek Harness plugin that registers the Bilibili
 * capability (bilibili_search / bilibili_video / bilibili_subtitles /
 * bilibili_playurl / bilibili_frames) with its official API provider.
 * Anonymous by default with risk-control bootstrapping; an optional SESSDATA
 * from the environment unlocks login-gated subtitles and higher-quality
 * streams. bilibili_frames returns real video frames as images for
 * image-capable models.
 *
 * The plugin also carries the assistant's own character — 「璃璃」 (Lili) — as
 * one ordered system-prompt section, enabled by default and switchable with
 * `personaEnabled`. See `persona.ts` for the card and `PERSONA.md` for prose.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { BilibiliOfficialProvider, BILIBILI_DEFAULT_BASE_URL, BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS, BILIBILI_DEFAULT_SUBTITLE_LANGUAGE, BILIBILI_DEFAULT_USER_AGENT, BILIBILI_PROVIDER_ID, BILIBILI_SEARCH_MAX_PAGE_SIZE, BILIBILI_WBI_KEY_TTL_MS, BILIBILI_COOKIE_BOOTSTRAP_URL, mapSearchData, mapVideoData, subtitleTracks, selectSubtitleTrack, parseSubtitleCues } from './provider.ts';
export type { BilibiliOfficialProviderOptions } from './provider.ts';
export { BilibiliError } from './types.ts';
export type { BilibiliProviderLike, BilibiliSearchOrder, BilibiliSearchRequest, BilibiliSearchResult, BilibiliSubtitleCue, BilibiliSubtitleTrack, BilibiliSubtitlesResult, BilibiliVideoDetail, BilibiliVideoPage, BilibiliVideoSummary, } from './types.ts';
export { BILIBILI_SEARCH_DEFAULT_PAGE_SIZE, BILIBILI_SUBTITLES_MAX_CHARS, BVID_PATTERN, PLAYURL_QUALITIES, applyBilibiliSearchTool, applyBilibiliVideoTool, applyBilibiliSubtitleTool, applyBilibiliPlayUrlTool, boundTranscript, formatPlayUrlOutput, formatSearchOutput, formatSubtitleOutput, formatVideoOutput, parsePlayUrlArgs, parseSearchArgs, parseSubtitleArgs, parseVideoArgs, presentSearchCall, presentSearchResult, presentSubtitleCall, presentSubtitleResult, presentVideoCall, presentVideoResult, subtitleOutput, } from './tools.ts';
export type { BilibiliPlayUrlArgs, BilibiliSearchArgs, BilibiliSubtitleOutput } from './tools.ts';
export { MIXIN_KEY_ENC_TAB, mixinKey, wbiSign } from './wbi.ts';
export { BILIBILI_FRAMES_DEFAULT_COUNT, BILIBILI_FRAMES_MAX_COUNT, FRAME_MODES, applyBilibiliFramesTool, parseFramesArgs, } from './frames.ts';
export type { BilibiliFrameImage, BilibiliFrameMode, BilibiliFramesArgs, BilibiliFramesValue } from './frames.ts';
export { LILI_PERSONA_NAME, LILI_PERSONA_SECTION_NAME, LILI_PERSONA_SECTION_ORDER, applyLiliPersona, liliPersona } from './persona.ts';
export type { LiliPersonaOptions } from './persona.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "dsh-plugin-bilibili";
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
    /** Register the bundled 璃璃 persona section (default true). */
    personaEnabled?: boolean;
    /** Self-reference used inside the persona text (default 璃璃). */
    personaName?: string;
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
