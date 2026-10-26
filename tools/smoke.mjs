// Дымовой тест IPC: проверяет команды Rust через отладочный порт WebView2.
//
//   pnpm tauri:build:local
//   Remove-Item src-tauri/target/release/app-data -Recurse -Force
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
//   ./src-tauri/target/release/ventonote.exe
//   pnpm smoke

import path from "node:path";

const LIST_URL = "http://127.0.0.1:9222/json/list";
const exportDir = path.resolve("src-tauri/target/smoke-export");

const expression = `(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const exportDir = ${JSON.stringify(exportDir)};

  const initial = await invoke("list_notes");
  const id = initial[0].id;

  await invoke("update_note", { id, title: "Ветер", body: "Заметка про ветер и море" });
  const found = await invoke("search_notes", { query: "ветер" });
  const byPrefix = await invoke("search_notes", { query: "замет" });

  await invoke("trash_note", { id });
  const afterTrash = await invoke("list_notes");
  const trash = await invoke("list_trash");

  await invoke("restore_note", { id });
  const afterRestore = await invoke("list_notes");

  const settingsBefore = await invoke("get_settings");
  const settingsAfter = await invoke("save_settings", {
    settings: { ...settingsBefore, theme: "dark", fontSize: 17 },
  });

  const exported = await invoke("export_notes", { dir: exportDir });
  const imported = await invoke("import_note", { path: exportDir + "\\\\ветер.md" });
  const finalList = await invoke("list_notes");

  return JSON.stringify({
    initialCount: initial.length,
    title: afterRestore[0]?.title,
    words: afterRestore[0]?.words,
    found: found.map((note) => note.title),
    byPrefix: byPrefix.map((note) => note.title),
    afterTrashCount: afterTrash.length,
    trashCount: trash.length,
    afterRestoreCount: afterRestore.length,
    settings: settingsAfter,
    exported,
    importedTitle: imported.title,
    finalCount: finalList.length,
  });
})()`;

async function main() {
  const targets = await (await fetch(LIST_URL)).json();
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("не найден page-таргет WebView2");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  const reply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("таймаут CDP")), 20000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    });
    socket.send(
      JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true },
      }),
    );
  });

  if (reply.exceptionDetails) {
    throw new Error(`исключение в вебвью: ${JSON.stringify(reply.exceptionDetails)}`);
  }

  const result = JSON.parse(reply.result.value);
  console.log(JSON.stringify(result, null, 2));

  const checks = [
    ["заметка сохранена", result.title === "Ветер"],
    ["поиск по слову", result.found.length === 1],
    ["поиск по префиксу", result.byPrefix.length === 1],
    ["корзина скрывает заметку", result.afterTrashCount === 0 && result.trashCount === 1],
    ["восстановление возвращает", result.afterRestoreCount === 1],
    ["настройки сохраняются", result.settings.theme === "dark" && result.settings.fontSize === 17],
    ["экспорт в .md", result.exported === 1],
    ["импорт .md", result.importedTitle === "Ветер"],
    ["после импорта две заметки", result.finalCount === 2],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${name}`);

  socket.close();
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error("smoke test failed:", error.message);
  process.exit(1);
});
