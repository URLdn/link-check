export { resolveConfig, ConfigSchema, DEFAULT_FILE_PATTERNS, DEFAULT_IGNORE_PATTERNS } from './config.js';
export type { Config } from './config.js';

export { runScan, findFiles } from './scanner.js';
export type { ScanReport, ScanSummary, ScannedLinkResult, LinkOccurrence, ScanEvents } from './scanner.js';

export { checkUrl } from './checker.js';
export type { CheckResult, CheckOptions, LinkStatus } from './checker.js';

export { extractLinksFromMarkdown } from './markdown.js';
export type { ExtractedLink } from './markdown.js';

export { toJsonReport, toMarkdownReport, writeJsonReport, writeMarkdownReport } from './report.js';
export type { JsonReport } from './report.js';

export { printConsoleReport, printVerboseLine } from './formatter.js';
