// src/config.ts
import { z } from "zod";
var ConfigSchema = z.object({
  /** Glob path(s) or directory to scan for Markdown/MDX files. */
  path: z.string().min(1),
  /** Glob patterns (or plain substrings) of files/URLs to ignore. */
  ignore: z.array(z.string()).default([]),
  /** Maximum URL length before it is flagged as "too long". */
  maxUrlLength: z.number().int().positive().default(80),
  /** Per-request timeout, in milliseconds. */
  timeout: z.number().int().positive().default(1e4),
  /** Number of concurrent HTTP requests. */
  concurrency: z.number().int().positive().default(8),
  /** Exit with a non-zero code when broken links are found. */
  failOnBroken: z.boolean().default(true),
  /** Exit with a non-zero code when redirects are found. */
  failOnRedirect: z.boolean().default(false),
  /** Exit with a non-zero code when insecure http:// links are found. */
  failOnHttp: z.boolean().default(false),
  /** Emit a JSON report to stdout instead of the human-readable report. */
  json: z.boolean().default(false),
  /** Emit a Markdown report to stdout. */
  markdown: z.boolean().default(false),
  /** Write the JSON report to this file path, if provided. */
  output: z.string().optional(),
  /** Verbose logging of every URL as it is checked. */
  verbose: z.boolean().default(false)
});
function resolveConfig(input) {
  return ConfigSchema.parse(input);
}
var DEFAULT_FILE_PATTERNS = ["**/*.md", "**/*.mdx", "**/*.markdown"];
var DEFAULT_IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/coverage/**"
];

// src/scanner.ts
import { readFile } from "fs/promises";
import { glob } from "glob";

// src/markdown.ts
var INLINE_LINK_RE = /\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
var REFERENCE_DEFINITION_RE = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+["'][^"']*["'])?\s*$/;
var AUTOLINK_RE = /<(https?:\/\/[^\s<>]+)>/g;
var BARE_URL_RE = /(?<![("'<[])\bhttps?:\/\/[^\s<>()"'\]]+/g;
var IMAGE_MARKDOWN_RE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, (match) => " ".repeat(match.length));
}
function extractLinksFromMarkdown(content) {
  const links = [];
  const lines = content.split(/\r\n|\r|\n/);
  let inFencedBlock = false;
  let fenceMarker = "";
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex] ?? "";
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(rawLine);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? "";
      if (!inFencedBlock) {
        inFencedBlock = true;
        fenceMarker = marker[0] ?? "`";
      } else if (marker.startsWith(fenceMarker)) {
        inFencedBlock = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFencedBlock) continue;
    const line = stripInlineCode(rawLine);
    const seenColumns = /* @__PURE__ */ new Set();
    for (const match of line.matchAll(IMAGE_MARKDOWN_RE)) {
      recordMatch(match, 2, lineIndex, line, links, seenColumns, match[1]);
    }
    for (const match of line.matchAll(INLINE_LINK_RE)) {
      recordMatch(match, 2, lineIndex, line, links, seenColumns, match[1]);
    }
    for (const match of line.matchAll(AUTOLINK_RE)) {
      recordMatch(match, 1, lineIndex, line, links, seenColumns);
    }
    const refMatch = REFERENCE_DEFINITION_RE.exec(rawLine);
    if (refMatch?.[1]) {
      const column = rawLine.indexOf(refMatch[1]) + 1;
      pushIfNew(links, { url: refMatch[1], line: lineIndex + 1, column }, seenColumns);
    }
    for (const match of line.matchAll(BARE_URL_RE)) {
      recordMatch(match, 0, lineIndex, line, links, seenColumns);
    }
  }
  return links;
}
function recordMatch(match, urlGroupIndex, lineIndex, line, links, seenColumns, label) {
  const url = match[urlGroupIndex];
  if (!url) return;
  const matchStart = match.index ?? 0;
  const column = urlGroupIndex === 0 ? matchStart + 1 : line.indexOf(url, matchStart) + 1;
  pushIfNew(links, { url: cleanUrl(url), line: lineIndex + 1, column, label }, seenColumns);
}
function pushIfNew(links, link, seenColumns) {
  const key = link.column;
  if (seenColumns.has(key)) return;
  seenColumns.add(key);
  if (link.url.length === 0) return;
  links.push(link);
}
function cleanUrl(url) {
  return url.replace(/[.,;:!?)\]'"]+$/, "");
}

// src/checker.ts
import axios from "axios";

// src/utils.ts
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      results[index] = await worker(item, index);
    }
  }
  const poolSize = Math.max(1, Math.min(limit, items.length || 1));
  const pool = Array.from({ length: poolSize }, () => next());
  await Promise.all(pool);
  return results;
}
function isValidUrl(candidate) {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
function isInsecureHttp(candidate) {
  try {
    return new URL(candidate).protocol === "http:";
  } catch {
    return false;
  }
}
function matchesIgnorePattern(value, patterns) {
  return patterns.some((pattern) => {
    if (!pattern.includes("*")) {
      return value.includes(pattern);
    }
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\xA7DOUBLESTAR\xA7").replace(/\*/g, "[^/]*").replace(/§DOUBLESTAR§/g, ".*");
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(value) || value.includes(pattern.replace(/\*/g, ""));
  });
}
function formatDuration(ms) {
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  return `${(ms / 1e3).toFixed(1)}s`;
}
function truncateUrl(url, maxLength = 70) {
  if (url.length <= maxLength) return url;
  const headLength = Math.ceil((maxLength - 3) * 0.6);
  const tailLength = maxLength - 3 - headLength;
  return `${url.slice(0, headLength)}...${url.slice(url.length - tailLength)}`;
}

// src/checker.ts
var MAX_REDIRECTS = 10;
async function checkUrl(url, options) {
  const started = Date.now();
  const isHttp = isInsecureHttp(url);
  if (!isValidUrl(url)) {
    return {
      url,
      status: "malformed",
      redirectChain: [],
      isHttp,
      durationMs: Date.now() - started,
      error: "URL is malformed or uses an unsupported protocol"
    };
  }
  const requestFn = options.requestFn ?? performRequest;
  try {
    const { statusCode, redirectChain, finalUrl } = await requestFn(url, options.timeout);
    const durationMs = Date.now() - started;
    if (statusCode >= 200 && statusCode < 300) {
      return {
        url,
        status: redirectChain.length > 0 ? "redirect" : "ok",
        statusCode,
        redirectChain,
        finalUrl,
        isHttp,
        durationMs
      };
    }
    if (statusCode >= 300 && statusCode < 400) {
      return {
        url,
        status: "redirect",
        statusCode,
        redirectChain,
        finalUrl,
        isHttp,
        durationMs
      };
    }
    return {
      url,
      status: "broken",
      statusCode,
      redirectChain,
      finalUrl,
      isHttp,
      durationMs,
      error: `Received HTTP ${statusCode}`
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const axiosError = error;
    if (axiosError.code === "ECONNABORTED" || axiosError.message?.includes("timeout")) {
      return {
        url,
        status: "timeout",
        redirectChain: [],
        isHttp,
        durationMs,
        error: `Request timed out after ${options.timeout}ms`
      };
    }
    return {
      url,
      status: "broken",
      redirectChain: [],
      isHttp,
      durationMs,
      error: axiosError.message ?? "Unknown network error"
    };
  }
}
async function performRequest(url, timeout) {
  const redirectChain = [];
  const client = axios.create({
    timeout,
    maxRedirects: 0,
    validateStatus: () => true,
    headers: {
      "User-Agent": "urldn-link-check (+https://github.com/urldn/link-check)"
    }
  });
  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response;
    try {
      response = await client.head(currentUrl);
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

// src/scanner.ts
async function findFiles(config) {
  const patterns = DEFAULT_FILE_PATTERNS.map((pattern) => joinPath(config.path, pattern));
  const ignore = [...DEFAULT_IGNORE_PATTERNS, ...config.ignore];
  const directMatches = await glob(config.path, { nodir: true, ignore });
  const nested = await glob(patterns, { nodir: true, ignore });
  const isMarkdownFile = (file) => /\.(md|mdx|markdown)$/i.test(file);
  const combined = [...directMatches.filter(isMarkdownFile), ...nested];
  return Array.from(new Set(combined)).sort();
}
function joinPath(base, pattern) {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${pattern}`;
}
async function runScan(config, events = {}) {
  const started = Date.now();
  const files = await findFiles(config);
  events.onFileFound?.(files);
  const occurrencesByUrl = /* @__PURE__ */ new Map();
  for (const file of files) {
    const content = await readFile(file, "utf-8");
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
  const check = events.checkUrlFn ?? ((url, timeout) => checkUrl(url, { timeout }));
  const results = await runWithConcurrency(uniqueUrls, config.concurrency, async (url) => {
    const checkResult = await check(url, config.timeout);
    const occurrences = occurrencesByUrl.get(url) ?? [];
    const scanned = {
      ...checkResult,
      occurrences,
      isDuplicate: occurrences.length > 1,
      isTooLong: url.length > config.maxUrlLength
    };
    checkedCount += 1;
    events.onLinkChecked?.(scanned, checkedCount, uniqueUrls.length);
    return scanned;
  });
  const summary = summarize(results, files.length, started);
  return { config, summary, results, files };
}
function summarize(results, filesScanned, started) {
  const summary = {
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
    durationMs: Date.now() - started
  };
  for (const result of results) {
    if (result.status === "ok") summary.ok += 1;
    if (result.status === "redirect") summary.redirects += 1;
    if (result.status === "broken") summary.broken += 1;
    if (result.status === "timeout") summary.timeouts += 1;
    if (result.status === "malformed") summary.malformed += 1;
    if (result.isHttp) summary.insecureHttp += 1;
    if (result.isTooLong) summary.tooLong += 1;
  }
  return summary;
}

// src/report.ts
import { writeFile } from "fs/promises";
var URLDN_SHORTENER_URL = "https://www.urldn.com";
function toJsonReport(report) {
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
      occurrences: result.occurrences.map((o) => ({ file: o.file, line: o.line, column: o.column }))
    }))
  };
}
async function writeJsonReport(report, outputPath) {
  const json = toJsonReport(report);
  await writeFile(outputPath, `${JSON.stringify(json, null, 2)}
`, "utf-8");
}
function toMarkdownReport(report) {
  const { summary } = report;
  const lines = [];
  lines.push("## \u{1F517} urldn-link-check report");
  lines.push("");
  lines.push(
    `Scanned **${summary.filesScanned}** file(s), found **${summary.totalLinks}** link(s) (**${summary.uniqueLinks}** unique).`
  );
  lines.push("");
  lines.push("| Status | Count |");
  lines.push("| --- | --- |");
  lines.push(`| \u2705 OK | ${summary.ok} |`);
  lines.push(`| \u21AA\uFE0F Redirect | ${summary.redirects} |`);
  lines.push(`| \u274C Broken | ${summary.broken} |`);
  lines.push(`| \u23F1\uFE0F Timeout | ${summary.timeouts} |`);
  lines.push(`| \u{1F6AB} Malformed | ${summary.malformed} |`);
  lines.push(`| \u{1F513} Insecure HTTP | ${summary.insecureHttp} |`);
  lines.push(`| \u{1F4CF} Too long | ${summary.tooLong} |`);
  lines.push("");
  const problems = report.results.filter(
    (r) => r.status !== "ok" || r.isHttp || r.isTooLong || r.isDuplicate
  );
  if (problems.length === 0) {
    lines.push("\u2728 No issues found \u2014 every link looks good!");
    return lines.join("\n");
  }
  lines.push("### Issues");
  lines.push("");
  for (const result of problems) {
    lines.push(`#### ${statusEmoji(result)} \`${result.url}\``);
    for (const occurrence of result.occurrences) {
      lines.push(`- ${occurrence.file}:${occurrence.line}:${occurrence.column}`);
    }
    if (result.error) lines.push(`- Error: ${result.error}`);
    if (result.statusCode) lines.push(`- HTTP status: ${result.statusCode}`);
    if (result.redirectChain.length > 0) {
      lines.push(`- Redirect chain: ${[...result.redirectChain, result.finalUrl].join(" \u2192 ")}`);
    }
    if (result.isHttp) {
      lines.push("- \u26A0\uFE0F Uses insecure `http://` \u2014 consider migrating to `https://`.");
    }
    if (result.isTooLong) {
      lines.push(
        `- \u26A1 Long URL detected (${result.url.length} chars). Suggestion: shorten it with [URLDN](${URLDN_SHORTENER_URL}).`
      );
    }
    if (result.isDuplicate) {
      lines.push(`- \u{1F501} Referenced ${result.occurrences.length} times across the docs.`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function statusEmoji(result) {
  switch (result.status) {
    case "ok":
      return "\u2705";
    case "redirect":
      return "\u21AA\uFE0F";
    case "broken":
      return "\u274C";
    case "timeout":
      return "\u23F1\uFE0F";
    case "malformed":
      return "\u{1F6AB}";
    default:
      return "\u2139\uFE0F";
  }
}
async function writeMarkdownReport(report, outputPath) {
  await writeFile(outputPath, `${toMarkdownReport(report)}
`, "utf-8");
}

// src/formatter.ts
import chalk from "chalk";
var URLDN_SHORTENER_URL2 = "https://www.urldn.com";
function printVerboseLine(result) {
  const icon = statusIcon(result);
  const url = truncateUrl(result.url, 90);
  console.log(`${icon} ${url} ${chalk.dim(`(${formatDuration(result.durationMs)})`)}`);
}
function statusIcon(result) {
  switch (result.status) {
    case "ok":
      return chalk.green("\u2713");
    case "redirect":
      return chalk.yellow("\u26A0");
    case "broken":
      return chalk.red("\u2716");
    case "timeout":
      return chalk.red("\u23F1");
    case "malformed":
      return chalk.red("\u2716");
    default:
      return chalk.gray("\u2022");
  }
}
function printConsoleReport(report) {
  const { summary, results } = report;
  console.log("");
  console.log(chalk.bold("urldn-link-check report"));
  console.log(chalk.dim("\u2500".repeat(48)));
  const ok = results.filter((r) => r.status === "ok" && !r.isHttp && !r.isTooLong);
  const redirects = results.filter((r) => r.status === "redirect");
  const broken = results.filter((r) => r.status === "broken" || r.status === "malformed" || r.status === "timeout");
  const insecure = results.filter((r) => r.isHttp);
  const tooLong = results.filter((r) => r.isTooLong);
  if (ok.length > 0) {
    console.log(chalk.green(`
\u2713 Valid links (${ok.length})`));
    for (const result of ok.slice(0, 20)) {
      console.log(`  ${chalk.green("\u2713")} ${truncateUrl(result.url)}`);
    }
    if (ok.length > 20) console.log(chalk.dim(`  ... and ${ok.length - 20} more`));
  }
  if (redirects.length > 0) {
    console.log(chalk.yellow(`
\u26A0 Redirects (${redirects.length})`));
    for (const result of redirects) {
      console.log(`  ${chalk.yellow("\u26A0")} ${truncateUrl(result.url)} ${chalk.dim(`[${result.statusCode}]`)}`);
      if (result.redirectChain.length > 1) {
        console.log(chalk.dim(`      chain: ${[...result.redirectChain, result.finalUrl].join(" \u2192 ")}`));
      }
    }
  }
  if (broken.length > 0) {
    console.log(chalk.red(`
\u2716 Broken (${broken.length})`));
    for (const result of broken) {
      const location = result.occurrences[0];
      const where = location ? ` ${chalk.dim(`(${location.file}:${location.line})`)}` : "";
      console.log(`  ${chalk.red("\u2716")} ${truncateUrl(result.url)}${where}`);
      if (result.error) console.log(chalk.dim(`      ${result.error}`));
    }
  }
  if (insecure.length > 0) {
    console.log(chalk.yellow(`
\u{1F513} Insecure HTTP (${insecure.length})`));
    for (const result of insecure) {
      console.log(`  ${chalk.yellow("\u{1F513}")} ${truncateUrl(result.url)}`);
    }
  }
  if (tooLong.length > 0) {
    console.log(chalk.cyan(`
\u26A1 Long URLs (${tooLong.length})`));
    for (const result of tooLong) {
      console.log(`  ${chalk.cyan("\u26A1")} ${truncateUrl(result.url)} ${chalk.dim(`(${result.url.length} chars)`)}`);
    }
    console.log(chalk.dim(`      Suggestion: shorten long URLs with URLDN \u2014 ${URLDN_SHORTENER_URL2}`));
  }
  console.log("");
  console.log(chalk.dim("\u2500".repeat(48)));
  console.log(chalk.bold("Summary"));
  console.log(
    `  Files: ${summary.filesScanned}   Links: ${summary.totalLinks} (${summary.uniqueLinks} unique)   Time: ${formatDuration(summary.durationMs)}`
  );
  console.log(
    `  ${chalk.green(`${summary.ok} ok`)}  ${chalk.yellow(`${summary.redirects} redirect`)}  ${chalk.red(`${summary.broken} broken`)}  ${chalk.red(`${summary.timeouts} timeout`)}  ${chalk.red(`${summary.malformed} malformed`)}  ${chalk.yellow(`${summary.insecureHttp} http`)}  ${chalk.cyan(`${summary.tooLong} long`)}`
  );
  console.log("");
}
export {
  ConfigSchema,
  DEFAULT_FILE_PATTERNS,
  DEFAULT_IGNORE_PATTERNS,
  checkUrl,
  extractLinksFromMarkdown,
  findFiles,
  printConsoleReport,
  printVerboseLine,
  resolveConfig,
  runScan,
  toJsonReport,
  toMarkdownReport,
  writeJsonReport,
  writeMarkdownReport
};
//# sourceMappingURL=index.js.map