/**
 * dsh-literature-reader — host half type declarations.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = 'literature-reader';
export declare const inject: string[];
export interface Config {
    provider: string;
    model: string;
    maxChars: number;
    maxTokensExplain: number;
    maxTokensTranslate: number;
    temperature: number;
    explainSystem: string;
    translateSystem: string;
}
export declare const Config: z<Config>;
/**
 * Plugin body: mount the `/lit` channel and answer `ask` (one-shot explain /
 * translate) and `models` (provider/model directory for the settings UI).
 * @param ctx - host plugin context.
 * @param config - resolved plugin config.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map
