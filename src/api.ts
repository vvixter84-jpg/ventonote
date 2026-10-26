import { invoke } from "@tauri-apps/api/core";
import type { Note, NoteSummary, Settings } from "./types";

/**
 * В окне Tauri вызываем Rust-команды, в обычном браузере (pnpm dev) —
 * localStorage-заглушку, чтобы верстать интерфейс без сборки Rust.
 */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  fontSize: 16,
  editorMode: "edit",
  lineWidth: 760,
};

export function toSummary(note: Note): NoteSummary {
  const plain = note.body
    .split("\n")
    .map((line) =>
      line
        .trimStart()
        .replace(/^#+\s*/, "")
        .replace(/^>\s*/, "")
        .replace(/^-\s*/, "")
        .trim(),
    )
    .join(" ")
    .replace(/[*`~]/g, "");

  const flat = plain.replace(/\s+/g, " ").trim();

  return {
    id: note.id,
    title: note.title,
    preview: flat.slice(0, 160),
    words: flat.length === 0 ? 0 : flat.split(/\s+/).length,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Заглушка для браузера                                               */
/* ------------------------------------------------------------------ */

const MOCK_KEY = "ventonote.mock.v2";
const MOCK_SETTINGS_KEY = "ventonote.mock.settings.v1";

interface MockDb {
  nextId: number;
  notes: Note[];
}

function readMock(): MockDb {
  try {
    const raw = window.localStorage.getItem(MOCK_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    // повреждённое хранилище — начинаем с чистой доски
  }
  return { nextId: 1, notes: [] };
}

function writeMock(db: MockDb): void {
  window.localStorage.setItem(MOCK_KEY, JSON.stringify(db));
}

function byUpdated(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

const mock = {
  async list(): Promise<NoteSummary[]> {
    return byUpdated(readMock().notes.filter((note) => note.deletedAt === null)).map(toSummary);
  },

  async listTrash(): Promise<NoteSummary[]> {
    return readMock()
      .notes.filter((note) => note.deletedAt !== null)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
      .map(toSummary);
  },

  async search(query: string): Promise<NoteSummary[]> {
    const needle = query.trim().toLowerCase();
    return byUpdated(
      readMock().notes.filter(
        (note) =>
          note.deletedAt === null &&
          (note.title.toLowerCase().includes(needle) || note.body.toLowerCase().includes(needle)),
      ),
    ).map(toSummary);
  },

  async get(id: number): Promise<Note> {
    const found = readMock().notes.find((note) => note.id === id);
    if (!found) throw new Error(`Заметка ${id} не найдена`);
    return found;
  },

  async create(): Promise<Note> {
    const db = readMock();
    const now = Date.now();
    const note: Note = {
      id: db.nextId,
      title: "",
      body: "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    db.nextId += 1;
    db.notes.push(note);
    writeMock(db);
    return note;
  },

  async update(id: number, title: string, body: string): Promise<Note> {
    const db = readMock();
    const note = db.notes.find((item) => item.id === id);
    if (!note || note.deletedAt !== null) throw new Error(`Заметка ${id} недоступна`);
    note.title = title;
    note.body = body;
    note.updatedAt = Date.now();
    writeMock(db);
    return note;
  },

  async trash(id: number): Promise<void> {
    const db = readMock();
    const note = db.notes.find((item) => item.id === id);
    if (!note) throw new Error(`Заметка ${id} не найдена`);
    note.deletedAt = Date.now();
    writeMock(db);
  },

  async restore(id: number): Promise<void> {
    const db = readMock();
    const note = db.notes.find((item) => item.id === id);
    if (!note) throw new Error(`Заметка ${id} не найдена`);
    note.deletedAt = null;
    note.updatedAt = Date.now();
    writeMock(db);
  },

  async remove(id: number): Promise<void> {
    const db = readMock();
    db.notes = db.notes.filter((item) => item.id !== id);
    writeMock(db);
  },

  async emptyTrash(): Promise<number> {
    const db = readMock();
    const before = db.notes.length;
    db.notes = db.notes.filter((item) => item.deletedAt === null);
    writeMock(db);
    return before - db.notes.length;
  },

  async getSettings(): Promise<Settings> {
    try {
      const raw = window.localStorage.getItem(MOCK_SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      // игнорируем повреждённые настройки
    }
    return DEFAULT_SETTINGS;
  },

  async saveSettings(settings: Settings): Promise<Settings> {
    window.localStorage.setItem(MOCK_SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  },
};

/* ------------------------------------------------------------------ */
/* Публичный API                                                       */
/* ------------------------------------------------------------------ */

export const api = {
  listNotes(): Promise<NoteSummary[]> {
    return isTauri ? invoke<NoteSummary[]>("list_notes") : mock.list();
  },

  listTrash(): Promise<NoteSummary[]> {
    return isTauri ? invoke<NoteSummary[]>("list_trash") : mock.listTrash();
  },

  searchNotes(query: string): Promise<NoteSummary[]> {
    return isTauri ? invoke<NoteSummary[]>("search_notes", { query }) : mock.search(query);
  },

  getNote(id: number): Promise<Note> {
    return isTauri ? invoke<Note>("get_note", { id }) : mock.get(id);
  },

  createNote(): Promise<Note> {
    return isTauri ? invoke<Note>("create_note") : mock.create();
  },

  updateNote(id: number, title: string, body: string): Promise<Note> {
    return isTauri
      ? invoke<Note>("update_note", { id, title, body })
      : mock.update(id, title, body);
  },

  trashNote(id: number): Promise<void> {
    return isTauri ? invoke<void>("trash_note", { id }) : mock.trash(id);
  },

  restoreNote(id: number): Promise<void> {
    return isTauri ? invoke<void>("restore_note", { id }) : mock.restore(id);
  },

  deleteNoteForever(id: number): Promise<void> {
    return isTauri ? invoke<void>("delete_note", { id }) : mock.remove(id);
  },

  emptyTrash(): Promise<number> {
    return isTauri ? invoke<number>("empty_trash") : mock.emptyTrash();
  },

  exportNotes(dir: string): Promise<number> {
    if (!isTauri) return Promise.reject(new Error("Экспорт доступен только в приложении"));
    return invoke<number>("export_notes", { dir });
  },

  importNote(path: string): Promise<Note> {
    if (!isTauri) return Promise.reject(new Error("Импорт доступен только в приложении"));
    return invoke<Note>("import_note", { path });
  },

  getSettings(): Promise<Settings> {
    return isTauri ? invoke<Settings>("get_settings") : mock.getSettings();
  },

  saveSettings(settings: Settings): Promise<Settings> {
    return isTauri ? invoke<Settings>("save_settings", { settings }) : mock.saveSettings(settings);
  },
};
