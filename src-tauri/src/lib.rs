mod commands;
mod fs_ops;
mod models;
mod registry;
mod scanner;
mod settings;
mod sync_plan;
mod trash;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::read_inventory_cache,
            commands::scan_inventory,
            commands::discover_project_workspaces,
            commands::read_skill_content,
            commands::read_skill_lock,
            commands::open_path,
            commands::open_url,
            commands::check_skills_sh_update,
            commands::update_skills_sh_skill,
            commands::preview_adopt,
            commands::preview_sync,
            commands::preview_sync_from_installation,
            commands::preview_quick_migration,
            commands::preview_batch_sync,
            commands::preview_batch_quick_migration,
            commands::apply_sync_plan,
            commands::toggle_agent_skill,
            commands::fix_skill_folder_name,
            commands::create_skill_md,
            trash::delete_skill,
            trash::get_trash_items,
            trash::restore_skill,
            trash::delete_trash_item_permanently,
            trash::empty_trash
        ])
        .run(tauri::generate_context!())
        .expect("error while running Manage My skills");
}
