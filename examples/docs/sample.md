# Example docs

This file exists purely so you can try `urldn-link-check` against something
real. Run it from the repository root:

```bash
npx urldn-link-check examples/docs --verbose
```

## A healthy link

[GitHub](https://github.com) is a solid, secure, reasonably short URL.

## An insecure link

Some older docs still point to [our blog over plain HTTP](http://example.com/blog),
which `--fail-on-http` will catch.

## A very long link

Long, unshortened URLs like this one are exactly what the `--max-url-length`
check (and the URLDN suggestion) are for:
https://example.com/articles/2026/07/22/a-very-long-and-descriptive-slug-that-nobody-will-ever-type-by-hand

## A duplicate link

[GitHub](https://github.com) is linked again here, so the report will note it
was referenced more than once.

## Reference-style link

You can also check reference-style links like [this one][ref].

[ref]: https://example.com/reference-style-link
