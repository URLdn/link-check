import { describe, expect, it } from 'vitest';
import { checkUrl } from '../src/checker.js';

describe('checkUrl', () => {
  it('classifies a 200 response as ok', async () => {
    const result = await checkUrl('https://example.com/ok', {
      timeout: 5000,
      requestFn: async () => ({ statusCode: 200, redirectChain: [], finalUrl: 'https://example.com/ok' }),
    });
    expect(result.status).toBe('ok');
    expect(result.statusCode).toBe(200);
  });

  it('classifies a 404 response as broken', async () => {
    const result = await checkUrl('https://example.com/missing', {
      timeout: 5000,
      requestFn: async () => ({ statusCode: 404, redirectChain: [], finalUrl: 'https://example.com/missing' }),
    });
    expect(result.status).toBe('broken');
    expect(result.statusCode).toBe(404);
  });

  it('classifies a 500 response as broken', async () => {
    const result = await checkUrl('https://example.com/error', {
      timeout: 5000,
      requestFn: async () => ({ statusCode: 500, redirectChain: [], finalUrl: 'https://example.com/error' }),
    });
    expect(result.status).toBe('broken');
  });

  it('classifies a 3xx response with a redirect chain as redirect', async () => {
    const result = await checkUrl('https://example.com/old', {
      timeout: 5000,
      requestFn: async () => ({
        statusCode: 301,
        redirectChain: ['https://example.com/old'],
        finalUrl: 'https://example.com/new',
      }),
    });
    expect(result.status).toBe('redirect');
    expect(result.redirectChain).toEqual(['https://example.com/old']);
    expect(result.finalUrl).toBe('https://example.com/new');
  });

  it('flags malformed URLs without making a request', async () => {
    let called = false;
    const result = await checkUrl('not a url', {
      timeout: 5000,
      requestFn: async () => {
        called = true;
        return { statusCode: 200, redirectChain: [], finalUrl: 'not a url' };
      },
    });
    expect(result.status).toBe('malformed');
    expect(called).toBe(false);
  });

  it('flags ftp:// and other non-http(s) protocols as malformed', async () => {
    const result = await checkUrl('ftp://example.com/file', { timeout: 5000 });
    expect(result.status).toBe('malformed');
  });

  it('marks http:// URLs as insecure regardless of status', async () => {
    const result = await checkUrl('http://example.com/insecure', {
      timeout: 5000,
      requestFn: async () => ({ statusCode: 200, redirectChain: [], finalUrl: 'http://example.com/insecure' }),
    });
    expect(result.isHttp).toBe(true);
    expect(result.status).toBe('ok');
  });

  it('classifies a timeout error as timeout', async () => {
    const result = await checkUrl('https://example.com/slow', {
      timeout: 50,
      requestFn: async () => {
        const error = new Error('timeout of 50ms exceeded');
        (error as { code?: string }).code = 'ECONNABORTED';
        throw error;
      },
    });
    expect(result.status).toBe('timeout');
  });

  it('classifies a generic network error as broken', async () => {
    const result = await checkUrl('https://example.com/dns-fail', {
      timeout: 5000,
      requestFn: async () => {
        throw new Error('getaddrinfo ENOTFOUND example.com');
      },
    });
    expect(result.status).toBe('broken');
    expect(result.error).toContain('ENOTFOUND');
  });
});
