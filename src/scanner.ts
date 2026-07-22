import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import type { Config } from './config.js';
import { DEFAULT_FILE_PATTERNS, DEFAULT_IGNORE_PATTERNS } from './config.js';
import { extractLinksFromMarkdown, type ExtractedLink } from './markdown.js';
import { checkUrl, type CheckResult } from './checker.js';
import { runWithConcurrency, matchesIgnorePattern } from './utils.js';

export interface LinkOccurrence extends ExtractedLink {
  file: string;
}

export interface ScannedLinkResult extends CheckResult {
  occurrences: LinkOccurrence[];
  isDuplicate: boolean;
  isTooLong: boolean;
}

export interface ScanSummary {
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

export interface ScanReport {
  config: Config;
  summary: ScanSummary;
  results: ScannedLinkResult[];
  files: string[];
}

export interface ScanEvents {
  onFileFound?: (files: string[]) => void;
  onLinkChecked?: (result: ScannedLinkResult, index: number, total: number) => void;
  /**
   * Overrides the function used to check each URL. Primarily useful in
   * tests, to avoid making real network requests.
   */
  checkUrlFn?: (url: string, timeout: number) => Promise<CheckResult>;
}

/** Discovers every Markdown/MDX file matching the configured path. */
export async function findFiles(config: Config): Promise<string[]> {
  const patterns = DEFAULT_FILE_PATTERNS.map((pattern) => joinPath(config.path, pattern));
  const ignore = [...DEFAULT_IGNORE_PATTERNS, ...config.ignore];

  const directMatches = await glob(config.path, { nodir: true, ignore });
  const nested = await glob(patterns, { nodir: true, ignore });

  const isMarkdownFile = (file: string): boolean => /\.(md|mdx|markdown)$/i.test(file);

  const combined = [...directMatches.filter(isMarkdownFile), ...nested];
  return Array.from(new Set(combined)).sort();
}

function joinPath(base: string, pattern: string): string {
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}/${pattern}`;
}

/**
 * Runs a full scan: discovers files, extracts every link, deduplicates
 * URLs (while retaining every occurrence for reporting), checks each
 * unique URL with bounded concurrency, and returns an aggregated report.
 */
export async function runScan(config: Config, events: ScanEvents = {}): Promise<ScanReport> {
  const started = Date.now();
  const files = await findFiles(config);
  events.onFileFound?.(files);

  const occurrencesByUrl = new Map<string, LinkOccurrence[]>();

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const links = extractLinksFromMarkdown(content);
    for (const link of links) {
      if (matchesIgnorePattern(link.url, config.ignore)) continue;
      const existing = occurrencesByUrl.get(link.url) ?? [];
      existing.push({ ...link, file });
      occurrencesByUrl.set(link.url, existing);
    }
  }

  const uniqueUrls = Array.from(occurrencesByUrl.keys());
  let checkedCount = 0;
  const check = events.checkUrlFn ?? ((url: string, timeout: number) => checkUrl(url, { timeout }));

  const results = await runWithConcurrency(uniqueUrls, config.concurrency, async (url) => {
    const checkResult = await check(url, config.timeout);
    const occurrences = occurrencesByUrl.get(url) ?? [];
    const scanned: ScannedLinkResult = {
      ...checkResult,
      occurrences,
      isDuplicate: occurrences.length > 1,
      isTooLong: url.length > config.maxUrlLength,
    };
    checkedCount += 1;
    events.onLinkChecked?.(scanned, checkedCount, uniqueUrls.length);
    return scanned;
  });

  const summary = summarize(results, files.length, started);

  return { config, summary, results, files };
}

function summarize(results: ScannedLinkResult[], filesScanned: number, started: number): ScanSummary {
  const summary: ScanSummary = {
    filesScanned,
    totalLinks: results.reduce((total, r) => total + r.occurrences.length, 0),
    uniqueLinks: results.length,
    ok: 0,
    redirects: 0,
    broken: 0,
    timeouts: 0,
    malformed: 0,
    insecureHttp: 0,
    tooLong: 0,
    durationMs: Date.now() - started,
  };

  for (const result of results) {
    if (result.status === 'ok') summary.ok += 1;
    if (result.status === 'redirect') summary.redirects += 1;
    if (result.status === 'broken') summary.broken += 1;
    if (result.status === 'timeout') summary.timeouts += 1;
    if (result.status === 'malformed') summary.malformed += 1;
    if (result.isHttp) summary.insecureHttp += 1;
    if (result.isTooLong) summary.tooLong += 1;
  }

  return summary;
}
