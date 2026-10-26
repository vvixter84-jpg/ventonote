use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::notes::{self, Note};

/// Экспортирует все активные заметки в папку как отдельные `.md`-файлы.
pub fn export_all(conn: &Connection, dir: &Path) -> Result<usize, String> {
    std::fs::create_dir_all(dir)
        .map_err(|error| format!("не удалось создать папку {}: {error}", dir.display()))?;

    let notes = notes::export_all(conn).map_err(|error| error.to_string())?;
    let mut written = 0;

    for note in &notes {
        let path = unique_path(dir, &slug(note));
        std::fs::write(&path, render(note))
            .map_err(|error| format!("не удалось записать {}: {error}", path.display()))?;
        written += 1;
    }

    Ok(written)
}

/// Импортирует один markdown-файл как заметку.
pub fn import_file(conn: &Connection, path: &Path) -> Result<Note, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|error| format!("не удалось прочитать {}: {error}", path.display()))?;
    let raw = raw.trim_start_matches('\u{feff}');
    let (title, body) = split_title(raw, path);

    notes::create_with(conn, &title, &body).map_err(|error| error.to_string())
}

/// Заголовок берём из первого `# Заголовок`, иначе — из имени файла.
fn split_title(raw: &str, path: &Path) -> (String, String) {
    let mut lines = raw.lines();

    if let Some(first) = lines.next() {
        if let Some(heading) = first.strip_prefix("# ") {
            let title = heading.trim().to_string();
            let body = lines.collect::<Vec<_>>().join("\n");
            return (title, body.trim_start_matches('\n').to_string());
        }
    }

    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Импорт")
        .to_string();

    (stem, raw.trim().to_string())
}

fn render(note: &Note) -> String {
    let title = note.title.trim();
    let mut out = String::new();

    if !title.is_empty() {
        out.push_str("# ");
        out.push_str(title);
        out.push_str("\n\n");
    }

    out.push_str(note.body.trim_start_matches('\n'));
    out.push('\n');
    out
}

fn slug(note: &Note) -> String {
    let base = if note.title.trim().is_empty() {
        format!("note-{}", note.id)
    } else {
        note.title.trim().to_lowercase()
    };

    let slug: String = base
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            ch if ch.is_whitespace() => '-',
            ch => ch,
        })
        .take(60)
        .collect();

    let slug = slug.trim_matches('-').trim_matches('.').to_string();

    if slug.is_empty() {
        format!("note-{}", note.id)
    } else {
        slug
    }
}

fn unique_path(dir: &Path, slug: &str) -> PathBuf {
    let mut candidate = dir.join(format!("{slug}.md"));
    let mut counter = 2;

    while candidate.exists() {
        candidate = dir.join(format!("{slug}-{counter}.md"));
        counter += 1;
    }

    candidate
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn temp_dir(name: &str) -> PathBuf {
        // Каталог внутри проекта: тесты не должны зависеть от прав на системный temp.
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-tmp")
            .join(name);
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn exports_one_file_per_note_and_skips_trash() {
        let conn = db::open_memory().unwrap();
        notes::create_with(&conn, "Ветер", "Северный ветер дует").unwrap();
        let trashed = notes::create_with(&conn, "Мусор", "удалить").unwrap();
        notes::trash(&conn, trashed.id).unwrap();

        let dir = temp_dir("export");
        let written = export_all(&conn, &dir).unwrap();
        assert_eq!(written, 1);

        let files: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect();
        assert_eq!(files.len(), 1);

        let content = std::fs::read_to_string(&files[0]).unwrap();
        assert!(content.starts_with("# Ветер"));
        assert!(content.contains("Северный ветер дует"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn avoids_file_name_collisions() {
        let conn = db::open_memory().unwrap();
        notes::create_with(&conn, "Планы", "раз").unwrap();
        notes::create_with(&conn, "Планы", "два").unwrap();

        let dir = temp_dir("collision");
        assert_eq!(export_all(&conn, &dir).unwrap(), 2);

        let names: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert!(names.contains(&"планы.md".to_string()));
        assert!(names.contains(&"планы-2.md".to_string()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn imports_markdown_file_with_heading() {
        let conn = db::open_memory().unwrap();
        let dir = temp_dir("import");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("заметка.md");
        std::fs::write(&path, "# Морская\n\nВолны и соль\n").unwrap();

        let note = import_file(&conn, &path).unwrap();
        assert_eq!(note.title, "Морская");
        assert_eq!(note.body.trim(), "Волны и соль");

        assert_eq!(notes::list(&conn).unwrap().len(), 1);
        assert_eq!(notes::search(&conn, "волн").unwrap().len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn imports_file_without_heading_using_stem() {
        let conn = db::open_memory().unwrap();
        let dir = temp_dir("import-stem");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("черновик дня.md");
        std::fs::write(&path, "просто текст").unwrap();

        let note = import_file(&conn, &path).unwrap();
        assert_eq!(note.title, "черновик дня");
        assert_eq!(note.body, "просто текст");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn strips_byte_order_mark() {
        let conn = db::open_memory().unwrap();
        let dir = temp_dir("bom");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("bom.md");
        std::fs::write(&path, "\u{feff}# Заголовок\nтекст").unwrap();

        let note = import_file(&conn, &path).unwrap();
        assert_eq!(note.title, "Заголовок");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
