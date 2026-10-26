// Вспомогательный скрипт для скриншотов: наполняет заметку и переключает тему.
// Запускается против приложения с --remote-debugging-port=9222.
const theme = process.argv[2] ?? "light";
const mode = process.argv[3] ?? "split";

const rich = `# Ветер

Северный ветер принёс **холод** и запах моря. Хочется записать всё, пока не забылось.

## Что заметить
- как гнутся тополя у школы
- свет в 17:40 стал ниже и жёлтее
- на набережной пахнет водорослями

> Хорошая погода для долгой прогулки.

Потом посмотреть \`weather.log\` и добавить пару строк.`;

const expression = `(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const list = await invoke("list_notes");
  const id = list[list.length - 1].id;
  await invoke("update_note", { id, title: "Ветер", body: ${JSON.stringify(rich)} });
  await invoke("save_settings", {
    settings: { theme: ${JSON.stringify(theme)}, fontSize: 16, editorMode: ${JSON.stringify(mode)}, lineWidth: 720 },
  });
  location.reload();
  return "ok";
})()`;

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((target) => target.type === "page");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
socket.send(
  JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression, awaitPromise: true, returnByValue: true },
  }),
);
await new Promise((resolve) => setTimeout(resolve, 2500));
socket.close();
console.log("ok");
