/**
 * The model-facing bilibili_search, bilibili_video, and bilibili_subtitles
 * tools, executing against the plugin provider instance. This module owns
 * the schemas, argument validation, the page-size bound, the transcript
 * cap, result formatting, and presentation only.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenericCallView, ToolResult } from '@deepseek-ai/dsh-tools';
import type { BilibiliProviderLike, BilibiliSearchOrder, BilibiliSearchResult, BilibiliSubtitlesResult, BilibiliVideoDetail } from './types.ts';
/** Default page size for one bilibili_search call. */
export declare const BILIBILI_SEARCH_DEFAULT_PAGE_SIZE = 10;
/** Validated bilibili_search arguments. */
export interface BilibiliSearchArgs {
    keyword: string;
    page: number;
    pageSize: number;
    order?: BilibiliSearchOrder;
}
/**
 * Validate value constraints the schema DSL cannot express: a non-blank
 * keyword, positive bounded page numbers, and a known sort order.
 * @param args - the schema-validated bilibili_search arguments.
 * @param maxPageSize - the deployment page-size ceiling.
 * @returns the accepted arguments with defaults filled.
 */
export declare function parseSearchArgs(args: {
    keyword: string;
    page?: number;
    pageSize?: number;
    order?: string;
}, maxPageSize: number): BilibiliSearchArgs;
/**
 * Format one search result page as the model-facing text block.
 * @param result - the provider search outcome.
 * @returns a video list with counts, page position, and cite instructions.
 */
export declare function formatSearchOutput(result: BilibiliSearchResult): string;
/**
 * Pending-call presentation: a generic card titled by the query.
 * @param args - the raw tool arguments; only keyword feeds the view.
 * @returns the generic card view shown while the call runs.
 */
export declare function presentSearchCall(args: {
    keyword: string;
}): GenericCallView;
/**
 * Completed-call presentation: the generic card fallback carries the text.
 * @param _args - unused; the raw tool arguments.
 * @param _result - unused; the final tool result.
 * @returns always undefined, selecting the generic fallback.
 */
export declare function presentSearchResult(_args: unknown, _result: ToolResult): undefined;
/**
 * Register the bilibili_search tool. The disposer is fiber-scoped.
 * @param ctx - context whose tools registry receives the registration.
 * @param service - the provider instance the tool executes against.
 * @param maxPageSize - the deployment page-size ceiling.
 * @param timeoutMs - the cooperative tool-call budget (ms).
 */
export declare function applyBilibiliSearchTool(ctx: Context, service: BilibiliProviderLike, maxPageSize: number, timeoutMs: number): void;
/** The accepted bvid shape (BV + 10 alphanumerics). */
export declare const BVID_PATTERN: RegExp;
/**
 * Validate the bvid against the canonical BV format.
 * @param args - the schema-validated bilibili_video arguments.
 * @returns the accepted bvid.
 */
export declare function parseVideoArgs(args: {
    bvid: string;
}): {
    bvid: string;
};
/**
 * Format one video detail as the model-facing text block.
 * @param detail - the provider metadata outcome.
 * @returns title, uploader, counts, links, description, and part list.
 */
export declare function formatVideoOutput(detail: BilibiliVideoDetail): string;
/**
 * Pending-call presentation: a generic card titled by the bvid.
 * @param args - the raw tool arguments; only bvid feeds the view.
 * @returns the generic card view shown while the call runs.
 */
export declare function presentVideoCall(args: {
    bvid: string;
}): GenericCallView;
/**
 * Completed-call presentation: the generic card fallback carries the text.
 * @param _args - unused; the raw tool arguments.
 * @param _result - unused; the final tool result.
 * @returns always undefined, selecting the generic fallback.
 */
export declare function presentVideoResult(_args: unknown, _result: ToolResult): undefined;
/**
 * Register the bilibili_video tool. The disposer is fiber-scoped.
 * @param ctx - context whose tools registry receives the registration.
 * @param service - the provider instance the tool executes against.
 * @param timeoutMs - the cooperative tool-call budget (ms).
 */
export declare function applyBilibiliVideoTool(ctx: Context, service: BilibiliProviderLike, timeoutMs: number): void;
/** Default cap on the transcript characters one call returns. */
export declare const BILIBILI_SUBTITLES_MAX_CHARS = 80000;
/** The bounded subtitles output value. */
export interface BilibiliSubtitleOutput {
    bvid: string;
    cid: number;
    language: string;
    trackCount: number;
    cueCount: number;
    truncated: boolean;
    transcript: string;
}
/**
 * Validate the bvid and optional language preference.
 * @param args - the schema-validated bilibili_subtitles arguments.
 * @returns the accepted inputs.
 */
export declare function parseSubtitleArgs(args: {
    bvid: string;
    language?: string;
}): {
    bvid: string;
    language?: string;
};
/**
 * Bound the transcript at the value level, marking any cut.
 * @param transcript - the merged cue text.
 * @param maxChars - the inclusive character cap.
 * @returns the kept prefix and whether it was cut.
 */
export declare function boundTranscript(transcript: string, maxChars: number): {
    transcript: string;
    truncated: boolean;
};
/**
 * Project one provider result into the bounded output value.
 * @param result - the provider subtitles outcome.
 * @param maxChars - the transcript character cap.
 * @returns the bounded output value.
 */
export declare function subtitleOutput(result: BilibiliSubtitlesResult, maxChars: number): BilibiliSubtitleOutput;
/**
 * Format the bounded output as the model-facing text block.
 * @param output - the bounded output value.
 * @returns a header plus the transcript, with a truncation notice.
 */
export declare function formatSubtitleOutput(output: BilibiliSubtitleOutput): string;
/**
 * Pending-call presentation: a generic card titled by the bvid.
 * @param args - the raw tool arguments; only bvid feeds the view.
 * @returns the generic card view shown while the call runs.
 */
export declare function presentSubtitleCall(args: {
    bvid: string;
}): GenericCallView;
/**
 * Completed-call presentation: the generic card fallback carries the text.
 * @param _args - unused; the raw tool arguments.
 * @param _result - unused; the final tool result.
 * @returns always undefined, selecting the generic fallback.
 */
export declare function presentSubtitleResult(_args: unknown, _result: ToolResult): undefined;
/**
 * Register the bilibili_subtitles tool. The disposer is fiber-scoped.
 * @param ctx - context whose tools registry receives the registration.
 * @param service - the provider instance the tool executes against.
 * @param maxChars - the transcript character cap.
 * @param timeoutMs - the cooperative tool-call budget (ms).
 */
export declare function applyBilibiliSubtitleTool(ctx: Context, service: BilibiliProviderLike, maxChars: number, timeoutMs: number): void;
