import { describe, expect, it } from 'vitest';
import {
  dedupe,
  formatDuration,
  isInsecureHttp,
  isValidUrl,
  matchesIgnorePattern,
  runWithConcurrency,
  truncateUrl,
} from '../src/utils.js';

describe('isValidUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('rejects malformed strings', () => {
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });

  it('rejects non-http(s) protocols', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('mailto:hello@example.com')).toBe(false);
  });
});

describe('isInsecureHttp', () => {
  it('flags http:// as insecure', () => {
    expect(isInsecureHttp('http://example.com')).toBe(true);
  });

  it('does not flag https://', () => {
    expect(isInsecureHttp('https://example.com')).toBe(false);
  });
});

describe('matchesIgnorePattern', () => {
  it('matches plain substrings', () => {
    expect(matchesIgnorePattern('https://internal.example.com/path', ['internal.example.com'])).toBe(true);
  });

  it('matches wildcard patterns', () => {
    expect(matchesIgnorePattern('https://example.com/skip/me', ['**/skip/**'])).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesIgnorePattern('https://example.com/keep', ['internal.example.com'])).toBe(false);
  });
});

describe('dedupe', () => {
  it('removes duplicate values while preserving order', () => {
    expect(dedupe(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });
});

describe('formatDuration', () => {
  it('formats sub-second durations in ms', () => {
    expect(formatDuration(312)).toBe('312ms');
  });

  it('formats durations over a second in seconds', () => {
    expect(formatDuration(1234)).toBe('1.2s');
  });
});

describe('truncateUrl', () => {
  it('leaves short URLs untouched', () => {
    expect(truncateUrl('https://example.com', 70)).toBe('https://example.com');
  });

  it('truncates long URLs to the given length', () => {
    const long = `https://example.com/${'a'.repeat(200)}`;
    const truncated = truncateUrl(long, 40);
    expect(truncated.length).toBeLessThanOrEqual(40);
    expect(truncated).toContain('...');
  });
});

describe('runWithConcurrency', () => {
  it('runs every item and preserves result order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runWithConcurrency(items, 2, async (item) => item * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('never runs more than `limit` tasks concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await runWithConcurrency(items, 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('handles an empty array', async () => {
    const results = await runWithConcurrency([], 4, async (item) => item);
    expect(results).toEqual([]);
  });
});
