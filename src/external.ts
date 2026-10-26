import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./api";

/** Ссылки из предпросмотра открываем в системном браузере, а не внутри окна. */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;

  try {
    if (isTauri) {
      await openUrl(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    console.error("Не удалось открыть ссылку", error);
  }
}
