# Broken link example

This page intentionally links to a path that does not exist, so you can see
what a failing run looks like:

[This link is broken](https://github.com/urldn/this-repo-path-does-not-exist-xyz)

Run:

```bash
npx urldn-link-check examples/docs --fail-on-broken
```

and the process should exit with a non-zero status code.
