import { formatDate, pluralizeWords } from "../format";
import type { NoteSummary, SidebarView } from "../types";

interface SidebarProps {
  notes: NoteSummary[];
  activeId: number | null;
  query: string;
  view: SidebarView;
  loading: boolean;
  trashCount: number;
  onQueryChange: (value: string) => void;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onViewChange: (view: SidebarView) => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
}

export default function Sidebar({
  notes,
  activeId,
  query,
  view,
  loading,
  trashCount,
  onQueryChange,
  onSelect,
  onCreate,
  onViewChange,
  onOpenSettings,
  onOpenPalette,
}: SidebarProps) {
  const isTrash = view === "trash";

  return (
    <aside className="sidebar">
      <header className="brand">
        <span className="brand__mark" aria-hidden="true">
          V
        </span>
        <span className="brand__text">
          <span className="brand__name">VentoNote</span>
          <span className="brand__hint">заметки без хлама</span>
        </span>
        <button
          className="icon-button"
          type="button"
          title="Настройки"
          aria-label="Настройки"
          onClick={onOpenSettings}
        >
          ⚙
        </button>
      </header>

      <div className="search-row">
        <input
          className="search"
          type="search"
          value={query}
          disabled={isTrash}
          placeholder={isTrash ? "Корзина" : "Поиск по заметкам"}
          aria-label="Поиск по заметкам"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {!isTrash && (
          <button
            className="search-row__hint"
            type="button"
            title="Быстрый переход по заметкам"
            onClick={onOpenPalette}
          >
            Ctrl K
          </button>
        )}
      </div>

      <button className="new-note" type="button" onClick={onCreate}>
        <span className="new-note__plus" aria-hidden="true">
          +
        </span>
        Новая заметка
        <kbd className="new-note__kbd">Ctrl N</kbd>
      </button>

      <div className="view-switch" role="tablist" aria-label="Разделы">
        <button
          type="button"
          role="tab"
          aria-selected={!isTrash}
          className={`view-switch__item${!isTrash ? " view-switch__item--active" : ""}`}
          onClick={() => onViewChange("notes")}
        >
          Заметки
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isTrash}
          className={`view-switch__item${isTrash ? " view-switch__item--active" : ""}`}
          onClick={() => onViewChange("trash")}
        >
          Корзина{trashCount > 0 ? ` · ${trashCount}` : ""}
        </button>
      </div>

      <div className="note-list">
        {loading && <p className="note-list__empty">Загружаем…</p>}

        {!loading && notes.length === 0 && (
          <p className="note-list__empty">
            {isTrash
              ? "Корзина пуста. Всё, что удалите, полежит здесь."
              : query.trim().length > 0
                ? "Ничего не найдено. Попробуйте другое слово."
                : "Пока пусто. Создайте первую заметку."}
          </p>
        )}

        {notes.map((note) => (
          <button
            key={note.id}
            type="button"
            className={`note-item${note.id === activeId ? " note-item--active" : ""}`}
            onClick={() => onSelect(note.id)}
          >
            <span className="note-item__title">{note.title.trim() || "Без названия"}</span>
            <span className="note-item__preview">{note.preview || "Пустая заметка"}</span>
            <span className="note-item__meta">
              {isTrash && note.deletedAt
                ? `удалена ${formatDate(note.deletedAt)}`
                : formatDate(note.updatedAt)}{" "}
              · {pluralizeWords(note.words)}
            </span>
          </button>
        ))}
      </div>

      <footer className="sidebar__footer">
        <span>Markdown</span>
        <span>·</span>
        <span>Ctrl K — переход</span>
      </footer>
    </aside>
  );
}
