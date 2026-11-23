/**
 * The model-facing `bilibili_danmaku` and `bilibili_comments` tools.
 *
 * Both read the complete dataset in pages instead of a pre-capped sample:
 * - danmaku: the XML list endpoint carries every line of one video page;
 * - comments: the WBI-signed cursor endpoint walks all top-level comments,
 *   and `root` expands one comment's replies.
 * Tool results are text-first: a compact stat header plus the requested
 * window, bounded by a character cap, so a 50k-danmaku video still fits.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { BilibiliComment, BilibiliDanmakuEntry, BilibiliProviderLike } from './types.ts';
/** Default number of danmaku lines one call returns. */
export declare const BILIBILI_DANMAKU_DEFAULT_LIMIT = 500;
/** Upper bound on danmaku lines one call returns. */
export declare const BILIBILI_DANMAKU_MAX_LIMIT = 3000;
/** Character cap on one danmaku listing. */
export declare const BILIBILI_DANMAKU_MAX_CHARS = 60000;
/** Character cap on one comment listing. */
export declare const BILIBILI_COMMENTS_MAX_CHARS = 40000;
/** The danmaku modes the tool can filter by. */
export declare const DANMAKU_MODES: readonly [1, 4, 5];
/** Validated danmaku arguments. */
export interface BilibiliDanmakuArgs {
    bvid: string;
    cid?: number;
    offset: number;
    limit: number;
    timeFrom?: number;
    timeTo?: number;
    keyword?: string;
    mode?: number;
}
/** The danmaku tool output value. */
export interface BilibiliDanmakuValue {
    bvid: string;
    cid: number;
    total: number;
    matched: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    truncated: boolean;
    text: string;
}
/**
 * Validate danmaku arguments; every numeric bound is enforced here because
 * the schema DSL only checks types.
 * @param args - schema-validated tool arguments.
 * @returns the accepted arguments with defaults filled.
 */
export declare function parseDanmakuArgs(args: {
    bvid?: string;
    cid?: number;
    offset?: number;
    limit?: number;
    timeFrom?: number;
    timeTo?: number;
    keyword?: string;
    mode?: number;
}): BilibiliDanmakuArgs;
/**
 * Select and render the danmaku window while keeping the character cap.
 * @param entries - every parsed entry, time ordered.
 * @param args - validated arguments.
 * @param title - the video title for the header.
 * @returns the bounded value.
 */
export declare function danmakuValue(entries: readonly BilibiliDanmakuEntry[], args: BilibiliDanmakuArgs, title: string): BilibiliDanmakuValue;
/** Validated comment arguments. */
export interface BilibiliCommentsArgs {
    bvid: string;
    mode: 'hot' | 'time';
    offset?: string;
    root?: string;
    page: number;
    includeReplies: boolean;
    repliesLimit: number;
}
/**
 * Validate comment arguments.
 * @param args - schema-validated tool arguments.
 * @returns the accepted arguments with defaults filled.
 */
export declare function parseCommentsArgs(args: {
    bvid?: string;
    mode?: string;
    offset?: string;
    root?: string;
    page?: number;
    includeReplies?: boolean;
    repliesLimit?: number;
}): BilibiliCommentsArgs;
/**
 * Render one comments page (or one reply page) as bounded text.
 * @param items - comments of this page.
 * @param args - validated arguments.
 * @param total - total top-level comments.
 * @param end - whether this is the last page.
 * @param nextOffset - cursor for the next page.
 * @returns the bounded value.
 */
export declare function commentsValue(items: readonly BilibiliComment[], args: BilibiliCommentsArgs, total: number, end: boolean, nextOffset?: string): {
    text: string;
    truncated: boolean;
};
/** Register the bilibili_danmaku tool. */
export declare function applyBilibiliDanmakuTool(ctx: Context, service: BilibiliProviderLike, timeoutMs: number): void;
/** Register the bilibili_comments tool. */
export declare function applyBilibiliCommentsTool(ctx: Context, service: BilibiliProviderLike, timeoutMs: number): void;
