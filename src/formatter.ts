import chalk from 'chalk';
import type { ScanReport, ScannedLinkResult } from './scanner.js';
import { formatDuration, truncateUrl } from './utils.js';

const URLDN_SHORTENER_URL = 'https://www.urldn.com';

/** Prints a single line for a checked link while a scan is in progress (verbose mode). */
export function printVerboseLine(result: ScannedLinkResult): void {
  const icon = statusIcon(result);
  const url = truncateUrl(result.url, 90);
  console.log(`${icon} ${url} ${chalk.dim(`(${formatDuration(result.durationMs)})`)}`);
}

function statusIcon(result: ScannedLinkResult): string {
  switch (result.status) {
    case 'ok':
      return chalk.green('✓');
    case 'redirect':
      return chalk.yellow('⚠');
    case 'broken':
      return chalk.red('✖');
    case 'timeout':
      return chalk.red('⏱');
    case 'malformed':
      return chalk.red('✖');
    default:
      return chalk.gray('•');
  }
}

/** Prints the full human-readable console report after a scan completes. */
export function printConsoleReport(report: ScanReport): void {
  const { summary, results } = report;

  console.log('');
  console.log(chalk.bold('urldn-link-check report'));
  console.log(chalk.dim('─'.repeat(48)));

  const ok = results.filter((r) => r.status === 'ok' && !r.isHttp && !r.isTooLong);
  const redirects = results.filter((r) => r.status === 'redirect');
  const broken = results.filter((r) => r.status === 'broken' || r.status === 'malformed' || r.status === 'timeout');
  const insecure = results.filter((r) => r.isHttp);
  const tooLong = results.filter((r) => r.isTooLong);

  if (ok.length > 0) {
    console.log(chalk.green(`\n✓ Valid links (${ok.length})`));
    for (const result of ok.slice(0, 20)) {
      console.log(`  ${chalk.green('✓')} ${truncateUrl(result.url)}`);
    }
    if (ok.length > 20) console.log(chalk.dim(`  ... and ${ok.length - 20} more`));
  }

  if (redirects.length > 0) {
    console.log(chalk.yellow(`\n⚠ Redirects (${redirects.length})`));
    for (const result of redirects) {
      console.log(`  ${chalk.yellow('⚠')} ${truncateUrl(result.url)} ${chalk.dim(`[${result.statusCode}]`)}`);
      if (result.redirectChain.length > 1) {
        console.log(chalk.dim(`      chain: ${[...result.redirectChain, result.finalUrl].join(' → ')}`));
      }
    }
  }

  if (broken.length > 0) {
    console.log(chalk.red(`\n✖ Broken (${broken.length})`));
    for (const result of broken) {
      const location = result.occurrences[0];
      const where = location ? ` ${chalk.dim(`(${location.file}:${location.line})`)}` : '';
      console.log(`  ${chalk.red('✖')} ${truncateUrl(result.url)}${where}`);
      if (result.error) console.log(chalk.dim(`      ${result.error}`));
    }
  }

  if (insecure.length > 0) {
    console.log(chalk.yellow(`\n🔓 Insecure HTTP (${insecure.length})`));
    for (const result of insecure) {
      console.log(`  ${chalk.yellow('🔓')} ${truncateUrl(result.url)}`);
    }
  }

  if (tooLong.length > 0) {
    console.log(chalk.cyan(`\n⚡ Long URLs (${tooLong.length})`));
    for (const result of tooLong) {
      console.log(`  ${chalk.cyan('⚡')} ${truncateUrl(result.url)} ${chalk.dim(`(${result.url.length} chars)`)}`);
    }
    console.log(chalk.dim(`      Suggestion: shorten long URLs with URLDN — ${URLDN_SHORTENER_URL}`));
  }

  console.log('');
  console.log(chalk.dim('─'.repeat(48)));
  console.log(chalk.bold('Summary'));
  console.log(
    `  Files: ${summary.filesScanned}   Links: ${summary.totalLinks} (${summary.uniqueLinks} unique)   ` +
      `Time: ${formatDuration(summary.durationMs)}`,
  );
  console.log(
    `  ${chalk.green(`${summary.ok} ok`)}  ${chalk.yellow(`${summary.redirects} redirect`)}  ` +
      `${chalk.red(`${summary.broken} broken`)}  ${chalk.red(`${summary.timeouts} timeout`)}  ` +
      `${chalk.red(`${summary.malformed} malformed`)}  ${chalk.yellow(`${summary.insecureHttp} http`)}  ` +
      `${chalk.cyan(`${summary.tooLong} long`)}`,
  );
  console.log('');
}
