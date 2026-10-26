export interface Note {
  id: number;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface NoteSummary {
  id: number;
  title: string;
  preview: string;
  words: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type SaveStatus = "saved" | "saving";

export type EditorMode = "edit" | "split" | "preview";

export type Theme = "light" | "dark" | "system";

export interface Settings {
  theme: Theme;
  fontSize: number;
  editorMode: EditorMode;
  lineWidth: number;
}

export type ToastKind = "info" | "success" | "error";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: ToastAction;
}

export type SidebarView = "notes" | "trash";
