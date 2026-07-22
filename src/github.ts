import * as core from '@actions/core';
import * as github from '@actions/github';
import { resolveConfig } from './config.js';
import { runScan } from './scanner.js';
import { toMarkdownReport, writeJsonReport } from './report.js';

const COMMENT_MARKER = '<!-- urldn-link-check-report -->';

function getBooleanInput(name: string, fallback: boolean): boolean {
  const raw = core.getInput(name);
  if (!raw) return fallback;
  return raw.toLowerCase() === 'true';
}

function getNumberInput(name: string, fallback: number): number {
  const raw = core.getInput(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Main entrypoint used by `action.yml` (`node dist/github.js`). */
export async function runAction(): Promise<void> {
  try {
    const path = core.getInput('path') || 'docs';
    const failOnBroken = getBooleanInput('fail-on-broken', true);
    const failOnRedirect = getBooleanInput('fail-on-redirect', false);
    const failOnHttp = getBooleanInput('fail-on-http', false);
    const maxUrlLength = getNumberInput('max-url-length', 80);
    const output = core.getInput('output') || undefined;
    const commentOnPr = getBooleanInput('comment-on-pr', true);
    const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;

    const config = resolveConfig({
      path,
      failOnBroken,
      failOnRedirect,
      failOnHttp,
      maxUrlLength,
      output,
    });

    core.info(`Scanning "${config.path}" for links...`);
    const report = await runScan(config);
    const markdown = toMarkdownReport(report);

    await core.summary.addRaw(markdown).write();

    if (output) {
      await writeJsonReport(report, output);
      core.setOutput('report-path', output);
    }

    core.setOutput('broken-links', String(report.summary.broken));
    core.setOutput('redirect-links', String(report.summary.redirects));
    core.setOutput('insecure-links', String(report.summary.insecureHttp));
    core.setOutput('total-links', String(report.summary.uniqueLinks));

    const context = github.context;
    const pullRequest = context.payload.pull_request;

    if (commentOnPr && token && pullRequest) {
      await upsertPullRequestComment(token, markdown);
    } else if (commentOnPr && pullRequest && !token) {
      core.warning('Skipping PR comment: no github-token was provided.');
    }

    const shouldFail =
      (failOnBroken && report.summary.broken > 0) ||
      (failOnRedirect && report.summary.redirects > 0) ||
      (failOnHttp && report.summary.insecureHttp > 0);

    if (shouldFail) {
      core.setFailed(
        `Link check failed: ${report.summary.broken} broken, ${report.summary.redirects} redirects, ` +
          `${report.summary.insecureHttp} insecure http link(s).`,
      );
    } else {
      core.info('Link check passed.');
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

async function upsertPullRequestComment(token: string, body: string): Promise<void> {
  const octokit = github.getOctokit(token);
  const context = github.context;
  const pullRequest = context.payload.pull_request;
  if (!pullRequest) return;

  const commentBody = `${COMMENT_MARKER}\n${body}`;

  const { data: comments } = await octokit.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: pullRequest.number,
  });

  const existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existing.id,
      body: commentBody,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: pullRequest.number,
      body: commentBody,
    });
  }
}
