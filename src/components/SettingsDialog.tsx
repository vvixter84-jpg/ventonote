import { useEffect } from "react";
import type { Settings, Theme } from "../types";

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "system", label: "Как в системе" },
];

interface SettingsDialogProps {
  settings: Settings;
  trashCount: number;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  onEmptyTrash: () => void;
}

export default function SettingsDialog({
  settings,
  trashCount,
  onChange,
  onClose,
  onExport,
  onImport,
  onEmptyTrash,
}: SettingsDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Настройки"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <h2>Настройки</h2>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>

        <section className="dialog__section">
          <h3>Оформление</h3>
          <div className="segmented">
            {THEMES.map((theme) => (
              <button
                key={theme.value}
                type="button"
                className={`segmented__item${settings.theme === theme.value ? " segmented__item--active" : ""}`}
                onClick={() => onChange({ theme: theme.value })}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </section>

        <section className="dialog__section">
          <h3>Текст</h3>
          <label className="field">
            <span className="field__label">
              Размер шрифта <output>{settings.fontSize}px</output>
            </span>
            <input
              type="range"
              min={13}
              max={24}
              step={1}
              value={settings.fontSize}
              onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            <span className="field__label">
              Ширина колонки <output>{settings.lineWidth}px</output>
            </span>
            <input
              type="range"
              min={560}
              max={1100}
              step={20}
              value={settings.lineWidth}
              onChange={(event) => onChange({ lineWidth: Number(event.target.value) })}
            />
          </label>
        </section>

        <section className="dialog__section">
          <h3>Данные</h3>
          <div className="dialog__row">
            <button className="button" type="button" onClick={onExport}>
              Экспорт в .md
            </button>
            <button className="button" type="button" onClick={onImport}>
              Импорт .md
            </button>
          </div>
          <div className="dialog__row">
            <button
              className="button button--danger"
              type="button"
              disabled={trashCount === 0}
              onClick={onEmptyTrash}
            >
              Очистить корзину{trashCount > 0 ? ` (${trashCount})` : ""}
            </button>
          </div>
          <p className="dialog__hint">
            Резервные копии базы лежат рядом с данными приложения, последние десять.
          </p>
        </section>

        <footer className="dialog__footer">
          <span className="dialog__hint">Markdown · Ctrl+N заметка · Ctrl+K переход</span>
          <button className="button" type="button" onClick={onClose}>
            Готово
          </button>
        </footer>
      </div>
    </div>
  );
}
