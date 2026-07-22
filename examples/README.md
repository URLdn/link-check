# Examples

- `docs/sample.md` — a mix of healthy, insecure, long, and duplicate links.
  Try it with `npx urldn-link-check examples/docs --verbose`.
- `docs/broken-link.md` — an intentionally broken link, useful for testing
  `--fail-on-broken` exit codes.
- `workflows/check-links.yml` — a full GitHub Actions workflow: runs on PRs
  that touch Markdown, on a weekly schedule, comments on the PR, and uploads
  the JSON report as an artifact.
- `workflows/minimal.yml` — the smallest possible setup, just checking
  `README.md` on every pull request.
