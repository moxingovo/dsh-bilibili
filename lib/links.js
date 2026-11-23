/**
 * Accept the link shapes Bilibili actually shares: a bare BV id, a full
 * watch URL, an app share text, or a b23.tv short link (the Bilibili mobile
 * app's default share form). Short links are expanded with a single manual
 * redirect so no external page is fetched beyond the Location header.
 */
import { BilibiliError } from "./types.js";
/** The canonical BV shape. */
const BV_PATTERN = /BV[0-9A-Za-z]{10}/;
/** The b23.tv short-link shape. */
const B23_PATTERN = /https?:\/\/b23\.tv\/([0-9A-Za-z]+)/i;
/** The default browser UA used for the redirect probe. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/**
 * Extract a BV id from arbitrary share text.
 * @param text - raw tool input (BV, URL, share caption).
 * @returns the BV id when one appears verbatim.
 */
export function extractBvid(text) {
    return BV_PATTERN.exec(text)?.[0];
}
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
export async function resolveBvidInput(input, signal) {
    const trimmed = input.trim();
    const direct = extractBvid(trimmed);
    if (direct !== undefined)
        return direct;
    const short = B23_PATTERN.exec(trimmed) ?? /(?:^|\s)b23\.tv\/([0-9A-Za-z]+)/i.exec(trimmed);
    if (short === null || short[1] === undefined) {
        throw new BilibiliError('bvid must be a BV id or a b23.tv / bilibili.com video link', 'BILIBILI_BAD_REQUEST');
    }
    const code = short[1];
    let url = 'https://b23.tv/' + code;
    for (let hop = 0; hop < 3; hop++) {
        let response;
        try {
            response = await fetch(url, { ...signal === undefined ? {} : { signal }, redirect: 'manual', headers: { 'user-agent': UA } });
        }
        catch (cause) {
            if (signal?.aborted === true)
                throw cause;
            throw new BilibiliError('b23.tv link could not be resolved: ' + String(cause), 'BILIBILI_REQUEST_FAILED', { cause });
        }
        const location = response.headers.get('location');
        if (location === null)
            break;
        const found = extractBvid(location);
        if (found !== undefined)
            return found;
        url = new URL(location, url).toString();
    }
    throw new BilibiliError('b23.tv link did not resolve to a bilibili video', 'BILIBILI_BAD_REQUEST');
}
//# sourceMappingURL=links.js.map