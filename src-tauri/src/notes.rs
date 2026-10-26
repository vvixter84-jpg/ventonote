use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: i64,
    pub title: String,
    pub preview: String,
    pub words: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

/// Активные заметки, свежие сверху.
pub fn list(conn: &Connection) -> rusqlite::Result<Vec<NoteSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, body, updated_at, deleted_at
         FROM notes
         WHERE deleted_at IS NULL
         ORDER BY updated_at DESC, id DESC",
    )?;
    let rows = stmt.query_map([], summary_from_row)?;
    rows.collect()
}

/// Содержимое корзины, недавно удалённые сверху.
pub fn list_trash(conn: &Connection) -> rusqlite::Result<Vec<NoteSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, body, updated_at, deleted_at
         FROM notes
         WHERE deleted_at IS NOT NULL
         ORDER BY deleted_at DESC, id DESC",
    )?;
    let rows = stmt.query_map([], summary_from_row)?;
    rows.collect()
}

/// Полнотекстовый поиск по заголовку и тексту среди активных заметок.
///
/// Каждый токен запроса превращается в префиксный запрос FTS5 (`"слово"*`),
/// поэтому «замет» находит «заметка», «заметки» и т.д. Спецсимволы FTS
/// вырезаются, чтобы пользователь не мог сломать синтаксис запроса.
pub fn search(conn: &Connection, query: &str) -> rusqlite::Result<Vec<NoteSummary>> {
    let fts_query = build_fts_query(query);
    if fts_query.is_empty() {
        return list(conn);
    }

    let mut stmt = conn.prepare(
        "SELECT n.id, n.title, n.body, n.updated_at, n.deleted_at
         FROM notes_fts
         JOIN notes n ON n.id = notes_fts.rowid
         WHERE notes_fts MATCH ?1 AND n.deleted_at IS NULL
         ORDER BY bm25(notes_fts), n.updated_at DESC
         LIMIT 300",
    )?;
    let rows = stmt.query_map([&fts_query], summary_from_row)?;
    rows.collect()
}

pub fn get(conn: &Connection, id: i64) -> rusqlite::Result<Option<Note>> {
    conn.query_row(
        "SELECT id, title, body, created_at, updated_at, deleted_at
         FROM notes WHERE id = ?1",
        [id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                deleted_at: row.get(5)?,
            })
        },
    )
    .optional()
}

/// Все активные заметки целиком — для экспорта в markdown.
pub fn export_all(conn: &Connection) -> rusqlite::Result<Vec<Note>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, body, created_at, updated_at, deleted_at
         FROM notes
         WHERE deleted_at IS NULL
         ORDER BY updated_at DESC, id DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            body: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            deleted_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn create(conn: &Connection) -> rusqlite::Result<Note> {
    create_with(conn, "", "")
}

pub fn create_with(conn: &Connection, title: &str, body: &str) -> rusqlite::Result<Note> {
    let now = now_millis();
    conn.execute(
        "INSERT INTO notes (title, body, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![title, body, now],
    )?;

    Ok(Note {
        id: conn.last_insert_rowid(),
        title: title.to_string(),
        body: body.to_string(),
        created_at: now,
        updated_at: now,
        deleted_at: None,
    })
}

pub fn update(
    conn: &Connection,
    id: i64,
    title: &str,
    body: &str,
) -> rusqlite::Result<Option<Note>> {
    let changed = conn.execute(
        "UPDATE notes SET title = ?1, body = ?2, updated_at = ?3 WHERE id = ?4 AND deleted_at IS NULL",
        params![title, body, now_millis(), id],
    )?;

    if changed == 0 {
        return Ok(None);
    }

    get(conn, id)
}

/// Мягкое удаление: заметка уезжает в корзину.
pub fn trash(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let changed = conn.execute(
        "UPDATE notes SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![now_millis(), id],
    )?;
    Ok(changed > 0)
}

pub fn restore(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let changed = conn.execute(
        "UPDATE notes SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NOT NULL",
        params![now_millis(), id],
    )?;
    Ok(changed > 0)
}

/// Окончательное удаление (только из корзины).
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    Ok(conn.execute("DELETE FROM notes WHERE id = ?1", [id])? > 0)
}

/// Полная очистка корзины. Возвращает число удалённых заметок.
pub fn empty_trash(conn: &Connection) -> rusqlite::Result<usize> {
    conn.execute("DELETE FROM notes WHERE deleted_at IS NOT NULL", [])
}

fn summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteSummary> {
    let body: String = row.get(2)?;

    Ok(NoteSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        preview: preview_of(&body),
        words: words_of(&body),
        updated_at: row.get(3)?,
        deleted_at: row.get(4)?,
    })
}

/// Превью без markdown-разметки: в списке не нужны «#», «**» и «-».
fn preview_of(body: &str) -> String {
    let plain = body
        .lines()
        .map(|line| {
            let line = line.trim_start();
            let line = line.trim_start_matches('#').trim_start();
            let line = line.trim_start_matches('>').trim_start();
            line.trim_start_matches("- ").trim_start()
        })
        .collect::<Vec<_>>()
        .join(" ")
        .replace(['*', '`', '~'], "");

    let flat = plain.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= 160 {
        return flat;
    }

    let mut preview: String = flat.chars().take(160).collect();
    preview.push('…');
    preview
}

fn words_of(body: &str) -> i64 {
    body.split_whitespace().count() as i64
}

fn build_fts_query(raw: &str) -> String {
    raw.split_whitespace()
        .map(|token| token.replace(['"', '*'], ""))
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{token}\"*"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn conn() -> Connection {
        db::open_memory().expect("не удалось открыть базу в памяти")
    }

    #[test]
    fn creates_and_lists_notes() {
        let conn = conn();
        let note = create(&conn).expect("create");

        let list = list(&conn).expect("list");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, note.id);
        assert_eq!(list[0].title, "");
        assert!(list[0].deleted_at.is_none());
    }

    #[test]
    fn updates_title_and_body() {
        let conn = conn();
        let note = create(&conn).unwrap();

        let updated = update(&conn, note.id, "Планы", "Купить хлеб")
            .unwrap()
            .expect("заметка должна найтись");

        assert_eq!(updated.title, "Планы");
        assert_eq!(updated.body, "Купить хлеб");
        assert!(updated.updated_at >= note.updated_at);
    }

    #[test]
    fn missing_note_returns_none() {
        let conn = conn();

        assert!(get(&conn, 999).unwrap().is_none());
        assert!(update(&conn, 999, "x", "y").unwrap().is_none());
        assert!(!delete(&conn, 999).unwrap());
        assert!(!trash(&conn, 999).unwrap());
        assert!(!restore(&conn, 999).unwrap());
    }

    #[test]
    fn finds_russian_word_forms_by_prefix() {
        let conn = conn();
        let note = create(&conn).unwrap();
        update(
            &conn,
            note.id,
            "Заметки о ветре",
            "Сегодня сильный ветер и заметка про погоду",
        )
        .unwrap();

        for query in ["замет", "заметка", "заметки", "ветер", "погод"] {
            let found = search(&conn, query).unwrap();
            assert_eq!(found.len(), 1, "запрос {query:?} должен найти заметку");
        }
    }

    #[test]
    fn search_survives_fts_syntax_in_input() {
        let conn = conn();
        let note = create(&conn).unwrap();
        update(&conn, note.id, "a", "b").unwrap();

        for query in ["\"", "*", "AND OR", "NEAR(a b)", "-минус", "()"] {
            assert!(
                search(&conn, query).is_ok(),
                "запрос {query:?} не должен ломать поиск"
            );
        }
    }

    #[test]
    fn deleted_notes_disappear_from_index() {
        let conn = conn();
        let note = create(&conn).unwrap();
        update(&conn, note.id, "Удаляемая", "уникальноеслово").unwrap();

        assert_eq!(search(&conn, "уникальноеслово").unwrap().len(), 1);

        assert!(delete(&conn, note.id).unwrap());
        assert!(search(&conn, "уникальноеслово").unwrap().is_empty());
        assert!(get(&conn, note.id).unwrap().is_none());
    }

    #[test]
    fn updated_note_is_reindexed() {
        let conn = conn();
        let note = create(&conn).unwrap();
        update(&conn, note.id, "Черновик", "староеслово").unwrap();
        update(&conn, note.id, "Черновик", "новоеслово").unwrap();

        assert!(search(&conn, "староеслово").unwrap().is_empty());
        assert_eq!(search(&conn, "новоеслово").unwrap().len(), 1);
    }

    #[test]
    fn trash_hides_note_and_restore_brings_it_back() {
        let conn = conn();
        let note = create(&conn).unwrap();
        update(&conn, note.id, "Ветер", "северный ветер").unwrap();

        assert!(trash(&conn, note.id).unwrap());
        assert!(list(&conn).unwrap().is_empty());
        assert!(search(&conn, "ветер").unwrap().is_empty(), "в поиске корзины быть не должно");
        assert_eq!(list_trash(&conn).unwrap().len(), 1);
        assert_eq!(get(&conn, note.id).unwrap().unwrap().deleted_at.is_some(), true);

        assert!(restore(&conn, note.id).unwrap());
        assert_eq!(list(&conn).unwrap().len(), 1);
        assert_eq!(search(&conn, "ветер").unwrap().len(), 1);
        assert!(list_trash(&conn).unwrap().is_empty());
    }

    #[test]
    fn trashed_note_cannot_be_edited() {
        let conn = conn();
        let note = create(&conn).unwrap();
        trash(&conn, note.id).unwrap();

        assert!(update(&conn, note.id, "x", "y").unwrap().is_none());
    }

    #[test]
    fn empty_trash_removes_only_trashed() {
        let conn = conn();
        let alive = create_with(&conn, "Живая", "текст").unwrap();
        let dead = create_with(&conn, "Мёртвая", "текст").unwrap();
        trash(&conn, dead.id).unwrap();

        assert_eq!(empty_trash(&conn).unwrap(), 1);
        assert_eq!(list(&conn).unwrap().len(), 1);
        assert_eq!(list(&conn).unwrap()[0].id, alive.id);
        assert!(get(&conn, dead.id).unwrap().is_none());
    }

    #[test]
    fn preview_is_flattened_and_truncated() {
        let body = "ветер ".repeat(100);
        let preview = preview_of(&body);

        assert!(!preview.contains('\n'));
        assert!(preview.chars().count() <= 161);
        assert!(preview.ends_with('…'));
        assert_eq!(words_of("  два   слова "), 2);
    }

    #[test]
    fn preview_drops_markdown_markers() {
        let preview = preview_of("## Ветер\n\n- **сильный** ветер\n> цитата");
        assert_eq!(preview, "Ветер сильный ветер цитата");
    }

    #[test]
    fn search_returns_trash_flag() {
        let conn = conn();
        let note = create_with(&conn, "Ветер", "текст").unwrap();
        let found = search(&conn, "ветер").unwrap();
        assert_eq!(found[0].id, note.id);
        assert!(found[0].deleted_at.is_none());
    }
}
