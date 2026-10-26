use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// Настройки интерфейса. Хранятся одной JSON-строкой в таблице `settings`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: String,
    pub font_size: i64,
    pub editor_mode: String,
    pub line_width: i64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            font_size: 16,
            editor_mode: "edit".to_string(),
            line_width: 760,
        }
    }
}

impl Settings {
    /// Приводит значения к допустимым: что бы ни пришло из фронтенда,
    /// вёрстка не развалится.
    pub fn sanitized(mut self) -> Self {
        if !matches!(self.theme.as_str(), "light" | "dark" | "system") {
            self.theme = "system".to_string();
        }
        if !matches!(self.editor_mode.as_str(), "edit" | "split" | "preview") {
            self.editor_mode = "edit".to_string();
        }
        self.font_size = self.font_size.clamp(13, 24);
        self.line_width = self.line_width.clamp(560, 1100);
        self
    }
}

pub fn load(conn: &Connection) -> rusqlite::Result<Settings> {
    let raw: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = 'ui'", [], |row| {
            row.get(0)
        })
        .optional()?;

    Ok(raw
        .and_then(|json| serde_json::from_str::<Settings>(&json).ok())
        .unwrap_or_default()
        .sanitized())
}

pub fn save(conn: &Connection, settings: &Settings) -> rusqlite::Result<Settings> {
    let settings = settings.clone().sanitized();
    let json = serde_json::to_string(&settings).unwrap_or_else(|_| "{}".to_string());

    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('ui', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [json],
    )?;

    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn defaults_when_empty() {
        let conn = db::open_memory().unwrap();
        let settings = load(&conn).unwrap();

        assert_eq!(settings.theme, "system");
        assert_eq!(settings.font_size, 16);
        assert_eq!(settings.editor_mode, "edit");
    }

    #[test]
    fn saves_and_loads_roundtrip() {
        let conn = db::open_memory().unwrap();
        let saved = save(
            &conn,
            &Settings {
                theme: "dark".into(),
                font_size: 18,
                editor_mode: "split".into(),
                line_width: 900,
            },
        )
        .unwrap();

        let loaded = load(&conn).unwrap();
        assert_eq!(loaded.theme, "dark");
        assert_eq!(loaded.font_size, 18);
        assert_eq!(loaded.editor_mode, "split");
        assert_eq!(loaded.line_width, 900);
        assert_eq!(saved.font_size, 18);
    }

    #[test]
    fn clamps_absurd_values() {
        let conn = db::open_memory().unwrap();
        let saved = save(
            &conn,
            &Settings {
                theme: "neon".into(),
                font_size: 200,
                editor_mode: "wat".into(),
                line_width: 5000,
            },
        )
        .unwrap();

        assert_eq!(saved.theme, "system");
        assert_eq!(saved.editor_mode, "edit");
        assert_eq!(saved.font_size, 24);
        assert_eq!(saved.line_width, 1100);
    }
}
