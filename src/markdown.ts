import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Markdown → безопасный HTML. DOMPurify обязателен: тело заметки может
 * содержать что угодно, а рендерим мы его через dangerouslySetInnerHTML.
 */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
