mod commands;
mod db;
mod notes;
mod settings;
mod transfer;

use std::sync::Mutex;

use tauri::Manager;

use crate::commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).map_err(|error| {
                format!(
                    "не удалось создать папку данных {}: {error}",
                    data_dir.display()
                )
            })?;

            let db_path = data_dir.join("ventonote.db");
            let conn = db::open(&db_path).map_err(|error| {
                format!(
                    "не удалось открыть базу данных {}: {error}",
                    db_path.display()
                )
            })?;

            // Резервная копия раз в час, десять последних. Ошибку только
            // логируем: приложение должно запуститься даже без бэкапа.
            if let Err(error) = db::backup(&conn, &data_dir.join("backups")) {
                eprintln!("[ventonote] не удалось сделать резервную копию: {error}");
            }

            app.manage(AppState {
                db: Mutex::new(conn),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_notes,
            commands::list_trash,
            commands::search_notes,
            commands::get_note,
            commands::create_note,
            commands::update_note,
            commands::trash_note,
            commands::restore_note,
            commands::delete_note,
            commands::empty_trash,
            commands::export_notes,
            commands::import_note,
            commands::get_settings,
            commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить VentoNote");
}
