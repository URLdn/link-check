export interface ExtractedLink {
  /** The raw URL as it appears in the source. */
  url: string;
  /** 1-based line number where the link occurs. */
  line: number;
  /** 1-based column number where the link occurs. */
  column: number;
  /** The link text/label, when available (e.g. `[label](url)`). */
  label?: string;
}

const INLINE_LINK_RE = /\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
const REFERENCE_DEFINITION_RE = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+["'][^"']*["'])?\s*$/;
const AUTOLINK_RE = /<(https?:\/\/[^\s<>]+)>/g;
const BARE_URL_RE = /(?<![("'<[])\bhttps?:\/\/[^\s<>()"'\]]+/g;
const IMAGE_MARKDOWN_RE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;

/**
 * Strips fenced and inline code from a line/block so that URLs mentioned
 * inside code samples are not treated as live links to check. Fenced code
 * blocks are handled separately in `extractLinksFromMarkdown`; this only
 * strips inline `code spans`.
 */
function stripInlineCode(line: string): string {
  return line.replace(/`[^`]*`/g, (match) => ' '.repeat(match.length));
}

/**
 * Extracts every HTTP(S) URL referenced in a Markdown or MDX document,
 * including standard inline links `[text](url)`, images `![alt](url)`,
 * autolinks `<url>`, reference-style definitions, and bare URLs typed
 * directly into the prose. URLs inside fenced code blocks are skipped.
 */
export function extractLinksFromMarkdown(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const lines = content.split(/\r\n|\r|\n/);

  let inFencedBlock = false;
  let fenceMarker = '';

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex] ?? '';
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(rawLine);

    if (fenceMatch) {
      const marker = fenceMatch[1] ?? '';
      if (!inFencedBlock) {
        inFencedBlock = true;
        fenceMarker = marker[0] ?? '`';
      } else if (marker.startsWith(fenceMarker)) {
        inFencedBlock = false;
        fenceMarker = '';
      }
      continue;
    }

    if (inFencedBlock) continue;

    const line = stripInlineCode(rawLine);
    const seenColumns = new Set<number>();

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

function recordMatch(
  match: RegExpMatchArray,
  urlGroupIndex: number,
  lineIndex: number,
  line: string,
  links: ExtractedLink[],
  seenColumns: Set<number>,
  label?: string,
): void {
  const url = match[urlGroupIndex];
  if (!url) return;
  const matchStart = match.index ?? 0;
  const column = urlGroupIndex === 0 ? matchStart + 1 : line.indexOf(url, matchStart) + 1;
  pushIfNew(links, { url: cleanUrl(url), line: lineIndex + 1, column, label }, seenColumns);
}

function pushIfNew(
  links: ExtractedLink[],
  link: ExtractedLink,
  seenColumns: Set<number>,
): void {
  const key = link.column;
  if (seenColumns.has(key)) return;
  seenColumns.add(key);
  if (link.url.length === 0) return;
  links.push(link);
}

/** Trims trailing punctuation commonly picked up after a bare URL in prose. */
function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?)\]'"]+$/, '');
}
