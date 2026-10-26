import { useMemo, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { formatDate, pluralizeWords } from "../format";
import { openExternal } from "../external";
import { renderMarkdown } from "../markdown";
import type { EditorMode, Note, SaveStatus } from "../types";

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
  const html = useMemo(() => (note ? renderMarkdown(note.body) : ""), [note]);

  if (!note) {
    return (
      <section className="editor editor--empty">
        <div className="empty-state">
          <span className="empty-state__mark">V</span>
          <p>Выберите заметку слева или нажмите Ctrl+N.</p>
          <p className="empty-state__hint">Markdown, поиск и корзина — всё уже внутри.</p>
        </div>
      </section>
    );
  }

  const inTrash = note.deletedAt !== null;
  const words = note.body.split(/\s+/).filter(Boolean).length;

  function applyWrap(prefix: string, suffix: string) {
    if (!note) return;
    const element = textareaRef.current;
    if (!element) return;

    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = note.body.slice(start, end) || "текст";
    const next = `${note.body.slice(0, start)}${prefix}${selected}${suffix}${note.body.slice(end)}`;
    onEdit({ title: note.title, body: next });

    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  function applyLinePrefix(marker: string) {
    if (!note) return;
    const element = textareaRef.current;
    if (!element) return;

    const start = element.selectionStart;
    const lineStart = note.body.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const next = `${note.body.slice(0, lineStart)}${marker}${note.body.slice(lineStart)}`;
    onEdit({ title: note.title, body: next });

    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + marker.length, start + marker.length);
    });
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute("href") ?? "";
    void openExternal(href);
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
              title="Заголовок"
              onClick={() => applyLinePrefix("## ")}
            >
              H2
            </button>
            <button
              className="toolbar__button"
              type="button"
              title="Список"
              onClick={() => applyLinePrefix("- ")}
            >
              •
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
              title="Ссылка"
              onClick={() => applyWrap("[", "](https://)")}
            >
              ↗
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
            placeholder="Начните печатать… Поддерживается Markdown: # заголовок, **жирный**, - список."
            aria-label="Текст заметки"
            spellCheck
            onChange={(event) => onEdit({ title: note.title, body: event.target.value })}
            onKeyDown={handleBodyKeyDown}
          />
        )}

        {(inTrash || mode !== "edit") && (
          <div
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
