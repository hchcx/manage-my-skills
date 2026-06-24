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
        .plugin(tauri_plugin_autostart::Builder::default().build())
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::TrayIconBuilder;
            use tauri::Manager;

            // 1. 获取主窗口
            let window = app.get_webview_window("main").unwrap();

            // 2. 读取配置，处理静默启动
            let settings = settings::load_settings(app.handle()).unwrap_or_default();
            if !settings.silent_start {
                let _ = window.show();
                let _ = window.set_focus();
            }

            // 3. 拦截窗口关闭事件，处理“关闭时最小化到托盘”
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let app_handle = window_clone.app_handle();
                    let settings = settings::load_settings(app_handle).unwrap_or_default();
                    if settings.minimize_to_tray {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                }
            });

            // 4. 创建托盘图标及右键菜单
            let show_i = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| {
                    match event.id.0.as_str() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }

            let _tray = tray_builder.build(app)?;

            Ok(())
        })
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
            commands::list_remote_skills,
            commands::install_remote_skill,
            commands::get_agent_cli_statuses,
            commands::run_agent_cli_install,
            commands::diagnose_agent_collisions,
            trash::delete_skill,
            trash::get_trash_items,
            trash::restore_skill,
            trash::delete_trash_item_permanently,
            trash::empty_trash
        ])
        .run(tauri::generate_context!())
        .expect("error while running Manage My skills");
}
