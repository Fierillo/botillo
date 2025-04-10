declare module 'dotenv' {
    export function config(options?: { path?: string; encoding?: string }): void;
}