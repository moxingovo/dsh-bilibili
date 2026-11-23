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
import { defineTool } from '@deepseek-ai/dsh-tools';
import { resolveBvidInput } from "./links.js";
/** Default number of danmaku lines one call returns. */
export const BILIBILI_DANMAKU_DEFAULT_LIMIT = 500;
/** Upper bound on danmaku lines one call returns. */
export const BILIBILI_DANMAKU_MAX_LIMIT = 3000;
/** Character cap on one danmaku listing. */
export const BILIBILI_DANMAKU_MAX_CHARS = 60_000;
/** Character cap on one comment listing. */
export const BILIBILI_COMMENTS_MAX_CHARS = 40_000;
/** The danmaku modes the tool can filter by. */
export const DANMAKU_MODES = [1, 4, 5];
/**
 * Validate danmaku arguments; every numeric bound is enforced here because
 * the schema DSL only checks types.
 * @param args - schema-validated tool arguments.
 * @returns the accepted arguments with defaults filled.
 */
export function parseDanmakuArgs(args) {
    const bvid = args.bvid?.trim() ?? '';
    if (bvid.length === 0)
        throw new Error('bvid must be a non-empty string');
    const offset = args.offset ?? 0;
    if (!Number.isInteger(offset) || offset < 0)
        throw new Error('offset must be a non-negative integer');
    const limit = args.limit ?? BILIBILI_DANMAKU_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > BILIBILI_DANMAKU_MAX_LIMIT) {
        throw new Error('limit must be an integer between 1 and ' + String(BILIBILI_DANMAKU_MAX_LIMIT));
    }
    const timeFrom = args.timeFrom;
    const timeTo = args.timeTo;
    if (timeFrom !== undefined && (!Number.isFinite(timeFrom) || timeFrom < 0))
        throw new Error('timeFrom must be a non-negative number');
    if (timeTo !== undefined && (!Number.isFinite(timeTo) || timeTo < 0))
        throw new Error('timeTo must be a non-negative number');
    if (timeFrom !== undefined && timeTo !== undefined && timeTo < timeFrom)
        throw new Error('timeTo must be >= timeFrom');
    const mode = args.mode;
    if (mode !== undefined && !DANMAKU_MODES.includes(mode)) {
        throw new Error('mode must be one of ' + DANMAKU_MODES.join(', '));
    }
    const keyword = args.keyword?.trim();
    return {
        bvid,
        ...args.cid === undefined ? {} : { cid: args.cid },
        offset,
        limit,
        ...timeFrom === undefined ? {} : { timeFrom },
        ...timeTo === undefined ? {} : { timeTo },
        ...keyword === undefined || keyword.length === 0 ? {} : { keyword },
        ...mode === undefined ? {} : { mode },
    };
}
/** Format seconds as mm:ss (hours fold into minutes). */
function clock(seconds) {
    const whole = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(whole / 60);
    return String(minutes).padStart(2, '0') + ':' + String(whole % 60).padStart(2, '0');
}
/** The mode marker shown next to a danmaku line. */
function modeMarker(mode) {
    if (mode === 5)
        return '(top) ';
    if (mode === 4)
        return '(bottom) ';
    return '';
}
/** Count the most repeated danmaku texts (>= 2 occurrences). */
function topRepeated(entries, limit) {
    const counts = new Map();
    for (const entry of entries)
        counts.set(entry.text, (counts.get(entry.text) ?? 0) + 1);
    return [...counts.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([text, count]) => ({ text, count }));
}
/**
 * Select and render the danmaku window while keeping the character cap.
 * @param entries - every parsed entry, time ordered.
 * @param args - validated arguments.
 * @param title - the video title for the header.
 * @returns the bounded value.
 */
export function danmakuValue(entries, args, title) {
    const matched = entries.filter(entry => {
        if (args.mode !== undefined && entry.mode !== args.mode)
            return false;
        if (args.timeFrom !== undefined && entry.time < args.timeFrom)
            return false;
        if (args.timeTo !== undefined && entry.time > args.timeTo)
            return false;
        if (args.keyword !== undefined && !entry.text.includes(args.keyword))
            return false;
        return true;
    });
    const window = matched.slice(args.offset, args.offset + args.limit);
    const stats = topRepeated(entries, 12);
    const byMode = new Map();
    for (const entry of entries)
        byMode.set(entry.mode, (byMode.get(entry.mode) ?? 0) + 1);
    const header = [
        'Danmaku for ' + args.bvid + (title.length > 0 ? ' — ' + title : ''),
        'total ' + String(entries.length) + ', matched ' + String(matched.length) +
            ', showing ' + String(window.length) + ' from offset ' + String(args.offset),
        'modes: ' + [...byMode.entries()].sort((a, b) => b[1] - a[1]).map(([mode, count]) => 'm' + String(mode) + '×' + String(count)).join(', '),
    ];
    if (stats.length > 0) {
        header.push('most repeated: ' + stats.map(item => '"' + item.text + '"×' + String(item.count)).join(', '));
    }
    const lines = [];
    let used = header.join('\n').length;
    for (const entry of window) {
        const line = '[' + clock(entry.time) + '] ' + modeMarker(entry.mode) + entry.text;
        if (used + line.length + 1 > BILIBILI_DANMAKU_MAX_CHARS)
            break;
        used += line.length + 1;
        lines.push(line);
    }
    const hasMore = args.offset + window.length < matched.length;
    const truncated = window.length > 0 && lines.length < window.length;
    const footer = hasMore
        ? 'More lines follow: call again with offset ' + String(args.offset + window.length) + '.'
        : 'This is the last page of matched danmaku.';
    return {
        bvid: args.bvid,
        cid: 0,
        total: entries.length,
        matched: matched.length,
        offset: args.offset,
        limit: args.limit,
        hasMore,
        truncated,
        text: [...header, '', ...lines, '', footer].join('\n'),
    };
}
/**
 * Validate comment arguments.
 * @param args - schema-validated tool arguments.
 * @returns the accepted arguments with defaults filled.
 */
export function parseCommentsArgs(args) {
    const bvid = args.bvid?.trim() ?? '';
    if (bvid.length === 0)
        throw new Error('bvid must be a non-empty string');
    const mode = args.mode === undefined ? 'hot' : args.mode;
    if (mode !== 'hot' && mode !== 'time')
        throw new Error('mode must be hot or time');
    const page = args.page ?? 1;
    if (!Number.isInteger(page) || page < 1)
        throw new Error('page must be a positive integer');
    const repliesLimit = args.repliesLimit ?? 3;
    if (!Number.isInteger(repliesLimit) || repliesLimit < 0 || repliesLimit > 20) {
        throw new Error('repliesLimit must be an integer between 0 and 20');
    }
    const root = args.root?.trim();
    const offset = args.offset?.trim();
    return {
        bvid,
        mode: mode,
        ...offset === undefined || offset.length === 0 ? {} : { offset },
        ...root === undefined || root.length === 0 ? {} : { root },
        page,
        includeReplies: args.includeReplies === true,
        repliesLimit,
    };
}
/** Format one epoch-second instant as YYYY-MM-DD HH:mm. */
function stamp(epochSeconds) {
    if (!Number.isFinite(epochSeconds) || epochSeconds <= 0)
        return 'unknown';
    const date = new Date(epochSeconds * 1000);
    const pad = (value) => String(value).padStart(2, '0');
    return String(date.getFullYear()) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
        ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}
/** Render the replies of one comment, bounded by the caller's budget. */
function replyLines(replies, limit, budget) {
    const lines = [];
    let used = 0;
    for (const reply of replies.slice(0, limit)) {
        const line = '    ↳ ' + reply.author + ': ' + reply.content + ' (♥' + String(reply.like) + ', ' + stamp(reply.createdAt) + ')';
        if (used + line.length > budget)
            break;
        used += line.length;
        lines.push(line);
    }
    return lines;
}
/**
 * Render one comments page (or one reply page) as bounded text.
 * @param items - comments of this page.
 * @param args - validated arguments.
 * @param total - total top-level comments.
 * @param end - whether this is the last page.
 * @param nextOffset - cursor for the next page.
 * @returns the bounded value.
 */
export function commentsValue(items, args, total, end, nextOffset) {
    const header = [
        'Comments for ' + args.bvid + ' (sort ' + args.mode + '): total ' + String(total) + ', showing ' + String(items.length),
    ];
    const lines = [];
    let used = header.join('\n').length;
    let truncated = false;
    items.forEach((item, index) => {
        // 带上 rpid: 只有拿到它才能用 root 参数展开楼中楼。
        const head = '#' + String(index + 1) + ' ' + item.author + ' (♥' + String(item.like) + ', ' + stamp(item.createdAt) +
            ', replies ' + String(item.replyCount) + ', rpid ' + item.rpid + ')';
        const body = item.content;
        if (used + head.length + body.length + 2 > BILIBILI_COMMENTS_MAX_CHARS) {
            truncated = true;
            return;
        }
        used += head.length + body.length + 2;
        lines.push(head, body);
        if (args.includeReplies && item.replies.length > 0) {
            const replies = replyLines(item.replies, args.repliesLimit, BILIBILI_COMMENTS_MAX_CHARS - used);
            used += replies.join('\n').length;
            lines.push(...replies);
        }
    });
    const footer = end
        ? 'This is the last page of comments.'
        : 'More comments follow: call again with offset "' + String(nextOffset ?? '') + '".';
    return { text: [...header, '', ...lines, '', footer].join('\n'), truncated };
}
/** Register the bilibili_danmaku tool. */
export function applyBilibiliDanmakuTool(ctx, service, timeoutMs) {
    ctx.tools.register(defineTool({
        name: 'bilibili_danmaku',
        description: 'Read the full danmaku (bullet comments) of one bilibili video page. Returns every line of the page as time-ordered text, with total/matched counts and the most repeated lines; use offset/limit to page through large videos, and timeFrom/timeTo/keyword/mode to filter. Read-only.',
        parameters: {
            bvid: { type: 'string', required: true, description: 'The video bvid (e.g. BV1GJ411x7h7).' },
            cid: { type: 'number', description: 'Explicit page cid (multi-part videos). Defaults to the first page.' },
            offset: { type: 'number', description: '0-based start index into the matched lines. Defaults to 0.' },
            limit: { type: 'number', description: 'Lines per call (1-3000, default 500).' },
            timeFrom: { type: 'number', description: 'Only lines at or after this second.' },
            timeTo: { type: 'number', description: 'Only lines at or before this second.' },
            keyword: { type: 'string', description: 'Only lines containing this substring.' },
            mode: { type: 'number', enum: [1, 4, 5], description: '1 scroll, 4 bottom-fixed, 5 top-fixed.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    bvid: { type: 'string', required: true },
                    cid: { type: 'number', required: true },
                    total: { type: 'number', required: true },
                    matched: { type: 'number', required: true },
                    offset: { type: 'number', required: true },
                    limit: { type: 'number', required: true },
                    hasMore: { type: 'boolean', required: true },
                    truncated: { type: 'boolean', required: true },
                    text: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: value.text }],
        },
        timeoutMs,
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const input = parseDanmakuArgs({ ...args, bvid: await resolveBvidInput(args.bvid, exec.signal) });
            const result = await service.danmaku({ bvid: input.bvid, ...input.cid === undefined ? {} : { cid: input.cid } }, exec.signal);
            const value = danmakuValue(result.entries, input, result.title);
            return { ...value, cid: result.cid };
        },
        presentCall(args) {
            return { card: 'generic', title: 'bilibili_danmaku ' + (args.bvid ?? ''), kind: 'read' };
        },
        presentResult(_args, _result) {
            return undefined;
        },
    }));
}
/** Register the bilibili_comments tool. */
export function applyBilibiliCommentsTool(ctx, service, timeoutMs) {
    ctx.tools.register(defineTool({
        name: 'bilibili_comments',
        description: 'Read the comment area of one bilibili video. Without root: returns one page of top-level comments (sort hot/time) with like counts and reply counts; pass the returned offset to walk every page. With root (a comment rpid): returns the replies of that comment, page by page. Read-only.',
        parameters: {
            bvid: { type: 'string', required: true, description: 'The video bvid (e.g. BV1GJ411x7h7).' },
            mode: { type: 'string', enum: ['hot', 'time'], description: 'hot (default) or time.' },
            offset: { type: 'string', description: 'Opaque cursor from the previous call; omit for the first page.' },
            root: { type: 'string', description: 'A top-level comment rpid; switches to its reply list.' },
            page: { type: 'number', description: 'Reply page when root is set (default 1).' },
            includeReplies: { type: 'boolean', description: 'Append the preview replies of each comment (up to repliesLimit).' },
            repliesLimit: { type: 'number', description: 'Preview replies per comment (0-20, default 3).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    bvid: { type: 'string', required: true },
                    kind: { type: 'string', enum: ['comments', 'replies'], required: true },
                    total: { type: 'number', required: true },
                    shown: { type: 'number', required: true },
                    isEnd: { type: 'boolean', required: true },
                    nextOffset: { type: 'string' },
                    truncated: { type: 'boolean', required: true },
                    text: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: value.text }],
        },
        timeoutMs,
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const input = parseCommentsArgs({ ...args, bvid: await resolveBvidInput(args.bvid, exec.signal) });
            if (input.root !== undefined) {
                const page = await service.commentReplies({
                    bvid: input.bvid,
                    root: input.root,
                    page: input.page,
                    pageSize: 20,
                }, exec.signal);
                const text = [
                    'Replies under comment ' + input.root + ': total ' + String(page.total) + ', page ' + String(page.page) +
                        ', showing ' + String(page.items.length),
                    '',
                    ...page.items.map(item => '↳ ' + item.author + ' (♥' + String(item.like) + ', ' + stamp(item.createdAt) + '): ' + item.content),
                    '',
                    page.hasMore ? 'More replies follow: call again with page ' + String(page.page + 1) + '.' : 'This is the last page of replies.',
                ].join('\n');
                return {
                    bvid: input.bvid,
                    kind: 'replies',
                    total: page.total,
                    shown: page.items.length,
                    isEnd: !page.hasMore,
                    truncated: false,
                    text: text.slice(0, BILIBILI_COMMENTS_MAX_CHARS),
                };
            }
            const result = await service.comments({
                bvid: input.bvid,
                mode: input.mode,
                ...input.offset === undefined ? {} : { offset: input.offset },
            }, exec.signal);
            const rendered = commentsValue(result.items, input, result.total, result.isEnd, result.nextOffset);
            return {
                bvid: input.bvid,
                kind: 'comments',
                total: result.total,
                shown: result.items.length,
                isEnd: result.isEnd,
                ...result.nextOffset === undefined ? {} : { nextOffset: result.nextOffset },
                truncated: rendered.truncated,
                text: rendered.text,
            };
        },
        presentCall(args) {
            return { card: 'generic', title: 'bilibili_comments ' + (args.bvid ?? ''), kind: 'read' };
        },
        presentResult(_args, _result) {
            return undefined;
        },
    }));
}
//# sourceMappingURL=social.js.map