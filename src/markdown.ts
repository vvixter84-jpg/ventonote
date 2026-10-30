import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/** Маркеры «стрелочных» списков: строка начинается с символа и пробела. */
const ARROW = "→⇒➜★✓◆●";

/**
 * Расширение для стрелочных списков: строки, начинающиеся с →, ⇒, ★, ✓ и т.п.,
 * превращаются в аккуратный список с этим маркером.
 */
marked.use({
  extensions: [
    {
      name: "arrowList",
      level: "block",
      start(src: string) {
        return src.match(new RegExp(`^[${ARROW}]\\s`, "m"))?.index;
      },
      tokenizer(src: string) {
        const block = src.match(new RegExp(`^(?:[${ARROW}]\\s+[^\\n]*(?:\\n|$))+`));
        if (!block) return undefined;

        const items = block[0]
          .trimEnd()
          .split("\n")
          .map((line) => line.replace(new RegExp(`^[${ARROW}]\\s+`), ""));

        return { type: "arrowList", raw: block[0], items } as never;
      },
      renderer(token: { items?: string[] } & Record<string, unknown>) {
        const items = token.items ?? [];
        return `<ul class="arrow-list">${items
          .map((item) => `<li>${marked.parseInline(item) as string}</li>`)
          .join("")}</ul>`;
      },
    },
  ],
});

/**
 * Чек-листы: marked рендерит задачи как выключенные чекбоксы, а нам нужно
 * кликать по ним в предпросмотре — снимаем disabled уже после санитайза.
 */
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node instanceof HTMLInputElement && node.type === "checkbox") {
    node.removeAttribute("disabled");
  }
});

/**
 * Markdown → безопасный HTML. DOMPurify обязателен: тело заметки может
 * содержать что угодно, а рендерим мы его через dangerouslySetInnerHTML.
 */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
