/**
 * The character this plugin carries: 「璃璃」 (Lili), the assistant's own
 * persona. The plugin registers this text as one ordered system-prompt
 * section, so every scope that mounts the plugin talks like her — warm,
 * playful, and still accurate about code, commands, and document prose.
 *
 * The persona is deliberately a *runtime* artifact: the text below is the
 * single source of truth that tests pin and that deployments may rename.
 * `PERSONA.md` is the human-readable character card, not a second copy of
 * this contract.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Section name registered with the system prompt for the persona. */
export declare const LILI_PERSONA_SECTION_NAME = "plugin:persona-lili";
/**
 * Sort order: right after the deployment persona prefix (order 0) and before
 * first-party tool guidance (order 1000+), so tool rules still win on conflicts.
 */
export declare const LILI_PERSONA_SECTION_ORDER = 1;
/** Default name the persona calls herself. */
export declare const LILI_PERSONA_NAME = "\u7483\u7483";
/** Options accepted by {@link applyLiliPersona}. */
export interface LiliPersonaOptions {
    /** Whether to register the section at all. */
    enabled: boolean;
    /** Self-reference inside the persona text. */
    name: string;
}
/**
 * Build the persona text for one deployment name.
 * @param name - the persona's self-reference; blank values are not accepted.
 * @returns the model-facing character card.
 */
export declare function liliPersona(name?: string): string;
/**
 * Register the persona section on the calling context's scope. Registration is
 * effect-scoped, so it disposes with the plugin fiber; duplicate registration in
 * one layer would throw, which is why the section name is fixed.
 * @param ctx - context whose systemPrompt registry receives the section.
 * @param options - enable flag and the persona's self-reference.
 */
export declare function applyLiliPersona(ctx: Context, options: LiliPersonaOptions): void;
