import { z } from 'zod';

/**
 * Zod schema describing the runtime configuration for a scan.
 * Used to validate options coming from the CLI, the GitHub Action
 * inputs, or programmatic API consumers.
 */
declare const ConfigSchema: z.ZodObject<{
    /** Glob path(s) or directory to scan for Markdown/MDX files. */
    path: z.ZodString;
    /** Glob patterns (or plain substrings) of files/URLs to ignore. */
    ignore: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Maximum URL length before it is flagged as "too long". */
    maxUrlLength: z.ZodDefault<z.ZodNumber>;
    /** Per-request timeout, in milliseconds. */
    timeout: z.ZodDefault<z.ZodNumber>;
    /** Number of concurrent HTTP requests. */
    concurrency: z.ZodDefault<z.ZodNumber>;
    /** Exit with a non-zero code when broken links are found. */
    failOnBroken: z.ZodDefault<z.ZodBoolean>;
    /** Exit with a non-zero code when redirects are found. */
    failOnRedirect: z.ZodDefault<z.ZodBoolean>;
    /** Exit with a non-zero code when insecure http:// links are found. */
    failOnHttp: z.ZodDefault<z.ZodBoolean>;
    /** Emit a JSON report to stdout instead of the human-readable report. */
    json: z.ZodDefault<z.ZodBoolean>;
    /** Emit a Markdown report to stdout. */
    markdown: z.ZodDefault<z.ZodBoolean>;
    /** Write the JSON report to this file path, if provided. */
    output: z.ZodOptional<z.ZodString>;
    /** Verbose logging of every URL as it is checked. */
    verbose: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path: string;
    ignore: string[];
    maxUrlLength: number;
    timeout: number;
    concurrency: number;
    failOnBroken: boolean;
    failOnRedirect: boolean;
    failOnHttp: boolean;
    json: boolean;
    markdown: boolean;
    verbose: boolean;
    output?: string | undefined;
}, {
    path: string;
    ignore?: string[] | undefined;
    maxUrlLength?: number | undefined;
    timeout?: number | undefined;
    concurrency?: number | undefined;
    failOnBroken?: boolean | undefined;
    failOnRedirect?: boolean | undefined;
    failOnHttp?: boolean | undefined;
    json?: boolean | undefined;
    markdown?: boolean | undefined;
    output?: string | undefined;
    verbose?: boolean | undefined;
}>;
type Config = z.infer<typeof ConfigSchema>;
/** Convenience factory that fills in defaults and validates partial input. */
declare function resolveConfig(input: Partial<Config> & {
    path: string;
}): Config;
declare const DEFAULT_FILE_PATTERNS: string[];
declare const DEFAULT_IGNORE_PATTERNS: string[];

interface ExtractedLink {
    /** The raw URL as it appears in the source. */
    url: string;
    /** 1-based line number where the link occurs. */
    line: number;
    /** 1-based column number where the link occurs. */
    column: number;
    /** The link text/label, when available (e.g. `[label](url)`). */
    label?: string;
}
/**
 * Extracts every HTTP(S) URL referenced in a Markdown or MDX document,
 * including standard inline links `[text](url)`, images `![alt](url)`,
 * autolinks `<url>`, reference-style definitions, and bare URLs typed
 * directly into the prose. URLs inside fenced code blocks are skipped.
 */
declare function extractLinksFromMarkdown(content: string): ExtractedLink[];

type LinkStatus = 'ok' | 'redirect' | 'broken' | 'timeout' | 'malformed' | 'insecure-http';
interface CheckOptions {
    timeout: number;
    /** Optional override, mainly for tests, to substitute the HTTP client. */
    requestFn?: typeof performRequest;
}
interface CheckResult {
    url: string;
    status: LinkStatus;
    statusCode?: number;
    redirectChain: string[];
    finalUrl?: string;
    error?: string;
    isHttp: boolean;
    durationMs: number;
}
/**
 * Checks a single URL and classifies the result. HTTP is always attempted
 * with `HEAD` first, falling back to `GET` for servers that reject HEAD
 * requests (405/501), which is common enough to warrant a retry rather
 * than a false "broken" report.
 */
declare function checkUrl(url: string, options: CheckOptions): Promise<CheckResult>;
interface RawRequestResult {
    statusCode: number;
    redirectChain: string[];
    finalUrl: string;
}
/**
 * Performs the actual network request, tracking every hop of a redirect
 * chain. Extracted as a standalone function so tests can inject a fake
 * implementation via `CheckOptions.requestFn`.
 */
declare function performRequest(url: string, timeout: number): Promise<RawRequestResult>;

interface LinkOccurrence extends ExtractedLink {
    file: string;
}
interface ScannedLinkResult extends CheckResult {
    occurrences: LinkOccurrence[];
    isDuplicate: boolean;
    isTooLong: boolean;
}
interface ScanSummary {
    filesScanned: number;
    totalLinks: number;
    uniqueLinks: number;
    ok: number;
    redirects: number;
    broken: number;
    timeouts: number;
    malformed: number;
    insecureHttp: number;
    tooLong: number;
    durationMs: number;
}
interface ScanReport {
    config: Config;
    summary: ScanSummary;
    results: ScannedLinkResult[];
    files: string[];
}
interface ScanEvents {
    onFileFound?: (files: string[]) => void;
    onLinkChecked?: (result: ScannedLinkResult, index: number, total: number) => void;
    /**
     * Overrides the function used to check each URL. Primarily useful in
     * tests, to avoid making real network requests.
     */
    checkUrlFn?: (url: string, timeout: number) => Promise<CheckResult>;
}
/** Discovers every Markdown/MDX file matching the configured path. */
declare function findFiles(config: Config): Promise<string[]>;
/**
 * Runs a full scan: discovers files, extracts every link, deduplicates
 * URLs (while retaining every occurrence for reporting), checks each
 * unique URL with bounded concurrency, and returns an aggregated report.
 */
declare function runScan(config: Config, events?: ScanEvents): Promise<ScanReport>;

interface JsonReport {
    generatedAt: string;
    summary: ScanReport['summary'];
    files: string[];
    links: Array<{
        url: string;
        status: ScannedLinkResult['status'];
        statusCode?: number;
        redirectChain: string[];
        finalUrl?: string;
        error?: string;
        isHttp: boolean;
        isDuplicate: boolean;
        isTooLong: boolean;
        durationMs: number;
        occurrences: Array<{
            file: string;
            line: number;
            column: number;
        }>;
    }>;
}
/** Converts a scan report into a plain, JSON-serializable object. */
declare function toJsonReport(report: ScanReport): JsonReport;
/** Writes the JSON report to disk at `outputPath`. */
declare function writeJsonReport(report: ScanReport, outputPath: string): Promise<void>;
/**
 * Renders a Markdown report suitable for a PR comment, a GitHub Step
 * Summary, or a saved `report.md` file.
 */
declare function toMarkdownReport(report: ScanReport): string;
/** Writes the Markdown report to disk at `outputPath`. */
declare function writeMarkdownReport(report: ScanReport, outputPath: string): Promise<void>;

/** Prints a single line for a checked link while a scan is in progress (verbose mode). */
declare function printVerboseLine(result: ScannedLinkResult): void;
/** Prints the full human-readable console report after a scan completes. */
declare function printConsoleReport(report: ScanReport): void;

export { type CheckOptions, type CheckResult, type Config, ConfigSchema, DEFAULT_FILE_PATTERNS, DEFAULT_IGNORE_PATTERNS, type ExtractedLink, type JsonReport, type LinkOccurrence, type LinkStatus, type ScanEvents, type ScanReport, type ScanSummary, type ScannedLinkResult, checkUrl, extractLinksFromMarkdown, findFiles, printConsoleReport, printVerboseLine, resolveConfig, runScan, toJsonReport, toMarkdownReport, writeJsonReport, writeMarkdownReport };
