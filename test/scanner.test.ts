import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { findFiles, runScan } from '../src/scanner.js';
import type { CheckResult } from '../src/checker.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'urldn-link-check-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fakeCheck(statuses: Record<string, Partial<CheckResult>>) {
  return async (url: string): Promise<CheckResult> => {
    const override = statuses[url] ?? {};
    return {
      url,
      status: 'ok',
      redirectChain: [],
      isHttp: url.startsWith('http://'),
      durationMs: 1,
      ...override,
    };
  };
}

describe('findFiles', () => {
  it('discovers markdown and mdx files under a directory', async () => {
    await writeFile(join(dir, 'a.md'), '# A');
    await writeFile(join(dir, 'b.mdx'), '# B');
    await writeFile(join(dir, 'c.txt'), 'not markdown');

    const config = resolveConfig({ path: dir });
    const files = await findFiles(config);

    expect(files.some((f) => f.endsWith('a.md'))).toBe(true);
    expect(files.some((f) => f.endsWith('b.mdx'))).toBe(true);
    expect(files.some((f) => f.endsWith('c.txt'))).toBe(false);
  });
});

describe('runScan', () => {
  it('aggregates links across files and reports a summary', async () => {
    await writeFile(join(dir, 'a.md'), '[good](https://example.com/good)\n[bad](https://example.com/bad)');
    await writeFile(join(dir, 'b.md'), '[good again](https://example.com/good)');

    const config = resolveConfig({ path: dir });
    const report = await runScan(config, {
      checkUrlFn: fakeCheck({
        'https://example.com/bad': { status: 'broken', statusCode: 404, error: 'Received HTTP 404' },
      }),
    });

    expect(report.summary.filesScanned).toBe(2);
    expect(report.summary.uniqueLinks).toBe(2);
    expect(report.summary.totalLinks).toBe(3);
    expect(report.summary.broken).toBe(1);
    expect(report.summary.ok).toBe(1);

    const good = report.results.find((r) => r.url === 'https://example.com/good');
    expect(good?.isDuplicate).toBe(true);
    expect(good?.occurrences).toHaveLength(2);
  });

  it('flags URLs longer than the configured max length', async () => {
    const longUrl = `https://example.com/${'a'.repeat(100)}`;
    await writeFile(join(dir, 'a.md'), `[long](${longUrl})`);

    const config = resolveConfig({ path: dir, maxUrlLength: 40 });
    const report = await runScan(config, { checkUrlFn: fakeCheck({}) });

    expect(report.summary.tooLong).toBe(1);
    expect(report.results[0]?.isTooLong).toBe(true);
  });

  it('excludes ignored URL patterns from the scan', async () => {
    await writeFile(
      join(dir, 'a.md'),
      '[skip](https://internal.example.com/secret)\n[keep](https://example.com/public)',
    );

    const config = resolveConfig({ path: dir, ignore: ['internal.example.com'] });
    const report = await runScan(config, { checkUrlFn: fakeCheck({}) });

    expect(report.summary.uniqueLinks).toBe(1);
    expect(report.results[0]?.url).toBe('https://example.com/public');
  });
});
