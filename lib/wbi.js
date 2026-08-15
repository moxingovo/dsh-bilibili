/**
 * Bilibili WBI request signing: the mixin-key fold plus the sorted-query
 * md5 signature the player endpoints require. Pure functions only.
 */
import { createHash } from 'node:crypto';
/** The fixed 64-entry permutation bilibili applies to derive the mixin key. */
export const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];
/** Characters stripped from parameter values before signing. */
const WBI_FILTER_CHARS = /[!'()*]/g;
/** Required mixin-key source length (img key + sub key, 32 chars each). */
const MIXIN_KEY_SOURCE_LENGTH = 64;
/**
 * Fold a 64-character key material string through the fixed permutation
 * table into the 32-character mixin key.
 * @param orig - the concatenated img key and sub key.
 * @returns the first 32 permuted characters.
 */
export function mixinKey(orig) {
    if (orig.length < MIXIN_KEY_SOURCE_LENGTH)
        throw new Error('wbi: key material must be at least 64 characters');
    let result = '';
    for (const index of MIXIN_KEY_ENC_TAB)
        result += String(orig[index]);
    return result.slice(0, 32);
}
/**
 * Sign one parameter record for a WBI-signed endpoint: adds the wts
 * timestamp, sorts keys, percent-encodes values (filtering the reserved
 * characters), and appends the md5 w_rid over query plus mixin key.
 * @param params - the plain request parameters.
 * @param imgKey - the nav API wbi img key filename stem.
 * @param subKey - the nav API wbi sub key filename stem.
 * @param nowSec - unix seconds for wts (injected for deterministic tests).
 * @returns the string-valued signed parameter record including w_rid.
 */
export function wbiSign(params, imgKey, subKey, nowSec = Math.floor(Date.now() / 1000)) {
    const withWts = { ...params, wts: nowSec };
    const query = Object.keys(withWts)
        .sort()
        .map(key => key + '=' + encodeURIComponent(String(withWts[key]).replace(WBI_FILTER_CHARS, '')))
        .join('&');
    const wRid = createHash('md5').update(query + mixinKey(imgKey + subKey)).digest('hex');
    const signed = { w_rid: wRid };
    for (const [key, value] of Object.entries(withWts))
        signed[key] = String(value);
    return signed;
}
//# sourceMappingURL=wbi.js.map