use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::notes::{self, Note, NoteSummary};
use crate::settings::{self, Settings};
use crate::transfer;

const DB_LOCKED: &str = "база данных заблокирована другим запросом";

/// Состояние приложения: одно соединение с SQLite под мьютексом.
/// Для первой версии этого достаточно; при росте нагрузки заменим на пул.
pub struct AppState {
    pub db: Mutex<Connection>,
}

type CmdResult<T> = Result<T, String>;

#[tauri::command]
pub fn list_notes(state: State<'_, AppState>) -> CmdResult<Vec<NoteSummary>> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    notes::list(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_trash(state: State<'_, AppState>) -> CmdResult<Vec<NoteSummary>> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    notes::list_trash(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_notes(query: String, state: State<'_, AppState>) -> CmdResult<Vec<NoteSummary>> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    notes::search(&conn, &query).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_note(id: i64, state: State<'_, AppState>) -> CmdResult<Note> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    notes::get(&conn, id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("Заметка {id} не найдена"))
}

#[tauri::command]
pub fn create_note(state: State<'_, AppState>) -> CmdResult<Note> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    notes::create(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_note(
    id: i64,
    title: String,
    body: String,
    state: State<'_, AppState>,
) -> CmdResult<Note> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    notes::update(&conn, id, &title, &body)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("Заметка {id} не найдена"))
}

#[tauri::command]
pub fn trash_note(id: i64, state: State<'_, AppState>) -> CmdResult<()> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    notes::trash(&conn, id).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_note(id: i64, state: State<'_, AppState>) -> CmdResult<()> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    notes::restore(&conn, id).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_note(id: i64, state: State<'_, AppState>) -> CmdResult<()> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    notes::delete(&conn, id).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn empty_trash(state: State<'_, AppState>) -> CmdResult<usize> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    notes::empty_trash(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_notes(dir: String, state: State<'_, AppState>) -> CmdResult<usize> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    transfer::export_all(&conn, std::path::Path::new(&dir))
}

#[tauri::command]
pub fn import_note(path: String, state: State<'_, AppState>) -> CmdResult<Note> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    transfer::import_file(&conn, std::path::Path::new(&path))
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> CmdResult<Settings> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    settings::load(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_settings(settings: Settings, state: State<'_, AppState>) -> CmdResult<Settings> {
    let conn = state.db.lock().map_err(|_| DB_LOCKED.to_string())?;
    settings::save(&conn, &settings).map_err(|error| error.to_string())
}
