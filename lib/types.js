/**
 * Vocabulary for the dsh-bilibili plugin: video search, video metadata,
 * and subtitle transcript retrieval over the public bilibili web APIs.
 */
/**
 * Typed Bilibili error with a machine-routable, open-string code and
 * chained cause. Codes cover redirect refusal, risk control, missing
 * videos, login-gated data, unavailable subtitles, and malformed responses.
 */
export class BilibiliError extends Error {
    /** Machine-routable error code. */
    code;
    /** The bilibili business code (code envelope field) when one applied. */
    bilibiliCode;
    constructor(message, code, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'BilibiliError';
        this.code = code;
        if (options.bilibiliCode !== undefined)
            this.bilibiliCode = options.bilibiliCode;
    }
}
//# sourceMappingURL=types.js.map