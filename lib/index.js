/**
 * dsh-bilibili: one DeepSeek Harness plugin that registers the Bilibili
 * capability (bilibili_search / bilibili_video / bilibili_subtitles) with
 * its official API provider. Anonymous by default with risk-control
 * bootstrapping; an optional SESSDATA from the environment unlocks
 * login-gated subtitles.
 */
import z from '@deepseek-ai/schemastery';
import { BilibiliOfficialProvider, BILIBILI_DEFAULT_BASE_URL, BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS, BILIBILI_DEFAULT_SUBTITLE_LANGUAGE, BILIBILI_DEFAULT_USER_AGENT } from "./provider.js";
import { applyBilibiliSearchTool, applyBilibiliVideoTool, applyBilibiliSubtitleTool, BILIBILI_SUBTITLES_MAX_CHARS } from "./tools.js";
export { BilibiliOfficialProvider, BILIBILI_DEFAULT_BASE_URL, BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS, BILIBILI_DEFAULT_SUBTITLE_LANGUAGE, BILIBILI_DEFAULT_USER_AGENT, BILIBILI_PROVIDER_ID, BILIBILI_SEARCH_MAX_PAGE_SIZE, BILIBILI_WBI_KEY_TTL_MS, BILIBILI_COOKIE_BOOTSTRAP_URL, mapSearchData, mapVideoData, subtitleTracks, selectSubtitleTrack, parseSubtitleCues } from "./provider.js";
export { BilibiliError } from "./types.js";
export { BILIBILI_SEARCH_DEFAULT_PAGE_SIZE, BILIBILI_SUBTITLES_MAX_CHARS, BVID_PATTERN, applyBilibiliSearchTool, applyBilibiliVideoTool, applyBilibiliSubtitleTool, boundTranscript, formatSearchOutput, formatSubtitleOutput, formatVideoOutput, parseSearchArgs, parseSubtitleArgs, parseVideoArgs, presentSearchCall, presentSearchResult, presentSubtitleCall, presentSubtitleResult, presentVideoCall, presentVideoResult, subtitleOutput, } from "./tools.js";
export { MIXIN_KEY_ENC_TAB, mixinKey, wbiSign } from "./wbi.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-plugin-bilibili';
/** Services required before the plugin starts. */
export const inject = ['tools', 'systemPrompt'];
/** Default cooperative tool-call timeout budget (ms). */
export const DEFAULT_BILIBILI_TOOL_TIMEOUT_MS = 30_000;
/** Environment variable naming the optional Bilibili session cookie. */
export const DEFAULT_COOKIE_ENV = 'BILIBILI_SESSDATA';
export const Config = z.object({
    baseUrl: z.string(),
    cookie: z.string().role('secret'),
    cookieEnv: z.string().default(DEFAULT_COOKIE_ENV),
    userAgent: z.string(),
    requestTimeoutMs: z.number().min(1).default(BILIBILI_DEFAULT_REQUEST_TIMEOUT_MS),
    subtitleLanguage: z.string().default(BILIBILI_DEFAULT_SUBTITLE_LANGUAGE),
    searchMaxPageSize: z.number().step(1).min(1).default(20),
    subtitleMaxChars: z.number().step(1).min(1).default(BILIBILI_SUBTITLES_MAX_CHARS),
    timeoutMs: z.number().step(1).min(1).default(DEFAULT_BILIBILI_TOOL_TIMEOUT_MS),
});
/** A non-blank string reading of an optional config value. */
function configured(value) {
    return value !== undefined && value.length > 0 ? value : undefined;
}
/** The model-facing guidance registered with the system prompt. */
const GUIDANCE = "Use bilibili_search to find videos on bilibili.com by keyword; follow up with bilibili_video for one result's full metadata and bilibili_subtitles for its subtitle transcript. Cite the video URL as a markdown link when you use its content.";
/**
 * Register the Bilibili provider and all three tools. The provider reads
 * the cookie from process.env[cookieEnv]; tool registrations are
 * effect-scoped, so they unregister with the plugin fiber.
 * @param ctx - context whose tools and systemPrompt registries receive the
 *   registrations.
 * @param config - schemastery-defaulted plugin config.
 */
export function apply(ctx, config) {
    const resolved = config;
    const baseUrl = configured(resolved.baseUrl);
    if (baseUrl !== undefined) {
        try {
            const parsed = new URL(baseUrl);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
                throw new Error('scheme must be http or https');
        }
        catch (cause) {
            throw new Error('dsh-bilibili: baseUrl must be a valid http(s) URL: ' + String(cause));
        }
    }
    const literalCookie = configured(resolved.cookie);
    const cookieEnvName = resolved.cookieEnv;
    const cookieValue = literalCookie ?? process.env[cookieEnvName] ?? undefined;
    const provider = new BilibiliOfficialProvider({
        baseUrl: baseUrl ?? BILIBILI_DEFAULT_BASE_URL,
        ...cookieValue === undefined ? {} : { cookie: cookieValue },
        userAgent: configured(resolved.userAgent) ?? BILIBILI_DEFAULT_USER_AGENT,
        requestTimeoutMs: resolved.requestTimeoutMs,
        subtitleLanguage: configured(resolved.subtitleLanguage) ?? BILIBILI_DEFAULT_SUBTITLE_LANGUAGE,
    });
    ctx.systemPrompt.section({
        name: 'tool:bilibili',
        order: 111,
        text: GUIDANCE,
    });
    applyBilibiliSearchTool(ctx, provider, resolved.searchMaxPageSize, resolved.timeoutMs);
    applyBilibiliVideoTool(ctx, provider, resolved.timeoutMs);
    applyBilibiliSubtitleTool(ctx, provider, resolved.subtitleMaxChars, resolved.timeoutMs);
}
//# sourceMappingURL=index.js.map