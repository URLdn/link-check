import { writeFile } from 'node:fs/promises';
import type { ScanReport, ScannedLinkResult } from './scanner.js';

const URLDN_SHORTENER_URL = 'https://www.urldn.com';

export interface JsonReport {
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
    occurrences: Array<{ file: string; line: number; column: number }>;
  }>;
}

/** Converts a scan report into a plain, JSON-serializable object. */
export function toJsonReport(report: ScanReport): JsonReport {
  return {
    generatedAt: new Date().toISOString(),
    summary: report.summary,
    files: report.files,
    links: report.results.map((result) => ({
      url: result.url,
      status: result.status,
      statusCode: result.statusCode,
      redirectChain: result.redirectChain,
      finalUrl: result.finalUrl,
      error: result.error,
      isHttp: result.isHttp,
      isDuplicate: result.isDuplicate,
      isTooLong: result.isTooLong,
      durationMs: result.durationMs,
      occurrences: result.occurrences.map((o) => ({ file: o.file, line: o.line, column: o.column })),
    })),
  };
}

/** Writes the JSON report to disk at `outputPath`. */
export async function writeJsonReport(report: ScanReport, outputPath: string): Promise<void> {
  const json = toJsonReport(report);
  await writeFile(outputPath, `${JSON.stringify(json, null, 2)}\n`, 'utf-8');
}

/**
 * Renders a Markdown report suitable for a PR comment, a GitHub Step
 * Summary, or a saved `report.md` file.
 */
export function toMarkdownReport(report: ScanReport): string {
  const { summary } = report;
  const lines: string[] = [];

  lines.push('## 🔗 urldn-link-check report');
  lines.push('');
  lines.push(
    `Scanned **${summary.filesScanned}** file(s), found **${summary.totalLinks}** link(s) ` +
      `(**${summary.uniqueLinks}** unique).`,
  );
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('| --- | --- |');
  lines.push(`| ✅ OK | ${summary.ok} |`);
  lines.push(`| ↪️ Redirect | ${summary.redirects} |`);
  lines.push(`| ❌ Broken | ${summary.broken} |`);
  lines.push(`| ⏱️ Timeout | ${summary.timeouts} |`);
  lines.push(`| 🚫 Malformed | ${summary.malformed} |`);
  lines.push(`| 🔓 Insecure HTTP | ${summary.insecureHttp} |`);
  lines.push(`| 📏 Too long | ${summary.tooLong} |`);
  lines.push('');

  const problems = report.results.filter(
    (r) => r.status !== 'ok' || r.isHttp || r.isTooLong || r.isDuplicate,
  );

  if (problems.length === 0) {
    lines.push('✨ No issues found — every link looks good!');
    return lines.join('\n');
  }

  lines.push('### Issues');
  lines.push('');

  for (const result of problems) {
    lines.push(`#### ${statusEmoji(result)} \`${result.url}\``);
    for (const occurrence of result.occurrences) {
      lines.push(`- ${occurrence.file}:${occurrence.line}:${occurrence.column}`);
    }
    if (result.error) lines.push(`- Error: ${result.error}`);
    if (result.statusCode) lines.push(`- HTTP status: ${result.statusCode}`);
    if (result.redirectChain.length > 0) {
      lines.push(`- Redirect chain: ${[...result.redirectChain, result.finalUrl].join(' → ')}`);
    }
    if (result.isHttp) {
      lines.push('- ⚠️ Uses insecure `http://` — consider migrating to `https://`.');
    }
    if (result.isTooLong) {
      lines.push(
        `- ⚡ Long URL detected (${result.url.length} chars). Suggestion: shorten it with ` +
          `[URLDN](${URLDN_SHORTENER_URL}).`,
      );
    }
    if (result.isDuplicate) {
      lines.push(`- 🔁 Referenced ${result.occurrences.length} times across the docs.`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function statusEmoji(result: ScannedLinkResult): string {
  switch (result.status) {
    case 'ok':
      return '✅';
    case 'redirect':
      return '↪️';
    case 'broken':
      return '❌';
    case 'timeout':
      return '⏱️';
    case 'malformed':
      return '🚫';
    default:
      return 'ℹ️';
  }
}

/** Writes the Markdown report to disk at `outputPath`. */
export async function writeMarkdownReport(report: ScanReport, outputPath: string): Promise<void> {
  await writeFile(outputPath, `${toMarkdownReport(report)}\n`, 'utf-8');
}
