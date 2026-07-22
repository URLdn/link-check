import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveConfig } from './config.js';
import { runScan } from './scanner.js';
import { printConsoleReport, printVerboseLine } from './formatter.js';
import { toJsonReport, toMarkdownReport, writeJsonReport } from './report.js';
import packageJson from '../package.json' with { type: 'json' };

const program = new Command();

program
  .name('urldn-link-check')
  .description('Scan Markdown files and documentation for broken links, redirect chains, insecure HTTP links, and excessively long URLs.')
  .version(packageJson.version)
  .argument('<path>', 'directory or glob to scan for Markdown/MDX files')
  .option('--json', 'print the report as JSON instead of the human-readable format', false)
  .option('--markdown', 'print the report as Markdown instead of the human-readable format', false)
  .option('--fail-on-broken', 'exit with a non-zero code if broken links are found', true)
  .option('--no-fail-on-broken', 'do not fail the process when broken links are found')
  .option('--fail-on-redirect', 'exit with a non-zero code if redirects are found', false)
  .option('--fail-on-http', 'exit with a non-zero code if insecure http:// links are found', false)
  .option('--max-url-length <number>', 'flag URLs longer than this many characters', '80')
  .option('--ignore <pattern...>', 'glob or substring pattern(s) of URLs to ignore')
  .option('--timeout <ms>', 'per-request timeout in milliseconds', '10000')
  .option('--concurrency <n>', 'number of concurrent HTTP requests', '8')
  .option('--verbose', 'log every URL as it is checked', false)
  .option('--output <file>', 'write the JSON report to this file')
  .action(async (path: string, rawOptions: Record<string, unknown>) => {
    await main(path, rawOptions);
  });

interface CliOptions {
  json: boolean;
  markdown: boolean;
  failOnBroken: boolean;
  failOnRedirect: boolean;
  failOnHttp: boolean;
  maxUrlLength: string;
  ignore?: string[];
  timeout: string;
  concurrency: string;
  verbose: boolean;
  output?: string;
}

async function main(path: string, rawOptions: Record<string, unknown>): Promise<void> {
  const options = rawOptions as unknown as CliOptions;

  const config = resolveConfig({
    path,
    json: options.json,
    markdown: options.markdown,
    failOnBroken: options.failOnBroken,
    failOnRedirect: options.failOnRedirect,
    failOnHttp: options.failOnHttp,
    maxUrlLength: Number(options.maxUrlLength),
    ignore: options.ignore ?? [],
    timeout: Number(options.timeout),
    concurrency: Number(options.concurrency),
    verbose: options.verbose,
    output: options.output,
  });

  const useSpinner = !config.json && !config.markdown && !config.verbose && process.stdout.isTTY;
  const spinner = useSpinner ? ora('Scanning for links...').start() : undefined;

  try {
    const report = await runScan(config, {
      onFileFound: (files) => {
        if (spinner) spinner.text = `Found ${files.length} file(s). Checking links...`;
        else if (config.verbose) console.log(chalk.dim(`Found ${files.length} file(s).`));
      },
      onLinkChecked: (result, index, total) => {
        if (spinner) spinner.text = `Checking links... (${index}/${total})`;
        if (config.verbose) printVerboseLine(result);
      },
    });

    spinner?.stop();

    if (config.json) {
      console.log(JSON.stringify(toJsonReport(report), null, 2));
    } else if (config.markdown) {
      console.log(toMarkdownReport(report));
    } else {
      printConsoleReport(report);
    }

    if (config.output) {
      await writeJsonReport(report, config.output);
      if (!config.json) console.log(chalk.dim(`Report written to ${config.output}`));
    }

    const shouldFail =
      (config.failOnBroken && report.summary.broken > 0) ||
      (config.failOnRedirect && report.summary.redirects > 0) ||
      (config.failOnHttp && report.summary.insecureHttp > 0);

    process.exitCode = shouldFail ? 1 : 0;
  } catch (error) {
    spinner?.fail('Scan failed');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 2;
  }
}

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 2;
});
