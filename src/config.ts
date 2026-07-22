import { z } from 'zod';

/**
 * Zod schema describing the runtime configuration for a scan.
 * Used to validate options coming from the CLI, the GitHub Action
 * inputs, or programmatic API consumers.
 */
export const ConfigSchema = z.object({
  /** Glob path(s) or directory to scan for Markdown/MDX files. */
  path: z.string().min(1),
  /** Glob patterns (or plain substrings) of files/URLs to ignore. */
  ignore: z.array(z.string()).default([]),
  /** Maximum URL length before it is flagged as "too long". */
  maxUrlLength: z.number().int().positive().default(80),
  /** Per-request timeout, in milliseconds. */
  timeout: z.number().int().positive().default(10_000),
  /** Number of concurrent HTTP requests. */
  concurrency: z.number().int().positive().default(8),
  /** Exit with a non-zero code when broken links are found. */
  failOnBroken: z.boolean().default(true),
  /** Exit with a non-zero code when redirects are found. */
  failOnRedirect: z.boolean().default(false),
  /** Exit with a non-zero code when insecure http:// links are found. */
  failOnHttp: z.boolean().default(false),
  /** Emit a JSON report to stdout instead of the human-readable report. */
  json: z.boolean().default(false),
  /** Emit a Markdown report to stdout. */
  markdown: z.boolean().default(false),
  /** Write the JSON report to this file path, if provided. */
  output: z.string().optional(),
  /** Verbose logging of every URL as it is checked. */
  verbose: z.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Convenience factory that fills in defaults and validates partial input. */
export function resolveConfig(input: Partial<Config> & { path: string }): Config {
  return ConfigSchema.parse(input);
}

export const DEFAULT_FILE_PATTERNS = ['**/*.md', '**/*.mdx', '**/*.markdown'];

export const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
];
