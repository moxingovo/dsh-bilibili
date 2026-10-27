/**
 * The model-facing `bilibili_frames` tool: sample a video's real frames and
 * return them as image blocks so an image-capable model can "watch" a video
 * instead of relying on subtitles alone.
 *
 * Two frame sources, tried in order by `auto` mode:
 * - the player API's preview sprite (`preview_pic`): one JPEG carrying a grid
 *   of sampled frames — zero download, zero host dependencies;
 * - the video cover image as a single-frame fallback.
 *
 * `extract` mode downloads the direct mp4 and runs ffmpeg to produce evenly
 * spaced PNG frames; the executable comes from the plugin config `ffmpegPath`,
 * then the BILI_FFMPEG environment variable, then PATH. It is capped by the
 * deployment's per-message image limits.
 *
 * The tool strictly gates on the calling route's declared image input (the
 * same rule as `read_image`) and on the mounted attachments service.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AttachmentId } from '@deepseek-ai/dsh-attachment';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { browserHeaders, BILIBILI_DEFAULT_USER_AGENT } from "./provider.js";
/** Default frame count for `extract` mode. */
export const BILIBILI_FRAMES_DEFAULT_COUNT = 8;
/** Environment variable naming an explicit ffmpeg executable. */
export const DEFAULT_FFMPEG_ENV = 'BILI_FFMPEG';
/**
 * Resolve the ffmpeg executable the `extract` mode runs.
 *
 * A host whose ffmpeg is outside PATH (or whose process environment predates
 * the install) can name it here instead of changing PATH for the whole system.
 * @param options - the frames options from plugin config.
 * @param env - the environment to read (injected for tests).
 * @returns the configured path, else the environment override, else `ffmpeg`.
 */
export function resolveFfmpegCommand(options = {}, env = process.env) {
    const configured = options.ffmpegPath?.trim();
    if (configured !== undefined && configured.length > 0)
        return configured;
    const envName = options.ffmpegEnv ?? DEFAULT_FFMPEG_ENV;
    const fromEnv = env[envName]?.trim();
    if (fromEnv !== undefined && fromEnv.length > 0)
        return fromEnv;
    return 'ffmpeg';
}
/** Upper bound on requested frames; the per-message image cap still applies. */
export const BILIBILI_FRAMES_MAX_COUNT = 12;
/** The modes `bilibili_frames` accepts. */
export const FRAME_MODES = ['auto', 'extract'];
/**
 * Validate `bilibili_frames` arguments: a non-blank bvid, a known mode,
 * and a bounded integer frame count.
 * @param args - the schema-validated tool arguments.
 * @returns the accepted arguments with defaults filled.
 */
export function parseFramesArgs(args) {
    const bvid = args.bvid?.trim() ?? '';
    if (bvid.length === 0)
        throw new Error('bvid must be a non-empty string');
    const mode = args.mode === undefined ? 'auto' : args.mode;
    if (!FRAME_MODES.includes(mode)) {
        throw new Error('mode must be one of ' + FRAME_MODES.join(', '));
    }
    const count = args.count ?? BILIBILI_FRAMES_DEFAULT_COUNT;
    if (!Number.isInteger(count) || count < 1 || count > BILIBILI_FRAMES_MAX_COUNT) {
        throw new Error('count must be an integer between 1 and ' + String(BILIBILI_FRAMES_MAX_COUNT));
    }
    return { bvid, mode: mode, count };
}
/** Map a raw image URL to a declared media type by extension; jpeg fallback. */
function imageMediaTypeOf(url) {
    const lower = url.toLowerCase();
    if (lower.endsWith('.png'))
        return 'image/png';
    if (lower.endsWith('.webp'))
        return 'image/webp';
    if (lower.endsWith('.gif'))
        return 'image/gif';
    return 'image/jpeg';
}
/**
 * Enforce the strict image-capability gate for the calling route. Resolves
 * the session's latest routed provider/model (request header config, then
 * agent options) and requires the exact resolved route to declare `image`
 * input explicitly.
 * @param ctx - the plugin context used to resolve the optional `llm` service.
 * @param exec - the tool-execution context supplying the calling agent.
 */
async function assertImageCapableRoute(ctx, exec) {
    const routed = exec.agent?.session.requestHeader()?.config;
    const provider = routed?.provider ?? exec.agent?.options.provider;
    const model = routed?.model ?? exec.agent?.options.model;
    const llm = ctx.get('llm');
    if (provider === undefined || model === undefined || llm === undefined) {
        throw new Error('bilibili_frames: the current model route could not be resolved');
    }
    const active = await llm.resolveModelInfo(provider, model, exec.signal);
    if (active.inputModalities === undefined || !active.inputModalities.includes('image')) {
        throw new Error('bilibili_frames: model "' + model + '" does not declare image input; switch to an image-capable model or use bilibili_subtitles');
    }
}
/** Run one command to completion; resolves with stdout, rejects on non-zero exit. */
function runCommand(command, args, signal) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, [...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        const abort = () => { child.kill(); };
        signal?.addEventListener('abort', abort, { once: true });
        child.on('error', (error) => { signal?.removeEventListener('abort', abort); reject(error); });
        child.on('close', (code) => {
            signal?.removeEventListener('abort', abort);
            if (code === 0)
                resolve(stdout);
            else
                reject(new Error('command failed (' + String(code) + '): ' + stderr.slice(0, 300)));
        });
    });
}
/**
 * Detect one ffmpeg executable. Only a successful probe is cached: an ffmpeg
 * installed after the first failure is picked up by the next call instead of
 * requiring a process restart.
 */
const ffmpegReady = new Set();
async function hasFfmpeg(command) {
    if (ffmpegReady.has(command))
        return true;
    try {
        await runCommand(command, ['-version']);
        ffmpegReady.add(command);
        return true;
    }
    catch {
        return false;
    }
}
/** Download one URL into a byte buffer (no redirects, no cookie). */
async function downloadBytes(url, signal) {
    const response = await fetch(url, { ...signal === undefined ? {} : { signal }, redirect: 'manual', headers: browserHeaders(BILIBILI_DEFAULT_USER_AGENT) });
    if (!response.ok)
        throw new Error('download failed (HTTP ' + String(response.status) + ')');
    return new Uint8Array(await response.arrayBuffer());
}
/** Extract evenly spaced frames with ffmpeg into the target directory. */
async function extractFrames(ffmpeg, videoPath, outDir, duration, count, signal) {
    const fps = Math.min(count / Math.max(duration, 1), 60);
    const pattern = join(outDir, 'frame-%02d.png');
    await runCommand(ffmpeg, [
        '-y', '-i', videoPath,
        '-vf', "fps=" + fps.toFixed(4) + ",scale='min(512,iw)':-2",
        '-frames:v', String(count),
        pattern,
    ], signal);
    const files = (await readdir(outDir)).filter(name => name.startsWith('frame-')).sort();
    return files.map(name => join(outDir, name));
}
/** Content blocks for one frames outcome: a text envelope plus every image. */
function framesContent(value) {
    const envelope = [
        '<bvid>' + value.meta.bvid + '</bvid>',
        '<title>' + value.meta.title + '</title>',
        '<source>' + value.meta.source + '</source>',
        '<frames>' + String(value.images.length) + '</frames>',
    ].join('\n');
    const blocks = [{ type: 'text', text: envelope }];
    for (const image of value.images) {
        blocks.push({
            type: 'image',
            attachment: {
                attachmentId: AttachmentId(image.attachmentId),
                mediaType: image.mediaType,
                bytes: image.bytes,
                width: image.width,
                height: image.height,
                ...image.name === undefined ? {} : { name: image.name },
            },
        });
    }
    return blocks;
}
/**
 * Register the `bilibili_frames` tool. The composing plugin owns the
 * attachments gate: `src/index.ts` calls this inside
 * `ctx.inject(['attachments'], …)` so the tool exists only while a durable
 * store is mounted. Execution still re-checks the attachments service for
 * direct callers and gates on the calling route's declared image input.
 * @param ctx - the registration scope; execution uses the `attachments` and
 *   `llm` services plus the provider instance.
 * @param service - the provider instance the tool executes against.
 * @param timeoutMs - the cooperative tool-call budget (ms).
 * @param options - ffmpeg resolution options for `extract` mode.
 */
export function applyBilibiliFramesTool(ctx, service, timeoutMs, options = {}) {
    ctx.tools.register(defineTool({
        name: 'bilibili_frames',
        description: 'Sample frames of one bilibili video and return them as images so you can see the actual footage. Requires the current model to accept image input. auto mode uses the preview sprite (recommended); extract mode downloads the video and extracts frames with ffmpeg.',
        parameters: {
            bvid: { type: 'string', required: true, description: 'The video BV id.' },
            mode: { type: 'string', enum: [...FRAME_MODES], description: 'auto (default): preview sprite, falling back to the cover. extract: download + ffmpeg frame extraction (ffmpeg from the ffmpegPath config, BILI_FFMPEG, or PATH).' },
            count: { type: 'number', description: 'Number of frames for extract mode (1-12, default 8).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    images: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            // 0.1.7 的值 schema DSL 不允许对象项自带 `required`(报
                            // "schema.properties.images.items.required is not supported"):
                            // 必填性只能由各属性自己的 `required: true` 表达,下面每个属性都写了。
                            properties: {
                                attachmentId: { type: 'string', required: true },
                                mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], required: true },
                                bytes: { type: 'integer', required: true },
                                width: { type: 'integer', required: true },
                                height: { type: 'integer', required: true },
                                name: { type: 'string' },
                            },
                        },
                    },
                    meta: {
                        type: 'object',
                        additionalProperties: false,
                        required: true,
                        properties: {
                            bvid: { type: 'string', required: true },
                            title: { type: 'string', required: true },
                            source: { type: 'string', enum: ['preview', 'cover', 'extract'], required: true },
                        },
                    },
                },
            },
            render: (_args, value) => framesContent(value),
        },
        // Content-addressed attachment writes are idempotent, so concurrent
        // calls cannot conflict.
        isConcurrencySafe: () => true,
        timeoutMs,
        async execute(args, exec) {
            const input = parseFramesArgs(args);
            await assertImageCapableRoute(ctx, exec);
            const attachments = ctx.get('attachments');
            if (attachments === undefined) {
                throw new Error('bilibili_frames: no attachment service is mounted');
            }
            const detail = await service.video({ bvid: input.bvid }, exec.signal);
            const committed = [];
            let source = 'cover';
            if (input.mode === 'extract') {
                source = 'extract';
                const tmp = await mkdtemp(join(tmpdir(), 'dsh-bili-frames-'));
                try {
                    const ffmpeg = resolveFfmpegCommand(options, process.env);
                    if (!await hasFfmpeg(ffmpeg)) {
                        throw new Error('bilibili_frames: ffmpeg is not available (' + ffmpeg + '); set the plugin config ffmpegPath (or BILI_FFMPEG), use mode=auto (preview sprite), or install ffmpeg');
                    }
                    const play = await service.playurl({ bvid: input.bvid }, exec.signal);
                    const videoPath = join(tmp, 'video.mp4');
                    await writeFile(videoPath, await downloadBytes(play.url, exec.signal));
                    const frames = await extractFrames(ffmpeg, videoPath, tmp, detail.duration, input.count, exec.signal);
                    for (const framePath of frames) {
                        const data = new Uint8Array(await readFile(framePath));
                        const ref = await attachments.saveImage({ data, mediaType: 'image/png', name: input.bvid + '-' + framePath.split(/[\\/]/).pop() });
                        committed.push(ref);
                        if (committed.length >= attachments.imageLimits.maxImagesPerMessage)
                            break;
                    }
                }
                finally {
                    await rm(tmp, { recursive: true, force: true });
                }
                if (committed.length === 0)
                    throw new Error('bilibili_frames: frame extraction produced no images');
            }
            else {
                const info = await service.playerInfo({ bvid: input.bvid, cid: detail.cid }, exec.signal);
                const candidate = info.previewPic ?? detail.coverUrl;
                source = info.previewPic === undefined ? 'cover' : 'preview';
                const mediaType = imageMediaTypeOf(candidate);
                if (!attachments.imageLimits.mediaTypes.includes(mediaType)) {
                    throw new Error('bilibili_frames: image type ' + mediaType + ' is not accepted by this deployment');
                }
                const data = await service.fetchBytes(candidate, exec.signal);
                const ref = await attachments.saveImage({ data, mediaType, name: input.bvid + '-preview' });
                committed.push(ref);
            }
            const value = {
                images: committed.map(ref => ({
                    attachmentId: String(ref.attachmentId),
                    mediaType: ref.mediaType,
                    bytes: ref.bytes,
                    width: ref.width,
                    height: ref.height,
                    ...ref.name === undefined ? {} : { name: ref.name },
                })),
                meta: { bvid: input.bvid, title: detail.title, source },
            };
            if (exec.parent !== undefined) {
                exec.deferContext(createUserMessage({
                    content: framesContent(value),
                    source: { kind: 'bilibili-frames' },
                }));
            }
            return value;
        },
        // Pure display: a generic card titled by the video id.
        presentCall(args) {
            return { card: 'generic', title: 'bilibili_frames ' + args.bvid, kind: 'read' };
        },
        presentResult(_args, _result) {
            return undefined;
        },
    }));
}
//# sourceMappingURL=frames.js.map