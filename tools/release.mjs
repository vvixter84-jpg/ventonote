// Собирает установщик и кладёт его туда, откуда его можно запустить.
//
// Зачем: в этой рабочей папке действует песочница — программа, запущенная
// из-под неё, не может писать за пределы папки. Установщик как раз пишет
// в %LOCALAPPDATA%\VentoNote, поэтому из target/bundle/nsis он падает с
// кодом 2 и ничего не устанавливает. Копия на рабочем столе работает.
//
//   pnpm release

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tauri = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const config = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));

console.log("→ сборка приложения и установщика…");
const build = spawnSync(process.execPath, [tauri, "build"], { cwd: root, stdio: "inherit" });

if (build.status !== 0) {
  console.error("сборка не удалась");
  process.exit(build.status ?? 1);
}

const bundleDir = join(root, "src-tauri", "target", "release", "bundle", "nsis");
const setupName = readdirSync(bundleDir).find((name) => name.endsWith("-setup.exe"));

if (!setupName) {
  console.error(`не нашёл установщик в ${bundleDir}`);
  process.exit(1);
}

const desktop = join(homedir(), "Desktop");
const targetDir = existsSync(desktop) ? desktop : homedir();
mkdirSync(targetDir, { recursive: true });

const target = join(targetDir, `VentoNote-${config.version}-setup.exe`);
copyFileSync(join(bundleDir, setupName), target);

console.log("");
console.log(`Готово: ${target}`);
console.log("Запускайте установщик именно отсюда, а не из рабочей папки проекта.");
