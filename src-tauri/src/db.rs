use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

/// Схема первой версии. Следующие изменения оформляем как MIGRATION_V2 и т.д.,
/// поднимая `PRAGMA user_version`.
const MIGRATION_V1: &str = r#"
CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL DEFAULT '',
    body       TEXT    NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at DESC);

-- Полнотекстовый индекс. unicode61 понимает кириллицу, а prefix '2 3' нужен,
-- чтобы запрос «замет» находил «заметка», «заметки», «заметкам».
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    body,
    content = 'notes',
    content_rowid = 'id',
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3'
);

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts (rowid, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts (notes_fts, rowid, title, body)
    VALUES ('delete', old.id, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts (notes_fts, rowid, title, body)
    VALUES ('delete', old.id, old.title, old.body);
    INSERT INTO notes_fts (rowid, title, body) VALUES (new.id, new.title, new.body);
END;
"#;

/// Корзина и настройки интерфейса.
const MIGRATION_V2: &str = r#"
ALTER TABLE notes ADD COLUMN deleted_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes (deleted_at);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

/// Сколько резервных копий держим рядом с базой.
const BACKUPS_TO_KEEP: usize = 10;
/// Не чаще одной резервной копии в час.
const BACKUP_INTERVAL_SECS: u64 = 60 * 60;

/// Открывает базу и доводит схему до актуальной версии.
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    migrate(&conn)?;
    Ok(conn)
}

/// База в памяти — используется в тестах.
#[cfg(test)]
pub fn open_memory() -> rusqlite::Result<Connection> {
    let conn = Connection::open_in_memory()?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let mut version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    if version < 1 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(MIGRATION_V1)?;
        tx.pragma_update(None, "user_version", 1)?;
        tx.commit()?;
        version = 1;
    }

    if version < 2 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(MIGRATION_V2)?;
        tx.pragma_update(None, "user_version", 2)?;
        tx.commit()?;
    }

    Ok(())
}

/// Снимает резервную копию базы в `dir`, если последняя копия старше часа.
/// Старые копии сверх лимита удаляются.
pub fn backup(conn: &Connection, dir: &Path) -> std::io::Result<Option<PathBuf>> {
    std::fs::create_dir_all(dir)?;

    let mut backups = backups_in(dir)?;
    backups.sort_by_key(|(_, modified)| std::cmp::Reverse(*modified));

    if let Some((_, modified)) = backups.first() {
        if now_secs().saturating_sub(*modified) < BACKUP_INTERVAL_SECS {
            return Ok(None);
        }
    }

    let target = dir.join(format!("ventonote-{}.db", now_secs()));
    if target.exists() {
        return Ok(None);
    }

    conn.execute("VACUUM INTO ?1", [target.to_string_lossy().as_ref()])
        .map_err(std::io::Error::other)?;

    for (path, _) in backups.into_iter().skip(BACKUPS_TO_KEEP - 1) {
        let _ = std::fs::remove_file(path);
    }

    Ok(Some(target))
}

fn backups_in(dir: &Path) -> std::io::Result<Vec<(PathBuf, u64)>> {
    let mut result = Vec::new();

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.extension().is_some_and(|ext| ext == "db") {
            continue;
        }
        let modified = entry
            .metadata()?
            .modified()?
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or(0);
        result.push((path, modified));
    }

    Ok(result)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();

        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 2);

        let has_deleted_at: i64 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('notes') WHERE name = 'deleted_at'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(has_deleted_at, 1);
    }

    #[test]
    fn backup_creates_file_and_skips_recent() {
        // Каталог внутри проекта: тесты не должны зависеть от прав на системный temp.
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-tmp")
            .join(format!("backup-{}", now_secs()));
        let _ = std::fs::remove_dir_all(&dir);

        let conn = open_memory().unwrap();
        conn.execute("INSERT INTO notes (title, body, created_at, updated_at) VALUES ('a','b',1,1)", [])
            .unwrap();

        let first = backup(&conn, &dir).unwrap();
        assert!(first.is_some());

        let second = backup(&conn, &dir).unwrap();
        assert!(second.is_none(), "второй бэкап в течение часа не нужен");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
