import { describe, expect, it } from 'vitest';
import { toJsonReport, toMarkdownReport } from '../src/report.js';
import { resolveConfig } from '../src/config.js';
import type { ScanReport, ScannedLinkResult } from '../src/scanner.js';

function buildReport(results: ScannedLinkResult[]): ScanReport {
  const config = resolveConfig({ path: 'docs' });
  return {
    config,
    files: ['docs/a.md'],
    results,
    summary: {
      filesScanned: 1,
      totalLinks: results.reduce((t, r) => t + r.occurrences.length, 0),
      uniqueLinks: results.length,
      ok: results.filter((r) => r.status === 'ok').length,
      redirects: results.filter((r) => r.status === 'redirect').length,
      broken: results.filter((r) => r.status === 'broken').length,
      timeouts: results.filter((r) => r.status === 'timeout').length,
      malformed: results.filter((r) => r.status === 'malformed').length,
      insecureHttp: results.filter((r) => r.isHttp).length,
      tooLong: results.filter((r) => r.isTooLong).length,
      durationMs: 42,
    },
  };
}

const okResult: ScannedLinkResult = {
  url: 'https://example.com/ok',
  status: 'ok',
  statusCode: 200,
  redirectChain: [],
  isHttp: false,
  durationMs: 5,
  occurrences: [{ url: 'https://example.com/ok', file: 'docs/a.md', line: 1, column: 1 }],
  isDuplicate: false,
  isTooLong: false,
};

const brokenResult: ScannedLinkResult = {
  url: 'https://example.com/broken',
  status: 'broken',
  statusCode: 404,
  error: 'Received HTTP 404',
  redirectChain: [],
  isHttp: false,
  durationMs: 5,
  occurrences: [{ url: 'https://example.com/broken', file: 'docs/a.md', line: 2, column: 1 }],
  isDuplicate: false,
  isTooLong: false,
};

describe('toJsonReport', () => {
  it('includes a summary and per-link details', () => {
    const report = buildReport([okResult, brokenResult]);
    const json = toJsonReport(report);

    expect(json.summary.ok).toBe(1);
    expect(json.summary.broken).toBe(1);
    expect(json.links).toHaveLength(2);
    expect(json.links[1]?.status).toBe('broken');
    expect(json.links[1]?.occurrences[0]?.line).toBe(2);
  });
});

describe('toMarkdownReport', () => {
  it('reports no issues when everything is ok', () => {
    const report = buildReport([okResult]);
    const markdown = toMarkdownReport(report);
    expect(markdown).toContain('No issues found');
  });

  it('lists broken links with their file locations', () => {
    const report = buildReport([okResult, brokenResult]);
    const markdown = toMarkdownReport(report);
    expect(markdown).toContain('https://example.com/broken');
    expect(markdown).toContain('docs/a.md:2:1');
    expect(markdown).not.toContain('No issues found');
  });

  it('suggests URLDN for long URLs', () => {
    const longResult: ScannedLinkResult = {
      ...okResult,
      url: `https://example.com/${'a'.repeat(100)}`,
      isTooLong: true,
    };
    const report = buildReport([longResult]);
    const markdown = toMarkdownReport(report);
    expect(markdown).toContain('urldn.com');
  });
});
