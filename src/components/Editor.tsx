import { useMemo, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { formatDate, pluralizeWords } from "../format";
import { openExternal } from "../external";
import { renderMarkdown } from "../markdown";
import type { EditorMode, Note, SaveStatus } from "../types";
import BrandMark from "./BrandMark";

interface EditorProps {
  note: Note | null;
  status: SaveStatus;
  mode: EditorMode;
  fontSize: number;
  lineWidth: number;
  onEdit: (patch: { title: string; body: string }) => void;
  onModeChange: (mode: EditorMode) => void;
  onTrash: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
}

const MODES: { value: EditorMode; label: string; title: string }[] = [
  { value: "edit", label: "Текст", title: "Только редактор" },
  { value: "split", label: "Два окна", title: "Редактор и предпросмотр" },
  { value: "preview", label: "Читать", title: "Только предпросмотр" },
];

const TASK_LINE = /^(\s*[-*+]\s+)\[( |x|X)\]/;

const TABLE_SNIPPET = `| Колонка | Колонка |
| --- | --- |
|  |  |
`;

export default function Editor({
  note,
  status,
  mode,
  fontSize,
  lineWidth,
  onEdit,
  onModeChange,
  onTrash,
  onRestore,
  onDeleteForever,
}: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => (note ? renderMarkdown(note.body) : ""), [note]);

  if (!note) {
    return (
      <section className="editor editor--empty">
        <div className="empty-state">
          <BrandMark size={64} className="empty-state__mark" />
          <p>Выберите заметку слева или нажмите Ctrl+N.</p>
          <p className="empty-state__hint">Markdown, чек-листы, поиск и корзина — всё уже внутри.</p>
        </div>
      </section>
    );
  }

  const inTrash = note.deletedAt !== null;
  const words = note.body.split(/\s+/).filter(Boolean).length;

  /** Оборачивает выделение парой маркеров. */
  function applyWrap(prefix: string, suffix: string, placeholder = "текст") {
    if (!note) return;
    const element = textareaRef.current;
    if (!element) return;

    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = note.body.slice(start, end) || placeholder;
    const next = `${note.body.slice(0, start)}${prefix}${selected}${suffix}${note.body.slice(end)}`;
    onEdit({ title: note.title, body: next });

    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  /** Ставит маркер в начало текущей строки (или каждой выделенной). */
  function applyLinePrefix(marker: string) {
    if (!note) return;
    const element = textareaRef.current;
    if (!element) return;

    const start = element.selectionStart;
    const end = element.selectionEnd;

    if (end > start && note.body.slice(start, end).includes("\n")) {
      const before = note.body.slice(0, start);
      const selected = note.body.slice(start, end);
      const after = note.body.slice(end);
      const prefixed = selected
        .split("\n")
        .map((line, index) => (index === 0 ? `${marker}${line}` : `${marker}${line}`))
        .join("\n");
      const next = `${before}${prefixed}${after}`;
      onEdit({ title: note.title, body: next });
      requestAnimationFrame(() => {
        element.focus();
        element.setSelectionRange(start, start + prefixed.length);
      });
      return;
    }

    const lineStart = note.body.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const next = `${note.body.slice(0, lineStart)}${marker}${note.body.slice(lineStart)}`;
    onEdit({ title: note.title, body: next });

    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + marker.length, start + marker.length);
    });
  }

  /** Вставляет блок текста отдельными строками. */
  function insertBlock(text: string) {
    if (!note) return;
    const element = textareaRef.current;
    const start = element?.selectionStart ?? note.body.length;
    const needsLeading = start > 0 && !note.body.slice(0, start).endsWith("\n");
    const insertion = `${needsLeading ? "\n" : ""}${text}`;
    onEdit({ title: note.title, body: `${note.body.slice(0, start)}${insertion}${note.body.slice(start)}` });
  }

  /** Переключает пункт чек-листа по индексу в предпросмотре. */
  function toggleTask(index: number) {
    if (!note) return;
    let seen = -1;

    const next = note.body
      .split("\n")
      .map((line) => {
        const match = line.match(TASK_LINE);
        if (!match) return line;

        seen += 1;
        if (seen !== index) return line;

        const done = match[2].toLowerCase() === "x";
        return `${match[1]}[${done ? " " : "x"}]${line.slice(match[0].length)}`;
      })
      .join("\n");

    onEdit({ title: note.title, body: next });
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      event.preventDefault();
      const boxes = Array.from(
        previewRef.current?.querySelectorAll('input[type="checkbox"]') ?? [],
      );
      const index = boxes.indexOf(target);
      if (index >= 0) toggleTask(index);
      return;
    }

    const anchor = target.closest("a");
    if (!anchor) return;
    event.preventDefault();
    void openExternal(anchor.getAttribute("href") ?? "");
  }

  function handleBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();

    if (key === "b") {
      event.preventDefault();
      applyWrap("**", "**");
    } else if (key === "i") {
      event.preventDefault();
      applyWrap("*", "*");
    } else if (key === "s" && event.shiftKey) {
      event.preventDefault();
      applyWrap("~~", "~~");
    } else if (key === "c" && event.shiftKey) {
      event.preventDefault();
      applyLinePrefix("- [ ] ");
    }
  }

  return (
    <section className="editor">
      <div className="editor__bar">
        <input
          className="editor__title"
          value={note.title}
          readOnly={inTrash}
          placeholder="Заголовок"
          aria-label="Заголовок заметки"
          onChange={(event) => onEdit({ title: event.target.value, body: note.body })}
        />

        <div className="editor__actions">
          {inTrash ? (
            <>
              <button className="button" type="button" onClick={onRestore}>
                Восстановить
              </button>
              <button className="button button--danger" type="button" onClick={onDeleteForever}>
                Удалить навсегда
              </button>
            </>
          ) : (
            <button className="button button--ghost" type="button" onClick={onTrash}>
              В корзину
            </button>
          )}
        </div>
      </div>

      {!inTrash && (
        <div className="editor__toolbar">
          <div className="toolbar-group">
            <button
              className="toolbar__button"
              type="button"
              title="Жирный (Ctrl+B)"
              onClick={() => applyWrap("**", "**")}
            >
              <strong>B</strong>
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Курсив (Ctrl+I)"
              onClick={() => applyWrap("*", "*")}
            >
              <em>I</em>
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Зачёркнутый (Ctrl+Shift+S)"
              onClick={() => applyWrap("~~", "~~")}
            >
              <s>S</s>
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Заголовок"
              onClick={() => applyLinePrefix("## ")}
            >
              H2
            </button>
          </div>

          <div className="toolbar-group">
            <button
              className="toolbar__button"
              type="button"
              title="Маркированный список"
              onClick={() => applyLinePrefix("- ")}
            >
              •
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Нумерованный список"
              onClick={() => applyLinePrefix("1. ")}
            >
              1.
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Чек-лист (Ctrl+Shift+C)"
              onClick={() => applyLinePrefix("- [ ] ")}
            >
              ☑
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Стрелочный список"
              onClick={() => applyLinePrefix("→ ")}
            >
              →
            </button>
          </div>

          <div className="toolbar-group">
            <button
              className="toolbar__button"
              type="button"
              title="Цитата"
              onClick={() => applyLinePrefix("> ")}
            >
              ❝
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Код"
              onClick={() => applyWrap("`", "`")}
            >
              {"</>"}
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Блок кода"
              onClick={() => insertBlock("```\nкод\n```\n")}
            >
              {"{ }"}
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Ссылка"
              onClick={() => applyWrap("[", "](https://)", "ссылка")}
            >
              ↗
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Разделитель"
              onClick={() => insertBlock("\n---\n")}
            >
              ―
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Таблица"
              onClick={() => insertBlock(`\n${TABLE_SNIPPET}`)}
            >
              ▦
            </button>
          </div>

          <div className="toolbar-group toolbar-group--modes" role="tablist" aria-label="Режим">
            {MODES.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={mode === item.value}
                title={item.title}
                className={`toolbar__button${mode === item.value ? " toolbar__button--active" : ""}`}
                onClick={() => onModeChange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {inTrash && (
        <p className="trash-banner">
          Заметка в корзине с {note.deletedAt ? formatDate(note.deletedAt) : "недавно"}. Её можно
          вернуть или удалить окончательно.
        </p>
      )}

      <div
        className={`editor__content editor__content--${inTrash ? "preview" : mode}`}
        style={
          {
            "--editor-font-size": `${fontSize}px`,
            "--editor-width": `${lineWidth}px`,
          } as CSSProperties
        }
      >
        {!inTrash && mode !== "preview" && (
          <textarea
            ref={textareaRef}
            className="editor__body"
            value={note.body}
            placeholder="Начните печатать… Поддерживается Markdown: # заголовок, **жирный**, - [ ] чек-лист, → стрелка."
            aria-label="Текст заметки"
            spellCheck
            onChange={(event) => onEdit({ title: note.title, body: event.target.value })}
            onKeyDown={handleBodyKeyDown}
          />
        )}

        {(inTrash || mode !== "edit") && (
          <div
            ref={previewRef}
            className="markdown"
            onClick={handlePreviewClick}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}

        {inTrash && !note.body.trim() && <p className="markdown__empty">Пустая заметка</p>}
      </div>

      <footer className="editor__status">
        <span>{pluralizeWords(words)}</span>
        <span className={status === "saving" ? "status status--saving" : "status"}>
          {inTrash ? "Только чтение" : status === "saving" ? "Сохраняю…" : "Сохранено"}
        </span>
      </footer>
    </section>
  );
}
