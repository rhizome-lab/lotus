/**
 * Markdown rendering with wikilinks and transclusion using remark/rehype.
 *
 * Supports:
 * - [[Note]] - Regular wikilink
 * - [[Note|Alias]] - Wikilink with alias
 * - ![[Note]] - Transclusion (embeds note content)
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkWikiLink from "remark-wiki-link";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";

/** Content resolver returns note content or null if not found */
export type ContentResolver = (target: string) => { content: string; title: string } | null;

/** Max transclusion depth to prevent infinite recursion */
const MAX_TRANSCLUSION_DEPTH = 5;

/** Regex to match transclusion syntax: ![[Note]] or ![[Note|ignored]] */
const TRANSCLUSION_REGEX = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/**
 * Extract transclusions from markdown content.
 * Returns array of unique transclusion targets.
 */
function extractTransclusions(content: string): string[] {
  const transclusions: string[] = [];
  const seen = new Set<string>();

  // Reset regex lastIndex for fresh matching
  TRANSCLUSION_REGEX.lastIndex = 0;

  let match;
  while ((match = TRANSCLUSION_REGEX.exec(content)) !== null) {
    const target = match[1]?.trim();
    if (!target) continue;
    const lower = target.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      transclusions.push(target);
    }
  }

  return transclusions;
}

/**
 * Extract wikilinks from markdown content.
 * Returns array of unique link targets (excludes transclusions).
 */
function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  // First, get transclusions to exclude them
  const transclusions = new Set(extractTransclusions(content).map((t) => t.toLowerCase()));

  const processor = unified()
    .use(remarkParse)
    .use(remarkWikiLink, { aliasDivider: "|" });

  const tree = processor.parse(content);

  function visit(node: unknown) {
    if (node && typeof node === "object" && "type" in node) {
      const n = node as { type: string; value?: string; children?: unknown[] };
      if (n.type === "wikiLink" && "value" in n && typeof n.value === "string") {
        const target = n.value;
        const lower = target.toLowerCase();
        // Skip transclusions (they're tracked separately)
        if (!seen.has(lower) && !transclusions.has(lower)) {
          seen.add(lower);
          links.push(target);
        }
      }
      if (n.children && Array.isArray(n.children)) {
        for (const child of n.children) {
          visit(child);
        }
      }
    }
  }

  visit(tree);
  return links;
}

/**
 * Extract both wikilinks and transclusions from markdown content.
 * Returns combined array of unique targets (for backlink tracking).
 */
export function extractAllLinks(content: string): string[] {
  const wikilinks = extractWikilinks(content);
  const transclusions = extractTransclusions(content);

  const seen = new Set<string>();
  const combined: string[] = [];

  for (const link of [...wikilinks, ...transclusions]) {
    const lower = link.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      combined.push(link);
    }
  }

  return combined;
}

/**
 * Process transclusions in content by recursively embedding referenced notes.
 * @param content - Markdown content with ![[Note]] syntax
 * @param contentResolver - Function to get note content by title/alias
 * @param depth - Current recursion depth
 * @param visited - Set of visited note titles to detect cycles
 */
function processTransclusions(
  content: string,
  contentResolver: ContentResolver | undefined,
  depth = 0,
  visited = new Set<string>(),
): string {
  if (!contentResolver || depth >= MAX_TRANSCLUSION_DEPTH) {
    // At max depth, convert transclusions to regular links
    return content.replace(TRANSCLUSION_REGEX, "[[$1]]");
  }

  // Reset regex lastIndex
  TRANSCLUSION_REGEX.lastIndex = 0;

  return content.replace(TRANSCLUSION_REGEX, (_match, target: string) => {
    const trimmedTarget = target.trim();
    const lowerTarget = trimmedTarget.toLowerCase();

    // Detect cycle
    if (visited.has(lowerTarget)) {
      return `<div class="transclusion transclusion--cycle"><em>Circular reference to: ${trimmedTarget}</em></div>`;
    }

    // Resolve the note
    const note = contentResolver(trimmedTarget);
    if (!note) {
      return `<div class="transclusion transclusion--missing"><em>Note not found: ${trimmedTarget}</em></div>`;
    }

    // Track visited for cycle detection
    const newVisited = new Set(visited);
    newVisited.add(lowerTarget);

    // Recursively process transclusions in the embedded content
    const processedContent = processTransclusions(
      note.content,
      contentResolver,
      depth + 1,
      newVisited,
    );

    // Wrap in a transclusion container
    return `<div class="transclusion" data-note-title="${note.title}">\n${processedContent}\n</div>`;
  });
}

/**
 * Render markdown with wikilinks to HTML.
 * @param resolver - Function to resolve a link target to a note ID (null if missing)
 */
function renderMarkdown(
  content: string,
  resolver: (target: string) => string | null,
): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikiLink, {
      aliasDivider: "|",
      hrefTemplate: (permalink: string) => `#note:${permalink}`,
      wikiLinkClassName: "wikilink",
      newClassName: "wikilink--missing",
      pageResolver: (name: string) => {
        const noteId = resolver(name);
        return noteId ? [noteId] : [];
      },
    })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify);

  const result = processor.processSync(content);
  return String(result);
}

/**
 * Render markdown with wikilinks and transclusion support.
 * @param content - Markdown content
 * @param linkResolver - Function to resolve a link target to a note ID
 * @param contentResolver - Function to resolve a link target to note content
 */
export function renderMarkdownWithTransclusion(
  content: string,
  linkResolver: (target: string) => string | null,
  contentResolver?: ContentResolver,
): string {
  // First, process transclusions to embed note content
  const processedContent = processTransclusions(content, contentResolver);

  // Then render with standard markdown processing
  return renderMarkdown(processedContent, linkResolver);
}
