/**
 * Markdown rendering with wikilinks using remark/rehype.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkWikiLink from "remark-wiki-link";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";

/**
 * Extract wikilinks from markdown content.
 * Returns array of unique link targets.
 */
export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

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
        if (!seen.has(lower)) {
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
 * Render markdown with wikilinks to HTML.
 * @param resolver - Function to resolve a link target to a note ID (null if missing)
 */
export function renderMarkdown(
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
