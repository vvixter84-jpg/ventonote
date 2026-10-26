import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api } from "../api";
import { formatDate } from "../format";
import type { NoteSummary } from "../types";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (id: number) => void;
}

const LIMIT = 8;

export default function CommandPalette({ open, onClose, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteSummary[]>([]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // При открытии показываем недавние заметки и ставим курсор в поле.
  useEffect(() => {
    if (!open) return;

    setQuery("");
    setIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);

    void api.listNotes().then((list) => setResults(list.slice(0, LIMIT)));

    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        const list = query.trim().length > 0 ? await api.searchNotes(query) : await api.listNotes();
        setResults(list.slice(0, LIMIT));
        setIndex(0);
      })();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[index];
      if (target) {
        onSelect(target.id);
        onClose();
      }
    }
  }

  return (
    <div className="overlay overlay--top" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Быстрый переход"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette__input"
          value={query}
          placeholder="Перейти к заметке…"
          aria-label="Поиск заметки"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className="palette__list">
          {results.length === 0 && <p className="palette__empty">Ничего не найдено</p>}

          {results.map((note, position) => (
            <button
              key={note.id}
              type="button"
              className={`palette__item${position === index ? " palette__item--active" : ""}`}
              onMouseEnter={() => setIndex(position)}
              onClick={() => {
                onSelect(note.id);
                onClose();
              }}
            >
              <span className="palette__title">{note.title.trim() || "Без названия"}</span>
              <span className="palette__meta">{formatDate(note.updatedAt)}</span>
            </button>
          ))}
        </div>

        <footer className="palette__footer">
          <span>↑↓ выбрать</span>
          <span>Enter открыть</span>
          <span>Esc закрыть</span>
        </footer>
      </div>
    </div>
  );
}
