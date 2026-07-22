# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-22

### Added

- Initial release of `urldn-link-check`.
- CLI (`npx urldn-link-check <path>`) that scans Markdown/MDX files for links.
- Checks for broken links (404/500/etc.), redirect chains, insecure `http://`
  links, malformed URLs, timeouts, duplicate URLs, and overly long URLs.
- Console, JSON, and Markdown report formats.
- GitHub Action with pull request commenting and configurable fail conditions.
- Suggestion to shorten long URLs with [URLDN](https://www.urldn.com) (no
  automatic shortening is ever performed).
- Full Vitest test suite covering the markdown extractor, checker, scanner,
  config, and report generation.
