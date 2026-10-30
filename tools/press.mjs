// Выполняет JS в вебвью приложения (нужен --remote-debugging-port=9222)
// и печатает результат. Удобно для быстрых проверок руками.
//
//   node tools/press.mjs "document.querySelectorAll('input').length"

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((target) => target.type === "page");
if (!page) {
  console.error("нет page-таргета: приложение запущено с отладочным портом?");
  process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const reply = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("таймаут CDP")), 15000);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    clearTimeout(timer);
    resolve(message);
  });
  socket.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression: process.argv[2], returnByValue: true, awaitPromise: true },
    }),
  );
});

console.log(JSON.stringify(reply.result ?? reply, null, 2));
socket.close();
