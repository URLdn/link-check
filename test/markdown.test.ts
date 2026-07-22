import { describe, expect, it } from 'vitest';
import { extractLinksFromMarkdown } from '../src/markdown.js';

describe('extractLinksFromMarkdown', () => {
  it('extracts inline links with labels', () => {
    const content = 'Check out [our docs](https://example.com/docs) for more.';
    const links = extractLinksFromMarkdown(content);
    expect(links).toHaveLength(1);
    expect(links[0]?.url).toBe('https://example.com/docs');
    expect(links[0]?.label).toBe('our docs');
    expect(links[0]?.line).toBe(1);
  });

  it('extracts image links', () => {
    const content = '![logo](https://example.com/logo.png)';
    const links = extractLinksFromMarkdown(content);
    expect(links).toHaveLength(1);
    expect(links[0]?.url).toBe('https://example.com/logo.png');
  });

  it('extracts autolinks wrapped in angle brackets', () => {
    const content = 'Visit <https://example.com/autolink> today.';
    const links = extractLinksFromMarkdown(content);
    expect(links.map((l) => l.url)).toContain('https://example.com/autolink');
  });

  it('extracts bare URLs typed directly into prose', () => {
    const content = 'See https://example.com/bare-url for details.';
    const links = extractLinksFromMarkdown(content);
    expect(links.map((l) => l.url)).toContain('https://example.com/bare-url');
  });

  it('extracts reference-style link definitions', () => {
    const content = ['[label]: https://example.com/reference "Title"'].join('\n');
    const links = extractLinksFromMarkdown(content);
    expect(links.map((l) => l.url)).toContain('https://example.com/reference');
  });

  it('ignores URLs inside fenced code blocks', () => {
    const content = ['```', 'curl https://example.com/should-be-ignored', '```', '', 'Real: https://example.com/real'].join(
      '\n',
    );
    const links = extractLinksFromMarkdown(content);
    expect(links.map((l) => l.url)).not.toContain('https://example.com/should-be-ignored');
    expect(links.map((l) => l.url)).toContain('https://example.com/real');
  });

  it('ignores URLs inside inline code spans', () => {
    const content = 'Run `curl https://example.com/ignored` then visit https://example.com/kept';
    const links = extractLinksFromMarkdown(content);
    expect(links.map((l) => l.url)).not.toContain('https://example.com/ignored');
    expect(links.map((l) => l.url)).toContain('https://example.com/kept');
  });

  it('strips trailing punctuation from bare URLs', () => {
    const content = 'Docs are here: https://example.com/docs.';
    const links = extractLinksFromMarkdown(content);
    expect(links[0]?.url).toBe('https://example.com/docs');
  });

  it('reports accurate line numbers across multiple lines', () => {
    const content = ['line one', 'line two [link](https://example.com/two)', 'line three'].join('\n');
    const links = extractLinksFromMarkdown(content);
    expect(links[0]?.line).toBe(2);
  });

  it('handles MDX content the same way as Markdown', () => {
    const content = '<CustomComponent url="https://example.com/ignored-prop" /> and [link](https://example.com/mdx)';
    const links = extractLinksFromMarkdown(content);
    expect(links.map((l) => l.url)).toContain('https://example.com/mdx');
  });

  it('returns no links for content with none', () => {
    const links = extractLinksFromMarkdown('Just plain text, nothing to see here.');
    expect(links).toHaveLength(0);
  });
});
