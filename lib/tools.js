/**
 * The model-facing bilibili_search, bilibili_video, and bilibili_subtitles
 * tools, executing against the plugin provider instance. This module owns
 * the schemas, argument validation, the page-size bound, the transcript
 * cap, result formatting, and presentation only.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
/** Default page size for one bilibili_search call. */
export const BILIBILI_SEARCH_DEFAULT_PAGE_SIZE = 10;
/** The sort orders bilibili_search accepts. */
const SEARCH_ORDERS = ['totalrank', 'click', 'pubdate', 'dm'];
/**
 * Validate value constraints the schema DSL cannot express: a non-blank
 * keyword, positive bounded page numbers, and a known sort order.
 * @param args - the schema-validated bilibili_search arguments.
 * @param maxPageSize - the deployment page-size ceiling.
 * @returns the accepted arguments with defaults filled.
 */
export function parseSearchArgs(args, maxPageSize) {
    if (args.keyword.trim().length === 0)
        throw new Error('keyword must be a non-empty string');
    const page = args.page ?? 1;
    const pageSize = args.pageSize ?? BILIBILI_SEARCH_DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(page) || page < 1)
        throw new Error('page must be a positive integer');
    if (!Number.isInteger(pageSize) || pageSize < 1)
        throw new Error('pageSize must be a positive integer');
    if (pageSize > maxPageSize)
        throw new Error('pageSize exceeds the maximum of ' + String(maxPageSize));
    const order = args.order === undefined
        ? undefined
        : SEARCH_ORDERS.includes(args.order) ? args.order : undefined;
    if (args.order !== undefined && order === undefined)
        throw new Error('order must be one of ' + SEARCH_ORDERS.join(', '));
    return { keyword: args.keyword.trim(), page, pageSize, ...order === undefined ? {} : { order } };
}
/**
 * Format one search result page as the model-facing text block.
 * @param result - the provider search outcome.
 * @returns a video list with counts, page position, and cite instructions.
 */
export function formatSearchOutput(result) {
    if (result.items.length === 0) {
        return 'No videos found for this query on bilibili.';
    }
    const lines = result.items.map((item) => {
        const meta = [];
        if (item.author.length > 0)
            meta.push('UP: ' + item.author);
        meta.push('play: ' + String(item.play));
        if (item.duration.length > 0)
            meta.push('duration: ' + item.duration);
        if (item.publishAt.length > 0)
            meta.push('published: ' + item.publishAt.slice(0, 10));
        return '- [' + item.title + '](' + item.url + ') — ' + meta.join(', ');
    });
    const header = 'Found ' + String(result.total) + ' videos (page ' + String(result.page) + ', ' + String(result.items.length) + ' shown)';
    const footer = result.hasMore ? 'More pages follow: pass page: ' + String(result.page + 1) + ' to continue.' : 'This is the last page.';
    return [header, lines.join('\n'), footer].join('\n\n');
}
/**
 * Pending-call presentation: a generic card titled by the query.
 * @param args - the raw tool arguments; only keyword feeds the view.
 * @returns the generic card view shown while the call runs.
 */
export function presentSearchCall(args) {
    return { card: 'generic', title: args.keyword, kind: 'search', rawInput: args.keyword };
}
/**
 * Completed-call presentation: the generic card fallback carries the text.
 * @param _args - unused; the raw tool arguments.
 * @param _result - unused; the final tool result.
 * @returns always undefined, selecting the generic fallback.
 */
export function presentSearchResult(_args, _result) {
    return undefined;
}
/**
 * Register the bilibili_search tool. The disposer is fiber-scoped.
 * @param ctx - context whose tools registry receives the registration.
 * @param service - the provider instance the tool executes against.
 * @param maxPageSize - the deployment page-size ceiling.
 * @param timeoutMs - the cooperative tool-call budget (ms).
 */
export function applyBilibiliSearchTool(ctx, service, maxPageSize, timeoutMs) {
    ctx.tools.register(defineTool({
        name: 'bilibili_search',
        description: 'Search bilibili.com for videos by keyword. Returns matching videos with bvid, title, uploader, play count, duration, and publish date. Use bilibili_video for full metadata and bilibili_subtitles for the transcript of a specific result.',
        parameters: {
            keyword: { type: 'string', required: true, description: 'The search keyword.' },
            page: { type: 'number', description: '1-based result page. Defaults to 1.' },
            pageSize: { type: 'number', description: 'Results per page. Defaults to 10.' },
            order: { type: 'string', enum: [...SEARCH_ORDERS], description: 'Sort order: totalrank (default), click, pubdate, dm.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    items: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                bvid: { type: 'string', required: true },
                                aid: { type: 'number', required: true },
                                title: { type: 'string', required: true },
                                description: { type: 'string', required: true },
                                author: { type: 'string', required: true },
                                authorMid: { type: 'number', required: true },
                                play: { type: 'number', required: true },
                                danmaku: { type: 'number', required: true },
                                favorite: { type: 'number', required: true },
                                comment: { type: 'number', required: true },
                                duration: { type: 'string', required: true },
                                publishAt: { type: 'string', required: true },
                                coverUrl: { type: 'string', required: true },
                                url: { type: 'string', required: true },
                            },
                        },
                    },
                    page: { type: 'number', required: true },
                    pageSize: { type: 'number', required: true },
                    total: { type: 'number', required: true },
                    hasMore: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: formatSearchOutput(value) }],
        },
        timeoutMs,
        // Provider reads do not mutate parent-agent state.
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const input = parseSearchArgs(args, maxPageSize);
            const result = await service.search(input, exec.signal);
            return { ...result, items: [...result.items] };
        },
        presentCall: presentSearchCall,
        presentResult: presentSearchResult,
    }));
}
/** The accepted bvid shape (BV + 10 alphanumerics). */
export const BVID_PATTERN = new RegExp('^BV[0-9A-Za-z]{10}$');
/**
 * Validate the bvid against the canonical BV format.
 * @param args - the schema-validated bilibili_video arguments.
 * @returns the accepted bvid.
 */
export function parseVideoArgs(args) {
    const bvid = args.bvid.trim();
    if (bvid.length === 0)
        throw new Error('bvid must be a non-empty string');
    if (!BVID_PATTERN.test(bvid))
        throw new Error('bvid must look like BV followed by 10 letters or digits (e.g. BV1GJ411x7h7)');
    return { bvid };
}
/**
 * Format one video detail as the model-facing text block.
 * @param detail - the provider metadata outcome.
 * @returns title, uploader, counts, links, description, and part list.
 */
export function formatVideoOutput(detail) {
    const lines = [
        'Title: ' + detail.title,
        'Author: ' + detail.author + ' (mid ' + String(detail.authorMid) + ')',
        'URL: ' + detail.url,
        'Published: ' + (detail.publishAt.length > 0 ? detail.publishAt.slice(0, 10) : 'unknown'),
        'Duration: ' + String(detail.duration) + 's',
        'Play: ' + String(detail.play) + ' | Danmaku: ' + String(detail.danmaku) + ' | Like: ' + String(detail.like) +
            ' | Coin: ' + String(detail.coin) + ' | Favorite: ' + String(detail.favorite) + ' | Comment: ' + String(detail.comment) + ' | Share: ' + String(detail.share),
    ];
    if (detail.typeName.length > 0)
        lines.push('Partition: ' + detail.typeName);
    if (detail.pages.length > 0) {
        const pageText = (page) => '#' + String(page.page) + ' ' + page.part + ' (cid ' + String(page.cid) + ', ' + String(page.duration) + 's)';
        lines.push('Parts: ' + detail.pages.map(pageText).join('; '));
    }
    if (detail.description.length > 0)
        lines.push('Description:\n' + detail.description);
    return lines.join('\n');
}
/**
 * Pending-call presentation: a generic card titled by the bvid.
 * @param args - the raw tool arguments; only bvid feeds the view.
 * @returns the generic card view shown while the call runs.
 */
export function presentVideoCall(args) {
    return { card: 'generic', title: args.bvid, kind: 'search', rawInput: args.bvid };
}
/**
 * Completed-call presentation: the generic card fallback carries the text.
 * @param _args - unused; the raw tool arguments.
 * @param _result - unused; the final tool result.
 * @returns always undefined, selecting the generic fallback.
 */
export function presentVideoResult(_args, _result) {
    return undefined;
}
/**
 * Register the bilibili_video tool. The disposer is fiber-scoped.
 * @param ctx - context whose tools registry receives the registration.
 * @param service - the provider instance the tool executes against.
 * @param timeoutMs - the cooperative tool-call budget (ms).
 */
export function applyBilibiliVideoTool(ctx, service, timeoutMs) {
    ctx.tools.register(defineTool({
        name: 'bilibili_video',
        description: 'Fetch full metadata for one bilibili video by bvid: title, uploader, counts, publish date, description, and multi-part pages.',
        parameters: {
            bvid: { type: 'string', required: true, description: 'The video bvid (e.g. BV1GJ411x7h7).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    bvid: { type: 'string', required: true },
                    aid: { type: 'number', required: true },
                    cid: { type: 'number', required: true },
                    title: { type: 'string', required: true },
                    description: { type: 'string', required: true },
                    author: { type: 'string', required: true },
                    authorMid: { type: 'number', required: true },
                    play: { type: 'number', required: true },
                    danmaku: { type: 'number', required: true },
                    comment: { type: 'number', required: true },
                    favorite: { type: 'number', required: true },
                    coin: { type: 'number', required: true },
                    share: { type: 'number', required: true },
                    like: { type: 'number', required: true },
                    duration: { type: 'number', required: true },
                    publishAt: { type: 'string', required: true },
                    coverUrl: { type: 'string', required: true },
                    url: { type: 'string', required: true },
                    typeName: { type: 'string', required: true },
                    pages: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                cid: { type: 'number', required: true },
                                page: { type: 'number', required: true },
                                part: { type: 'string', required: true },
                                duration: { type: 'number', required: true },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => [{ type: 'text', text: formatVideoOutput(value) }],
        },
        timeoutMs,
        // Provider reads do not mutate parent-agent state.
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const input = parseVideoArgs(args);
            const detail = await service.video(input, exec.signal);
            return { ...detail, pages: [...detail.pages] };
        },
        presentCall: presentVideoCall,
        presentResult: presentVideoResult,
    }));
}
/** Default cap on the transcript characters one call returns. */
export const BILIBILI_SUBTITLES_MAX_CHARS = 80_000;
/**
 * Validate the bvid and optional language preference.
 * @param args - the schema-validated bilibili_subtitles arguments.
 * @returns the accepted inputs.
 */
export function parseSubtitleArgs(args) {
    const bvid = args.bvid.trim();
    if (bvid.length === 0)
        throw new Error('bvid must be a non-empty string');
    if (!BVID_PATTERN.test(bvid))
        throw new Error('bvid must look like BV followed by 10 letters or digits (e.g. BV1GJ411x7h7)');
    const language = args.language === undefined ? undefined : args.language.trim();
    if (language !== undefined && language.length === 0)
        throw new Error('language must be a non-empty string');
    return { bvid, ...language === undefined ? {} : { language } };
}
/**
 * Bound the transcript at the value level, marking any cut.
 * @param transcript - the merged cue text.
 * @param maxChars - the inclusive character cap.
 * @returns the kept prefix and whether it was cut.
 */
export function boundTranscript(transcript, maxChars) {
    if (transcript.length <= maxChars)
        return { transcript, truncated: false };
    return { transcript: transcript.slice(0, maxChars), truncated: true };
}
/**
 * Project one provider result into the bounded output value.
 * @param result - the provider subtitles outcome.
 * @param maxChars - the transcript character cap.
 * @returns the bounded output value.
 */
export function subtitleOutput(result, maxChars) {
    const bounded = boundTranscript(result.transcript, maxChars);
    return {
        bvid: result.bvid,
        cid: result.cid,
        language: result.language,
        trackCount: result.trackCount,
        cueCount: result.cues.length,
        truncated: bounded.truncated,
        transcript: bounded.transcript,
    };
}
/**
 * Format the bounded output as the model-facing text block.
 * @param output - the bounded output value.
 * @returns a header plus the transcript, with a truncation notice.
 */
export function formatSubtitleOutput(output) {
    const header = 'Subtitle transcript for ' + output.bvid + ' (language ' + output.language + ', ' + String(output.cueCount) + ' cues)';
    const notice = output.truncated ? '\n\n(Transcript truncated. Re-request is not available; cite the video URL instead.)' : '';
    return header + '\n\n' + output.transcript + notice;
}
/**
 * Pending-call presentation: a generic card titled by the bvid.
 * @param args - the raw tool arguments; only bvid feeds the view.
 * @returns the generic card view shown while the call runs.
 */
export function presentSubtitleCall(args) {
    return { card: 'generic', title: args.bvid, kind: 'search', rawInput: args.bvid };
}
/**
 * Completed-call presentation: the generic card fallback carries the text.
 * @param _args - unused; the raw tool arguments.
 * @param _result - unused; the final tool result.
 * @returns always undefined, selecting the generic fallback.
 */
export function presentSubtitleResult(_args, _result) {
    return undefined;
}
/**
 * Register the bilibili_subtitles tool. The disposer is fiber-scoped.
 * @param ctx - context whose tools registry receives the registration.
 * @param service - the provider instance the tool executes against.
 * @param maxChars - the transcript character cap.
 * @param timeoutMs - the cooperative tool-call budget (ms).
 */
export function applyBilibiliSubtitleTool(ctx, service, maxChars, timeoutMs) {
    ctx.tools.register(defineTool({
        name: 'bilibili_subtitles',
        description: 'Fetch one bilibili video\'s subtitle transcript by bvid. Returns the merged cue text (language, cue count, and truncation flag included). Videos without an accessible track fail with a structured error.',
        parameters: {
            bvid: { type: 'string', required: true, description: 'The video bvid (e.g. BV1GJ411x7h7).' },
            language: { type: 'string', description: 'Preferred subtitle language tag (e.g. zh-CN). Exact match wins; otherwise the first track.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    bvid: { type: 'string', required: true },
                    cid: { type: 'number', required: true },
                    language: { type: 'string', required: true },
                    trackCount: { type: 'number', required: true },
                    cueCount: { type: 'number', required: true },
                    truncated: { type: 'boolean', required: true },
                    transcript: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: formatSubtitleOutput(value) }],
        },
        timeoutMs,
        // Provider reads do not mutate parent-agent state.
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const input = parseSubtitleArgs(args);
            const result = await service.subtitles(input, exec.signal);
            return subtitleOutput(result, maxChars);
        },
        presentCall: presentSubtitleCall,
        presentResult: presentSubtitleResult,
    }));
}
//# sourceMappingURL=tools.js.map