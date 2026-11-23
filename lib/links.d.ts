/**
 * Accept the link shapes Bilibili actually shares: a bare BV id, a full
 * watch URL, an app share text, or a b23.tv short link (the Bilibili mobile
 * app's default share form). Short links are expanded with a single manual
 * redirect so no external page is fetched beyond the Location header.
 */
/**
 * Extract a BV id from arbitrary share text.
 * @param text - raw tool input (BV, URL, share caption).
 * @returns the BV id when one appears verbatim.
 */
export declare function extractBvid(text: string): string | undefined;
/**
 * Resolve any accepted video reference to a BV id.
 *
 * Accepted: `BV...`, `https://www.bilibili.com/video/BV...`, share text
 * containing either, `https://b23.tv/<code>`, or a bare `b23.tv/<code>`.
 * @param input - the raw tool argument.
 * @param signal - caller cancellation for the short-link probe.
 * @returns the canonical BV id.
 * @throws BilibiliError BILIBILI_BAD_REQUEST when nothing resolves.
 */
export declare function resolveBvidInput(input: string, signal?: AbortSignal): Promise<string>;
