/**
 * Runs `worker` over every item in `items`, allowing at most `limit`
 * concurrent executions in flight at once. Order of the returned array
 * matches the order of `items`.
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index] as T;
      results[index] = await worker(item, index);
    }
  }

  const poolSize = Math.max(1, Math.min(limit, items.length || 1));
  const pool = Array.from({ length: poolSize }, () => next());
  await Promise.all(pool);
  return results;
}

/** Returns true when the given string parses as an absolute http(s) URL. */
export function isValidUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Returns true when the URL uses the insecure `http://` scheme. */
export function isInsecureHttp(candidate: string): boolean {
  try {
    return new URL(candidate).protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Very small glob-ish matcher for ignore patterns. Supports `*` (any run of
 * non-slash characters) and `**` (any run of characters, including `/`).
 * This intentionally avoids pulling in a second glob dependency just for
 * ignore matching.
 */
export function matchesIgnorePattern(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    // Plain substring patterns (no wildcard) - simple "contains" check,
    // handy for things like `--ignore internal.example.com`.
    if (!pattern.includes('*')) {
      return value.includes(pattern);
    }
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '§DOUBLESTAR§')
      .replace(/\*/g, '[^/]*')
      .replace(/§DOUBLESTAR§/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(value) || value.includes(pattern.replace(/\*/g, ''));
  });
}

/** De-duplicates an array while preserving first-seen order. */
export function dedupe<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}

/** Formats a duration in milliseconds as a short human string, e.g. "312ms" or "1.2s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Truncates a URL for display purposes, keeping the start and end visible. */
export function truncateUrl(url: string, maxLength = 70): string {
  if (url.length <= maxLength) return url;
  const headLength = Math.ceil((maxLength - 3) * 0.6);
  const tailLength = maxLength - 3 - headLength;
  return `${url.slice(0, headLength)}...${url.slice(url.length - tailLength)}`;
}
