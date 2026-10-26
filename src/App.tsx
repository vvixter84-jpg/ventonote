import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, DEFAULT_SETTINGS, isTauri, toSummary } from "./api";
import CommandPalette from "./components/CommandPalette";
import Editor from "./components/Editor";
import SettingsDialog from "./components/SettingsDialog";
import Sidebar from "./components/Sidebar";
import ToastStack from "./components/ToastStack";
import type {
  Note,
  NoteSummary,
  SaveStatus,
  Settings,
  SidebarView,
  Toast,
  ToastAction,
  ToastKind,
} from "./types";

const SEARCH_DEBOUNCE_MS = 200;
const SAVE_DEBOUNCE_MS = 450;
const TOAST_TTL_MS = 4500;

export default function App() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<SidebarView>("notes");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [trashCount, setTrashCount] = useState(0);

  const activeRef = useRef<Note | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<{ id: number; title: string; body: string } | null>(null);
  const bootstrapped = useRef(false);
  const toastId = useRef(1);
  const viewRef = useRef<SidebarView>("notes");

  activeRef.current = active;
  viewRef.current = view;

  /* ------------------------------ уведомления ------------------------------ */

  const pushToast = useCallback((kind: ToastKind, text: string, action?: ToastAction) => {
    const id = toastId.current++;
    setToasts((prev) => [...prev.slice(-2), { id, kind, text, action }]);
    window.setTimeout(
      () => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
      TOAST_TTL_MS + (action ? 4000 : 0),
    );
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  /* --------------------------------- данные -------------------------------- */

  const refreshTrashCount = useCallback(async () => {
    try {
      const list = await api.listTrash();
      setTrashCount(list.length);
    } catch {
      // счётчик в сайдбаре — не повод падать
    }
  }, []);

  const refreshList = useCallback(
    async (searchQuery: string, targetView: SidebarView): Promise<NoteSummary[]> => {
      const list =
        targetView === "trash"
          ? await api.listTrash()
          : searchQuery.trim().length > 0
            ? await api.searchNotes(searchQuery)
            : await api.listNotes();

      setNotes(list);
      return list;
    },
    [],
  );

  const flushSave = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    const snapshot = pending.current;
    if (!snapshot) return;
    pending.current = null;

    try {
      const saved = await api.updateNote(snapshot.id, snapshot.title, snapshot.body);
      setStatus("saved");
      setNotes((prev) => prev.map((item) => (item.id === saved.id ? toSummary(saved) : item)));
      if (activeRef.current?.id === saved.id) setActive(saved);
    } catch (error) {
      // Не теряем текст: вернём снимок в очередь, следующее сохранение повторит попытку.
      pending.current = snapshot;
      pushToast("error", `Не удалось сохранить: ${String(error)}`);
    }
  }, [pushToast]);

  const openNote = useCallback(
    async (id: number) => {
      if (activeRef.current?.id === id) return;
      await flushSave();
      const note = await api.getNote(id);
      setActive(note);
      setStatus("saved");
    },
    [flushSave],
  );

  /** Перечитывает текущий список и выбирает подходящую заметку. */
  const reload = useCallback(
    async (preferredId?: number | null) => {
      const targetView = viewRef.current;
      const list = await refreshList(query, targetView);
      await refreshTrashCount();

      const keep = preferredId ?? activeRef.current?.id ?? null;
      const next = list.find((item) => item.id === keep) ?? list[0] ?? null;

      setActive(next ? await api.getNote(next.id) : null);
      setStatus("saved");
    },
    [query, refreshList, refreshTrashCount],
  );

  const createNote = useCallback(async () => {
    await flushSave();

    if (viewRef.current !== "notes") {
      setView("notes");
      viewRef.current = "notes";
    }

    const note = await api.createNote();
    setQuery("");
    setActive(note);
    setStatus("saved");
    setNotes((prev) => [toSummary(note), ...prev]);
    await refreshTrashCount();
  }, [flushSave, refreshTrashCount]);

  const switchView = useCallback(
    async (next: SidebarView) => {
      if (viewRef.current === next) return;
      await flushSave();
      setView(next);
      viewRef.current = next;
      setQuery("");

      const list = await refreshList("", next);
      setActive(list[0] ? await api.getNote(list[0].id) : null);
      setStatus("saved");
    },
    [flushSave, refreshList],
  );

  const trashActive = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return;

    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pending.current = null;

    try {
      await api.trashNote(current.id);
      pushToast("info", "Заметка в корзине", {
        label: "Вернуть",
        run: () => {
          void (async () => {
            await api.restoreNote(current.id);
            pushToast("success", "Заметка восстановлена");
            await reload(current.id);
          })();
        },
      });
      setActive(null);
      await reload(null);
    } catch (error) {
      pushToast("error", `Не удалось убрать заметку: ${String(error)}`);
    }
  }, [pushToast, reload]);

  const restoreActive = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return;

    try {
      await api.restoreNote(current.id);
      pushToast("success", "Заметка восстановлена");
      await reload(current.id);
    } catch (error) {
      pushToast("error", `Не удалось восстановить: ${String(error)}`);
    }
  }, [pushToast, reload]);

  const deleteForever = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return;

    const label = current.title.trim() || "Без названия";
    if (!window.confirm(`Удалить «${label}» навсегда? Восстановить уже не получится.`)) return;

    try {
      await api.deleteNoteForever(current.id);
      pushToast("success", "Заметка удалена навсегда");
      setActive(null);
      await reload(null);
    } catch (error) {
      pushToast("error", `Не удалось удалить: ${String(error)}`);
    }
  }, [pushToast, reload]);

  const emptyTrash = useCallback(async () => {
    if (trashCount === 0) return;
    if (!window.confirm(`Очистить корзину? Будет удалено заметок: ${trashCount}.`)) return;

    try {
      const removed = await api.emptyTrash();
      pushToast("success", `Корзина очищена: ${removed}`);
      await reload(null);
    } catch (error) {
      pushToast("error", `Не удалось очистить корзину: ${String(error)}`);
    }
  }, [pushToast, reload, trashCount]);

  /* ------------------------------ экспорт/импорт ---------------------------- */

  const exportNotes = useCallback(async () => {
    if (!isTauri) {
      pushToast("error", "Экспорт доступен только в приложении");
      return;
    }

    try {
      const dir = await open({ directory: true, title: "Куда сохранить заметки" });
      if (!dir) return;

      await flushSave();
      const count = await api.exportNotes(String(dir));
      pushToast("success", `Экспортировано заметок: ${count}`);
    } catch (error) {
      pushToast("error", `Экспорт не удался: ${String(error)}`);
    }
  }, [flushSave, pushToast]);

  const importNotes = useCallback(async () => {
    if (!isTauri) {
      pushToast("error", "Импорт доступен только в приложении");
      return;
    }

    try {
      const picked = await open({
        multiple: false,
        title: "Выберите markdown-файл",
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
      });
      if (typeof picked !== "string") return;

      const note = await api.importNote(picked);
      pushToast("success", `Импортировано: «${note.title || "Без названия"}»`);

      if (viewRef.current !== "notes") {
        setView("notes");
        viewRef.current = "notes";
        setQuery("");
      }
      await reload(note.id);
    } catch (error) {
      pushToast("error", `Импорт не удался: ${String(error)}`);
    }
  }, [pushToast, reload]);

  /* -------------------------------- настройки ------------------------------- */

  const applySettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        void api.saveSettings(next).catch(() => pushToast("error", "Не удалось сохранить настройки"));
        return next;
      });
    },
    [pushToast],
  );

  /* --------------------------------- эффекты -------------------------------- */

  // Первичная загрузка: настройки, список, активная заметка.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await api.getSettings().catch(() => DEFAULT_SETTINGS);
        if (cancelled) return;
        setSettings(loaded);

        let list = await api.listNotes();
        if (cancelled) return;

        if (list.length === 0) {
          const note = await api.createNote();
          list = [toSummary(note)];
          if (!cancelled) setActive(note);
        } else {
          const note = await api.getNote(list[0].id);
          if (!cancelled) setActive(note);
        }

        if (!cancelled) {
          setNotes(list);
          await refreshTrashCount();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshTrashCount]);

  // Тема: светлая / тёмная / как в системе.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
      document.documentElement.dataset.theme = resolved;
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

  // Поиск с задержкой, чтобы не дёргать SQLite на каждую букву.
  useEffect(() => {
    if (!bootstrapped.current || view !== "notes") return;
    const timer = window.setTimeout(() => {
      void refreshList(query, "notes");
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, refreshList, view]);

  const handleEdit = useCallback(
    (patch: { title: string; body: string }) => {
      setActive((current) => (current ? { ...current, ...patch } : current));

      const current = activeRef.current;
      if (!current) return;

      pending.current = { id: current.id, title: patch.title, body: patch.body };
      setStatus("saving");
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  // Горячие клавиши.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();

      if (key === "n") {
        event.preventDefault();
        void createNote();
      } else if (key === "s") {
        event.preventDefault();
        void flushSave();
      } else if (key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (key === ",") {
        event.preventDefault();
        setSettingsOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createNote, flushSave]);

  // Не теряем последние нажатия: фокус ушёл, вкладка скрылась, прошло две секунды.
  useEffect(() => {
    const flush = () => {
      void flushSave();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => {
      if (pending.current) flush();
    }, 2000);

    return () => {
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [flushSave]);

  // Закрытие окна: сначала сохраняем, потом закрываемся.
  useEffect(() => {
    if (!isTauri) return;

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const window_ = getCurrentWindow();

      const stop = await window_.onCloseRequested(async (event) => {
        if (!pending.current) return;
        event.preventDefault();
        try {
          await flushSave();
        } finally {
          await window_.destroy();
        }
      });

      if (disposed) stop();
      else unlisten = stop;
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [flushSave]);

  /* --------------------------------- разметка -------------------------------- */

  return (
    <div className="app">
      <Sidebar
        notes={notes}
        activeId={active?.id ?? null}
        query={query}
        view={view}
        loading={loading}
        trashCount={trashCount}
        onQueryChange={setQuery}
        onSelect={(id) => {
          void openNote(id);
        }}
        onCreate={() => {
          void createNote();
        }}
        onViewChange={(next) => {
          void switchView(next);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <Editor
        note={active}
        status={status}
        mode={settings.editorMode}
        fontSize={settings.fontSize}
        lineWidth={settings.lineWidth}
        onEdit={handleEdit}
        onModeChange={(mode) => applySettings({ editorMode: mode })}
        onTrash={() => {
          void trashActive();
        }}
        onRestore={() => {
          void restoreActive();
        }}
        onDeleteForever={() => {
          void deleteForever();
        }}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(id) => {
          void openNote(id);
        }}
      />

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          trashCount={trashCount}
          onChange={applySettings}
          onClose={() => setSettingsOpen(false)}
          onExport={() => {
            void exportNotes();
          }}
          onImport={() => {
            void importNotes();
          }}
          onEmptyTrash={() => {
            void emptyTrash();
          }}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
