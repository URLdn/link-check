import { describe, expect, it } from 'vitest';
import { ConfigSchema, resolveConfig } from '../src/config.js';

describe('resolveConfig', () => {
  it('applies sensible defaults', () => {
    const config = resolveConfig({ path: 'docs' });
    expect(config.maxUrlLength).toBe(80);
    expect(config.timeout).toBe(10_000);
    expect(config.concurrency).toBe(8);
    expect(config.failOnBroken).toBe(true);
    expect(config.failOnRedirect).toBe(false);
    expect(config.failOnHttp).toBe(false);
    expect(config.ignore).toEqual([]);
  });

  it('allows overriding defaults', () => {
    const config = resolveConfig({ path: 'docs', maxUrlLength: 40, failOnHttp: true, ignore: ['example.com'] });
    expect(config.maxUrlLength).toBe(40);
    expect(config.failOnHttp).toBe(true);
    expect(config.ignore).toEqual(['example.com']);
  });

  it('rejects an empty path', () => {
    expect(() => ConfigSchema.parse({ path: '' })).toThrow();
  });

  it('rejects a negative concurrency', () => {
    expect(() => ConfigSchema.parse({ path: 'docs', concurrency: -1 })).toThrow();
  });
});
