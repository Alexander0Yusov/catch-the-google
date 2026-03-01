/**
 * Проверка миграции для CI и локального контроля.
 * Скрипт не применяет миграции к БД, а валидирует,
 * что SQL-файл существует и содержит обязательные таблицы *_2.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationPath = path.join(__dirname, "..", "back", "migrations", "001_init_2.sql");

const requiredFragments = [
  "players_2",
  "game_sessions_2",
  "game_events_2",
  "scores_2",
];

const sql = await readFile(migrationPath, "utf8");

const missing = requiredFragments.filter((fragment) => !sql.includes(fragment));

if (missing.length > 0) {
  console.error("Migration validation failed. Missing fragments:", missing);
  process.exit(1);
}

console.log("Migration validation passed.");
