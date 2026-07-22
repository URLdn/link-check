import axios, { type AxiosError } from 'axios';
import { isInsecureHttp, isValidUrl } from './utils.js';

export type LinkStatus =
  | 'ok'
  | 'redirect'
  | 'broken'
  | 'timeout'
  | 'malformed'
  | 'insecure-http';

export interface CheckOptions {
  timeout: number;
  /** Optional override, mainly for tests, to substitute the HTTP client. */
  requestFn?: typeof performRequest;
}

export interface CheckResult {
  url: string;
  status: LinkStatus;
  statusCode?: number;
  redirectChain: string[];
  finalUrl?: string;
  error?: string;
  isHttp: boolean;
  durationMs: number;
}

const MAX_REDIRECTS = 10;

/**
 * Checks a single URL and classifies the result. HTTP is always attempted
 * with `HEAD` first, falling back to `GET` for servers that reject HEAD
 * requests (405/501), which is common enough to warrant a retry rather
 * than a false "broken" report.
 */
export async function checkUrl(url: string, options: CheckOptions): Promise<CheckResult> {
  const started = Date.now();
  const isHttp = isInsecureHttp(url);

  if (!isValidUrl(url)) {
    return {
      url,
      status: 'malformed',
      redirectChain: [],
      isHttp,
      durationMs: Date.now() - started,
      error: 'URL is malformed or uses an unsupported protocol',
    };
  }

  const requestFn = options.requestFn ?? performRequest;

  try {
    const { statusCode, redirectChain, finalUrl } = await requestFn(url, options.timeout);
    const durationMs = Date.now() - started;

    if (statusCode >= 200 && statusCode < 300) {
      return {
        url,
        status: redirectChain.length > 0 ? 'redirect' : 'ok',
        statusCode,
        redirectChain,
        finalUrl,
        isHttp,
        durationMs,
      };
    }

    if (statusCode >= 300 && statusCode < 400) {
      return {
        url,
        status: 'redirect',
        statusCode,
        redirectChain,
        finalUrl,
        isHttp,
        durationMs,
      };
    }

    return {
      url,
      status: 'broken',
      statusCode,
      redirectChain,
      finalUrl,
      isHttp,
      durationMs,
      error: `Received HTTP ${statusCode}`,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const axiosError = error as AxiosError;

    if (axiosError.code === 'ECONNABORTED' || axiosError.message?.includes('timeout')) {
      return {
        url,
        status: 'timeout',
        redirectChain: [],
        isHttp,
        durationMs,
        error: `Request timed out after ${options.timeout}ms`,
      };
    }

    return {
      url,
      status: 'broken',
      redirectChain: [],
      isHttp,
      durationMs,
      error: axiosError.message ?? 'Unknown network error',
    };
  }
}

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
export async function performRequest(url: string, timeout: number): Promise<RawRequestResult> {
  const redirectChain: string[] = [];

  const client = axios.create({
    timeout,
    maxRedirects: 0,
    validateStatus: () => true,
    headers: {
      'User-Agent': 'urldn-link-check (+https://github.com/urldn/link-check)',
    },
  });

  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response;
    try {
      response = await client.head(currentUrl);
      // Some servers (incorrectly) reject HEAD; retry with GET in that case.
      if (response.status === 405 || response.status === 501) {
        response = await client.get(currentUrl);
      }
    } catch {
      response = await client.get(currentUrl);
    }

    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      const nextUrl = new URL(String(response.headers.location), currentUrl).toString();
      redirectChain.push(currentUrl);
      currentUrl = nextUrl;
      continue;
    }

    return { statusCode: response.status, redirectChain, finalUrl: currentUrl };
  }

  throw new Error(`Too many redirects (> ${MAX_REDIRECTS})`);
}
