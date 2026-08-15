/**
 * Bilibili WBI request signing: the mixin-key fold plus the sorted-query
 * md5 signature the player endpoints require. Pure functions only.
 */
/** The fixed 64-entry permutation bilibili applies to derive the mixin key. */
export declare const MIXIN_KEY_ENC_TAB: readonly number[];
/**
 * Fold a 64-character key material string through the fixed permutation
 * table into the 32-character mixin key.
 * @param orig - the concatenated img key and sub key.
 * @returns the first 32 permuted characters.
 */
export declare function mixinKey(orig: string): string;
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
export declare function wbiSign(params: Readonly<Record<string, string | number>>, imgKey: string, subKey: string, nowSec?: number): Record<string, string>;
