use crate::models::{
    AgentTarget, ApplyResult, InstallationRef, InventorySnapshot, ProjectWorkspaceCandidate,
    ScanOptions, Settings, SkillContent, SkillLockEntry, SkillLockFile, SkillRef, SkillUpdateCheck,
    SyncPlan,
};
use crate::{fs_ops, registry, scanner, settings, sync_plan};
use chrono::Utc;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Emitter};
use sha2::{Sha256, Digest};
use std::sync::OnceLock;
use std::sync::Mutex;
use std::collections::HashMap;
use std::time::{Instant, Duration};

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    settings::load_settings(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let old_settings = settings::load_settings(&app).ok();
    settings::save_settings(&app, &settings)?;
    
    let old_autostart = old_settings.map(|s| s.autostart).unwrap_or(false);
    if old_autostart != settings.autostart {
        use tauri_plugin_autostart::ManagerExt;
        let autolaunch_manager = app.autolaunch();
        if settings.autostart {
            let _ = autolaunch_manager.enable();
        } else {
            let _ = autolaunch_manager.disable();
        }
    }
    
    settings::load_settings(&app)
}

#[tauri::command]
pub async fn scan_inventory(
    app: AppHandle,
    options: Option<ScanOptions>,
) -> Result<InventorySnapshot, String> {
    let snapshot = scanner::scan(
        &app,
        options.unwrap_or(ScanOptions {
            include_orphaned: false,
        }),
    )?;
    scanner::write_library_index(&app, &snapshot)?;
    scanner::write_inventory_cache(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn read_inventory_cache(app: AppHandle) -> Result<Option<InventorySnapshot>, String> {
    scanner::read_inventory_cache(&app)
}

#[tauri::command]
pub async fn discover_project_workspaces(
    app: AppHandle,
    base_path: String,
) -> Result<Vec<ProjectWorkspaceCandidate>, String> {
    let settings = settings::load_settings(&app)?;
    registry::discover_project_workspaces(&base_path, &settings)
}

#[tauri::command]
pub fn read_skill_content(skill_ref: SkillRef) -> Result<SkillContent, String> {
    scanner::read_skill_content(skill_ref)
}

#[tauri::command]
pub fn read_skill_lock() -> Result<BTreeMap<String, SkillLockEntry>, String> {
    let path = fs_ops::expand_home("~/.agents/.skill-lock.json");
    let Ok(text) = fs::read_to_string(&path) else {
        return Ok(BTreeMap::new());
    };
    let lock = serde_json::from_str::<SkillLockFile>(&text).map_err(|error| {
        format!(
            "Unable to parse skill lock {}: {error}",
            fs_ops::path_to_string(&path)
        )
    })?;
    Ok(lock.skills)
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let path = fs_ops::expand_home(&path);
    if !path.exists() {
        return Err(format!(
            "Path does not exist: {}",
            fs_ops::path_to_string(&path)
        ));
    }
    let status = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", "start", "", &fs_ops::path_to_string(&path)])
            .status()
    } else {
        Command::new("open")
            .arg(&path)
            .status()
    }
    .map_err(|error| format!("Unable to open {}: {error}", fs_ops::path_to_string(&path)))?;

    if !status.success() {
        return Err(format!(
            "Unable to open {}: command exited with {status}",
            fs_ops::path_to_string(&path)
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/") {
        return Err("Only GitHub URLs can be opened from this view".to_string());
    }
    let status = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .status()
    } else {
        Command::new("open")
            .arg(&url)
            .status()
    }
    .map_err(|error| format!("Unable to open {url}: {error}"))?;

    if !status.success() {
        return Err(format!("Unable to open {url}: command exited with {status}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn check_skills_sh_update(
    app: AppHandle,
    slug: String,
    entry_path: String,
    source_url: String,
    skill_path: Option<String>,
) -> Result<SkillUpdateCheck, String> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let local_path = fs_ops::expand_home(&entry_path);
        let remote_path = checkout_skills_sh_source(&app_clone, &slug, &source_url, skill_path.as_deref())?;
        let local_hash = fs_ops::hash_dir(&local_path)?;
        let remote_hash = fs_ops::hash_dir(&remote_path)?;
        let available = local_hash != remote_hash;

        Ok(SkillUpdateCheck {
            status: if available { "available" } else { "current" }.to_string(),
            message: None,
            local_hash: Some(local_hash),
            remote_hash: Some(remote_hash),
        })
    })
    .await
    .map_err(|e| format!("Spawn blocking error: {e}"))?
}

#[tauri::command]
pub async fn update_skills_sh_skill(
    app: AppHandle,
    slug: String,
    entry_path: String,
    source_url: String,
    skill_path: Option<String>,
) -> Result<SkillUpdateCheck, String> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let local_path = fs_ops::expand_home(&entry_path);
        if !is_agents_skill_path(&local_path, &slug) {
            return Err(format!(
                "Refusing to update non-skills.sh path {}",
                fs_ops::path_to_string(&local_path)
            ));
        }

        let remote_path = checkout_skills_sh_source(&app_clone, &slug, &source_url, skill_path.as_deref())?;
        let local_hash = fs_ops::hash_dir(&local_path).ok();
        let remote_hash = fs_ops::hash_dir(&remote_path)?;

        let backup_root = crate::settings::app_data_dir(&app_clone)?
            .join("backups")
            .join("skills-sh-updates")
            .join(Utc::now().format("%Y%m%d%H%M%S").to_string());
        fs_ops::ensure_dir(&backup_root)?;
        if local_path.exists() {
            fs_ops::copy_dir_recursive(&local_path, &backup_root.join(&slug))?;
            fs_ops::remove_entry(&local_path)?;
        }
        fs_ops::copy_dir_recursive(&remote_path, &local_path)?;
        let _ = fs_ops::set_dir_readonly(&local_path, true);

        Ok(SkillUpdateCheck {
            status: "current".to_string(),
            message: Some(format!("Updated {slug} from {source_url}")),
            local_hash,
            remote_hash: Some(remote_hash),
        })
    })
    .await
    .map_err(|e| format!("Spawn blocking error: {e}"))?
}

#[tauri::command]
pub fn preview_adopt(app: AppHandle, source: InstallationRef) -> Result<SyncPlan, String> {
    sync_plan::preview_adopt(&app, source)
}

#[tauri::command]
pub fn preview_sync(
    app: AppHandle,
    skill_id: String,
    targets: Vec<AgentTarget>,
) -> Result<SyncPlan, String> {
    sync_plan::preview_sync(&app, skill_id, targets)
}

#[tauri::command]
pub fn preview_sync_from_installation(
    app: AppHandle,
    source: InstallationRef,
    targets: Vec<AgentTarget>,
) -> Result<SyncPlan, String> {
    sync_plan::preview_sync_from_installation(&app, source, targets)
}

#[tauri::command]
pub fn preview_quick_migration(
    app: AppHandle,
    source: InstallationRef,
    targets: Vec<AgentTarget>,
    method: String,
) -> Result<SyncPlan, String> {
    sync_plan::preview_quick_migration(&app, source, targets, method)
}

#[tauri::command]
pub fn preview_batch_sync(
    app: AppHandle,
    sources: Vec<InstallationRef>,
    targets: Vec<AgentTarget>,
) -> Result<SyncPlan, String> {
    sync_plan::preview_batch_sync(&app, sources, targets)
}

#[tauri::command]
pub fn preview_batch_quick_migration(
    app: AppHandle,
    sources: Vec<InstallationRef>,
    targets: Vec<AgentTarget>,
    method: String,
) -> Result<SyncPlan, String> {
    sync_plan::preview_batch_quick_migration(&app, sources, targets, method)
}

#[tauri::command]
pub fn apply_sync_plan(app: AppHandle, plan_id: String) -> Result<ApplyResult, String> {
    sync_plan::apply_plan(&app, plan_id)
}

fn get_fetch_timestamps() -> &'static Mutex<HashMap<String, Instant>> {
    static TIMESTAMPS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    TIMESTAMPS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn url_to_cache_dir_name(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

fn checkout_repo(
    app: &AppHandle,
    repo_url: &str,
) -> Result<PathBuf, String> {
    let clone_url = normalize_github_url(repo_url)?;
    
    // 生成唯一的本地缓存文件夹名
    let cache_dir_name = url_to_cache_dir_name(&clone_url);
    
    // 我们把所有缓存仓库保存在 app_data_dir/cache/repos 目录下
    let cache_repos_root = crate::settings::app_data_dir(app)?
        .join("cache")
        .join("repos");
    fs_ops::ensure_dir(&cache_repos_root)?;
    
    let repo_path = cache_repos_root.join(cache_dir_name);

    if !repo_path.exists() {
        let mut cmd = Command::new("git");
        cmd.args(["clone", "--depth", "1", &clone_url])
           .arg(&repo_path);
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x08000000);
        }
        let output = cmd.output()
            .map_err(|error| format!("Unable to clone {clone_url}: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "Unable to clone {clone_url}: git exited with {}\nError: {}",
                output.status,
                stderr.trim()
            ));
        }
        
        // 记录首次拉取时间
        let mut map = get_fetch_timestamps().lock().unwrap();
        map.insert(clone_url.clone(), Instant::now());
    } else {
        // 10秒短缓存锁，避开并发 Worker 的重复 Fetch 与锁冲突
        let now = Instant::now();
        let should_fetch = {
            let mut map = get_fetch_timestamps().lock().unwrap();
            if let Some(&last_fetch) = map.get(&clone_url) {
                if now.duration_since(last_fetch) < Duration::from_secs(10) {
                    false
                } else {
                    map.insert(clone_url.clone(), now);
                    true
                }
            } else {
                map.insert(clone_url.clone(), now);
                true
            }
        };

        if should_fetch {
            // 秒级增量更新
            let mut fetch_cmd = Command::new("git");
            fetch_cmd.args(["fetch", "--depth", "1"])
                     .current_dir(&repo_path);
            #[cfg(target_os = "windows")]
            {
                fetch_cmd.creation_flags(0x08000000);
            }
            let output = fetch_cmd.output()
                .map_err(|error| format!("Unable to fetch {clone_url}: {error}"))?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!(
                    "Unable to fetch {clone_url}: git exited with {}\nError: {}",
                    output.status,
                    stderr.trim()
                ));
            }

            let mut reset_cmd = Command::new("git");
            reset_cmd.args(["reset", "--hard", "FETCH_HEAD"])
                     .current_dir(&repo_path);
            #[cfg(target_os = "windows")]
            {
                reset_cmd.creation_flags(0x08000000);
            }
            let output = reset_cmd.output()
                .map_err(|error| format!("Unable to reset {clone_url}: {error}"))?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!(
                    "Unable to reset {clone_url}: git exited with {}\nError: {}",
                    output.status,
                    stderr.trim()
                ));
            }
        }
    }

    Ok(repo_path)
}

fn checkout_skills_sh_source(
    app: &AppHandle,
    slug: &str,
    source_url: &str,
    skill_path: Option<&str>,
) -> Result<PathBuf, String> {
    let repo_path = checkout_repo(app, source_url)?;
    let source = resolve_skill_path(&repo_path, slug, skill_path).ok_or_else(|| {
        format!(
            "Unable to find skill '{slug}' in cloned repository {}",
            fs_ops::path_to_string(&repo_path)
        )
    })?;
    if !source.join("SKILL.md").exists() {
        return Err(format!(
            "Remote skill source is missing SKILL.md: {}",
            fs_ops::path_to_string(&source)
        ));
    }
    Ok(source)
}

fn normalize_github_url(source_url: &str) -> Result<String, String> {
    let trimmed = source_url.trim();
    
    if trimmed.ends_with(".git") || trimmed.starts_with("git@") {
        return Ok(trimmed.to_string());
    }

    let trimmed_clean = trimmed
        .trim_end_matches('/')
        .trim_end_matches(".git");

    let path = if let Some(rest) = trimmed_clean.strip_prefix("git@github.com:") {
        rest.to_string()
    } else if let Some(rest) = trimmed_clean.strip_prefix("github.com/") {
        rest.to_string()
    } else if let Some(rest) = trimmed_clean.strip_prefix("https://github.com/") {
        rest.to_string()
    } else if looks_like_github_slug(trimmed_clean) {
        trimmed_clean.to_string()
    } else {
        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            return Ok(trimmed.to_string());
        }
        return Err("当前仅支持 GitHub 仓库源或有效的 Git 仓库链接".to_string());
    };

    Ok(format!("https://github.com/{path}.git"))
}

fn looks_like_github_slug(value: &str) -> bool {
    let parts: Vec<&str> = value.split('/').collect();
    parts.len() == 2 && parts.iter().all(|p| !p.is_empty())
}

fn resolve_skill_path(repo_path: &Path, slug: &str, skill_path: Option<&str>) -> Option<PathBuf> {
    let custom = skill_path
        .filter(|path| !path.trim().is_empty())
        .map(|path| {
            let p = repo_path.join(path.trim_start_matches('/'));
            if p.file_name().and_then(|n| n.to_str()) == Some("SKILL.md") {
                p.parent().map(|parent| parent.to_path_buf()).unwrap_or(p)
            } else {
                p
            }
        });

    std::iter::once(custom)
        .flatten()
        .chain([
            repo_path.join(slug),
            repo_path.join("skills").join(slug),
            repo_path.to_path_buf(),
        ])
        .find(|candidate| candidate.join("SKILL.md").exists())
}

fn is_agents_skill_path(path: &Path, slug: &str) -> bool {
    let expected_suffix = PathBuf::from(".agents").join("skills").join(slug);
    path.ends_with(expected_suffix)
}

#[tauri::command]
pub fn toggle_agent_skill(
    app: AppHandle,
    skill_id: String,
    agent_id: String,
    scope: String,
    project_path: Option<String>,
    active: bool,
    source_path: Option<String>,
) -> Result<(), String> {
    let settings = settings::load_settings(&app)?;
    let Some(agent) = registry::find_agent(&settings, &agent_id) else {
        return Err(format!("未找到 Agent: {}", agent_id));
    };

    let target = AgentTarget {
        agent_id: agent_id.clone(),
        scope: Some(scope.clone()),
        project_path: project_path.clone(),
    };

    let target_roots = sync_plan::target_roots_for_agent(&agent, &target, &settings);
    if target_roots.is_empty() {
        return Err(format!("未配置 Agent '{}' 的目标目录", agent.label));
    }

    if active {
        let source_str = source_path.ok_or_else(|| "启用同步需要提供源路径 (source_path)".to_string())?;
        let source = PathBuf::from(&source_str);
        if !source.exists() {
            return Err(format!("源路径不存在: {}", source_str));
        }

        for (_, root_path) in target_roots {
            if !root_path.exists() {
                fs_ops::ensure_dir(&root_path)?;
            }
            let target_path = root_path.join(&skill_id);

            if target_path.exists() || fs::symlink_metadata(&target_path).is_ok() {
                let metadata = fs::symlink_metadata(&target_path)
                    .map_err(|e| format!("无法检查目标路径 {}: {}", fs_ops::path_to_string(&target_path), e))?;

                if metadata.file_type().is_symlink() {
                    // 指向不同路径，或者是损坏的软链接，先安全删除
                    fs_ops::remove_entry(&target_path)?;
                } else {
                    let source_abs = fs::canonicalize(&source).unwrap_or_else(|_| source.clone());
                    let target_abs = fs::canonicalize(&target_path).unwrap_or_else(|_| target_path.clone());

                    if source_abs != target_abs {
                        let source_hash = fs_ops::hash_dir(&source).ok();
                        let target_hash = fs_ops::hash_dir(&target_path).ok();

                        if source_hash.is_some() && target_hash.is_some() && source_hash == target_hash {
                            // 内容一致，直接删除
                            fs_ops::remove_entry(&target_path)?;
                        } else {
                            // 内容不一致，重命名备份
                            let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
                            let expected_name = skill_id.clone();
                            let parent = target_path.parent().ok_or_else(|| "无法获取目标父级目录".to_string())?;
                            let backup_name = format!("{}.bak_{}", expected_name, timestamp);
                            let backup_path = parent.join(&backup_name);

                            let mut final_backup_path = backup_path.clone();
                            let mut counter = 1;
                            while final_backup_path.exists() {
                                let new_backup_name = format!("{}.bak_{}_{}", expected_name, timestamp, counter);
                                final_backup_path = parent.join(&new_backup_name);
                                counter += 1;
                            }

                            fs::rename(&target_path, &final_backup_path).map_err(|error| {
                                format!(
                                    "启用同步前备份冲突物理目录 {} 到 {} 失败: {error}",
                                    fs_ops::path_to_string(&target_path),
                                    fs_ops::path_to_string(&final_backup_path)
                                )
                            })?;
                        }
                    }
                }
            }
            fs_ops::create_symlink(&source, &target_path)?;
        }
    } else {
        for (_, root_path) in target_roots {
            let target_path = root_path.join(&skill_id);
            if target_path.exists() || fs::symlink_metadata(&target_path).is_ok() {
                let metadata = fs::symlink_metadata(&target_path)
                    .map_err(|e| format!("无法检查目标路径 {}: {}", fs_ops::path_to_string(&target_path), e))?;

                if metadata.file_type().is_symlink() {
                    fs_ops::remove_entry(&target_path)?;
                } else {
                    // 物理文件夹停用时，执行重命名备份从而安全移除
                    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
                    let expected_name = skill_id.clone();
                    let parent = target_path.parent().ok_or_else(|| "无法获取目标父级目录".to_string())?;
                    let backup_name = format!("{}.bak_{}", expected_name, timestamp);
                    let backup_path = parent.join(&backup_name);

                    let mut final_backup_path = backup_path.clone();
                    let mut counter = 1;
                    while final_backup_path.exists() {
                        let new_backup_name = format!("{}.bak_{}_{}", expected_name, timestamp, counter);
                        final_backup_path = parent.join(&new_backup_name);
                        counter += 1;
                    }

                    fs::rename(&target_path, &final_backup_path).map_err(|error| {
                        format!(
                            "清理同步物理目录 {} 到 {} 失败: {error}",
                            fs_ops::path_to_string(&target_path),
                            fs_ops::path_to_string(&final_backup_path)
                        )
                    })?;
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn fix_skill_folder_name(
    entry_path: String,
    expected_name: String,
) -> Result<(), String> {
    let source = PathBuf::from(&entry_path);
    if !source.exists() {
        return Err(format!("源路径不存在: {entry_path}"));
    }

    let parent = source.parent().ok_or_else(|| "无法获取父级目录".to_string())?;
    let target = parent.join(&expected_name);

    // 检查是否仅有文件名大小写差异（在 Windows 大小写不敏感系统下）
    let is_same_entity_case_diff = {
        let source_abs = fs::canonicalize(&source).unwrap_or_else(|_| source.clone());
        let target_abs = fs::canonicalize(&target).unwrap_or_else(|_| target.clone());
        
        let source_str = fs_ops::path_to_string(&source_abs).to_uppercase();
        let target_str = fs_ops::path_to_string(&target_abs).to_uppercase();
        
        source_str == target_str
    };

    if is_same_entity_case_diff {
        // 大小写不同且指向相同实体，Windows 下直接 rename 会报错，必须通过中间临时路径两步完成
        let temp_name = format!("{}_rename_temp", expected_name);
        let temp_path = parent.join(&temp_name);

        fs::rename(&source, &temp_path).map_err(|error| {
            format!(
                "大小写修复第一步失败，无法将 {} 重命名为临时目录 {}: {error}",
                fs_ops::path_to_string(&source),
                fs_ops::path_to_string(&temp_path)
            )
        })?;

        fs::rename(&temp_path, &target).map_err(|error| {
            let _ = fs::rename(&temp_path, &source); // 失败时回滚
            format!(
                "大小写修复第二步失败，无法将临时目录 {} 重命名为 {}: {error}",
                fs_ops::path_to_string(&temp_path),
                fs_ops::path_to_string(&target)
            )
        })?;

        return Ok(());
    }

    if target.exists() || fs::symlink_metadata(&target).is_ok() {
        let metadata = fs::symlink_metadata(&target)
            .map_err(|e| format!("无法检查目标路径 {}: {}", fs_ops::path_to_string(&target), e))?;

        if metadata.file_type().is_symlink() {
            // 如果目标是一个软链接，直接安全删除
            fs_ops::remove_entry(&target)?;
        } else {
            // 如果是一个物理目录，比较源路径和目标路径的文件哈希
            let source_hash = fs_ops::hash_dir(&source).ok();
            let target_hash = fs_ops::hash_dir(&target).ok();

            if source_hash.is_some() && target_hash.is_some() && source_hash == target_hash {
                // 内容完全一致，可以直接安全删除旧的规范目录
                fs_ops::remove_entry(&target)?;
            } else {
                // 内容不一致，为保障数据绝对安全，将旧的目标目录重命名备份
                let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
                let backup_name = format!("{}.bak_{}", expected_name, timestamp);
                let backup_path = parent.join(&backup_name);

                let mut final_backup_path = backup_path.clone();
                let mut counter = 1;
                while final_backup_path.exists() {
                    let new_backup_name = format!("{}.bak_{}_{}", expected_name, timestamp, counter);
                    final_backup_path = parent.join(&new_backup_name);
                    counter += 1;
                }

                fs::rename(&target, &final_backup_path).map_err(|error| {
                    format!(
                        "备份已存在的旧目录 {} 到 {} 失败: {error}",
                        fs_ops::path_to_string(&target),
                        fs_ops::path_to_string(&final_backup_path)
                    )
                })?;
            }
        }
    }

    fs::rename(&source, &target).map_err(|error| {
        format!(
            "重命名失败，无法将 {} 重命名为 {}: {error}",
            fs_ops::path_to_string(&source),
            fs_ops::path_to_string(&target)
        )
    })?;

    Ok(())
}

#[tauri::command]
pub fn create_skill_md(entry_path: String, slug: String) -> Result<(), String> {
    let dir = Path::new(&entry_path);
    if !dir.exists() {
        return Err(format!("目录 {} 不存在", entry_path));
    }
    let skill_md_path = dir.join("SKILL.md");
    if skill_md_path.exists() {
        return Ok(());
    }

    let default_content = format!(
        r#"---
name: {}
description: Workspace skill for {}.
---

# {}
This is a workspace skill. Add your custom instructions and tools here.
"#,
        slug, slug, slug
    );

    std::fs::write(&skill_md_path, default_content)
        .map_err(|e| format!("无法写入 SKILL.md 文件: {}", e))?;

    Ok(())
}

use crate::models::{RemoteSkillInfo, RemoteInstallArgs};

#[tauri::command]
pub async fn get_remote_skill_readme(
    app: AppHandle,
    repo_url: String,
    relative_path: String,
    lang: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo_path = checkout_repo(&app, &repo_url)?;
        let skill_dir = if relative_path.is_empty() {
            repo_path
        } else {
            repo_path.join(&relative_path)
        };

        let lang_str = lang.unwrap_or_else(|| "zh".to_string());
        
        let files_to_try = if lang_str == "zh" {
            vec![
                "SKILL-zh.md",
                "SKILL-zh-CN.md",
                "README-zh.md",
                "README-zh-CN.md",
                "SKILL.md",
                "README.md",
            ]
        } else {
            vec![
                "SKILL.md",
                "README.md",
                "SKILL-zh.md",
                "SKILL-zh-CN.md",
                "README-zh.md",
                "README-zh-CN.md",
            ]
        };

        for filename in files_to_try {
            let file_path = skill_dir.join(filename);
            if file_path.exists() {
                if let Ok(content) = fs::read_to_string(&file_path) {
                    return Ok(content);
                }
            }
        }

        Err("未找到任何说明文件 (SKILL.md, README.md 或对应的中英文版本)".to_string())
    })
    .await
    .map_err(|e| format!("进程执行错误: {e}"))?
}

#[tauri::command]
pub async fn list_remote_skills(
    app: AppHandle,
    repo_url: Option<String>,
) -> Result<Vec<RemoteSkillInfo>, String> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let settings = settings::load_settings(&app_clone)?;
        let repos = if let Some(url) = repo_url {
            vec![url]
        } else {
            let all = settings.skill_repositories.unwrap_or_default();
            if all.is_empty() {
                Vec::new()
            } else {
                vec![all[0].clone()]
            }
        };
        let mut all_skills = Vec::new();

        for repo_url in repos {
            let repo_path = match checkout_repo(&app_clone, &repo_url) {
                Ok(path) => path,
                Err(err) => {
                    println!("Failed to checkout repository {}: {}", repo_url, err);
                    continue;
                }
            };

            let mut candidates = Vec::new();
            find_skill_dirs(&repo_path, &repo_path, 0, &mut candidates);

            for skill_dir in candidates {
                let skill_md = skill_dir.join("SKILL.md");
                let slug = skill_dir
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                let (display_name, description) = match fs::read_to_string(&skill_md) {
                    Ok(text) => {
                        let (fm, _) = scanner::parse_skill_markdown(&text);
                        if let Some(fm) = fm {
                            let name = fm.name.unwrap_or_else(|| slug.clone());
                            let desc = fm.description;
                            (name, desc)
                        } else {
                            (slug.clone(), None)
                        }
                    }
                    Err(_) => (slug.clone(), None),
                };

                let relative_path = match skill_dir.strip_prefix(&repo_path) {
                    Ok(rel) => fs_ops::path_to_string(rel),
                    Err(_) => String::new(),
                };

                all_skills.push(RemoteSkillInfo {
                    slug,
                    display_name,
                    description,
                    repo_url: repo_url.clone(),
                    relative_path,
                });
            }
        }

        Ok(all_skills)
    })
    .await
    .map_err(|e| format!("Spawn blocking error: {e}"))?
}

fn find_skill_dirs(base_path: &Path, current_path: &Path, depth: u32, results: &mut Vec<PathBuf>) {
    if depth > 3 {
        return;
    }

    if current_path.join("SKILL.md").exists() {
        results.push(current_path.to_path_buf());
        return;
    }

    let Ok(entries) = fs::read_dir(current_path) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.file_name().and_then(|n| n.to_str()).is_some_and(|name| name.starts_with('.')) {
            continue;
        }
        if path.is_dir() {
            find_skill_dirs(base_path, &path, depth + 1, results);
        }
    }
}

#[tauri::command]
pub async fn install_remote_skill(
    app: AppHandle,
    args: RemoteInstallArgs,
) -> Result<(), String> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let settings = settings::load_settings(&app_clone)?;
        
        let repo_path = checkout_repo(&app_clone, &args.repo_url)?;
        let source_dir = if args.relative_path.is_empty() {
            repo_path
        } else {
            repo_path.join(&args.relative_path)
        };

        if !source_dir.join("SKILL.md").exists() {
            return Err(format!(
                "在缓存仓库中未找到合法的 Skill 目录：{:?}",
                source_dir
            ));
        }

        let final_source_dir = if args.method == "managed" {
            let library_root = PathBuf::from(&settings.library_path);
            if !library_root.exists() {
                fs_ops::ensure_dir(&library_root)?;
            }
            let library_skill_dir = library_root.join(&args.slug);
            
            if library_skill_dir.exists() {
                fs_ops::remove_entry(&library_skill_dir)?;
            }
            fs_ops::copy_dir_recursive(&source_dir, &library_skill_dir)?;
            let _ = fs_ops::set_dir_readonly(&library_skill_dir, true);
            library_skill_dir
        } else {
            source_dir
        };

        for agent_id in args.agent_ids {
            let Some(agent) = registry::find_agent(&settings, &agent_id) else {
                return Err(format!("未找到指定的 Agent: {}", agent_id));
            };

            let target_root = if args.scope == "project" {
                let proj_path = args.project_path.as_ref().ok_or_else(|| {
                    "Scope为项目时必须提供 project_path".to_string()
                })?;
                let proj_root_rel = agent.project_roots.first().ok_or_else(|| {
                    format!("Agent {} 未配置项目 roots 路径", agent.label)
                })?;
                PathBuf::from(proj_path).join(proj_root_rel)
            } else {
                let global_root_rel = agent.global_roots.first().ok_or_else(|| {
                    format!("Agent {} 未配置全局 roots 路径", agent.label)
                })?;
                fs_ops::expand_home(global_root_rel)
            };

            if !target_root.exists() {
                fs_ops::ensure_dir(&target_root)?;
            }

            let target_skill_dir = target_root.join(&args.slug);

            if target_skill_dir.exists() || fs::symlink_metadata(&target_skill_dir).is_ok() {
                let metadata = fs::symlink_metadata(&target_skill_dir)
                    .map_err(|e| format!("无法检查目标路径 {}: {}", fs_ops::path_to_string(&target_skill_dir), e))?;

                if metadata.file_type().is_symlink() {
                    fs_ops::remove_entry(&target_skill_dir)?;
                } else {
                    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
                    let parent = target_skill_dir.parent().ok_or_else(|| "无法获取目标父级目录".to_string())?;
                    let backup_name = format!("{}.bak_{}", args.slug, timestamp);
                    let mut backup_path = parent.join(&backup_name);
                    
                    let mut counter = 1;
                    while backup_path.exists() {
                        backup_path = parent.join(format!("{}.bak_{}_{}", args.slug, timestamp, counter));
                        counter += 1;
                    }

                    fs::rename(&target_skill_dir, &backup_path).map_err(|error| {
                        format!(
                            "安装时备份冲突物理目录 {} 失败: {}",
                            fs_ops::path_to_string(&target_skill_dir),
                            error
                        )
                    })?;
                }
            }

            if args.method == "copy" {
                fs_ops::copy_dir_recursive(&final_source_dir, &target_skill_dir)?;
            } else {
                fs_ops::create_symlink(&final_source_dir, &target_skill_dir)?;
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("Spawn blocking error: {e}"))?
}

fn run_command_in_shell(bin_name: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(bin_name);
        #[cfg(target_os = "windows")]
        {
            c.creation_flags(0x08000000);
        }
        c
    } else {
        Command::new(bin_name)
    };
    cmd.args(args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if err_msg.is_empty() {
            format!("Command exited with status {}", output.status)
        } else {
            err_msg
        })
    }
}

fn extract_version(output: &str) -> String {
    let mut version = String::new();
    for token in output.split(|c: char| c.is_whitespace() || c == '/' || c == 'v') {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() >= 3 && parts.iter().all(|p| p.chars().all(|ch| ch.is_ascii_digit())) {
            version = token.to_string();
            break;
        }
    }
    if version.is_empty() {
        let clean = output.trim().replace("v", "");
        if clean.len() > 15 {
            clean[..15].to_string()
        } else {
            clean
        }
    } else {
        version
    }
}

#[derive(serde::Serialize)]
pub struct AgentCliStatus {
    pub current: String,
    pub latest: String,
    pub status: String,
}

#[derive(serde::Serialize)]
#[allow(non_snake_case)]
pub struct AgentStatusesMap {
    pub claudeCode: AgentCliStatus,
    pub codex: AgentCliStatus,
    pub geminiCli: AgentCliStatus,
    pub openCode: AgentCliStatus,
}

#[tauri::command]
pub async fn get_agent_cli_statuses() -> Result<AgentStatusesMap, String> {
    match tauri::async_runtime::spawn_blocking(|| {
        let detect_current = |bin_name: &str| -> String {
            match run_command_in_shell(bin_name, &["--version"]) {
                Ok(out) => {
                    let v = extract_version(&out);
                    if v.is_empty() { "已安装".to_string() } else { v }
                }
                Err(_) => {
                    match run_command_in_shell(bin_name, &["-v"]) {
                        Ok(out) => {
                            let v = extract_version(&out);
                            if v.is_empty() { "已安装".to_string() } else { v }
                        }
                        Err(_) => "未安装".to_string(),
                    }
                }
            }
        };

        let detect_latest = |npm_pkg: &str, fallback: &str| -> String {
            match run_command_in_shell("npm", &["view", npm_pkg, "version"]) {
                Ok(out) => {
                    let v = out.trim().to_string();
                    if v.is_empty() { fallback.to_string() } else { v }
                }
                Err(_) => fallback.to_string(),
            }
        };

        let claude_curr = detect_current("claude");
        let claude_latest = detect_latest("@anthropic-ai/claude-code", "2.1.187");
        let claude_status = if claude_curr == "未安装" {
            "not-installed".to_string()
        } else if claude_curr < claude_latest {
            "upgradeable".to_string()
        } else {
            "latest".to_string()
        };

        let codex_curr = detect_current("codex");
        let codex_latest = detect_latest("codex", "0.142.0");
        let codex_status = if codex_curr == "未安装" {
            "not-installed".to_string()
        } else if codex_curr < codex_latest {
            "upgradeable".to_string()
        } else {
            "latest".to_string()
        };

        let gemini_curr = detect_current("gemini-cli");
        let gemini_latest = detect_latest("@google/gemini-cli", "0.47.0");
        let gemini_status = if gemini_curr == "未安装" {
            "not-installed".to_string()
        } else if gemini_curr < gemini_latest {
            "upgradeable".to_string()
        } else {
            "latest".to_string()
        };

        let opencode_curr = detect_current("opencode");
        let opencode_latest = detect_latest("opencode", "1.17.9");
        let opencode_status = if opencode_curr == "未安装" {
            "not-installed".to_string()
        } else if opencode_curr < opencode_latest {
            "upgradeable".to_string()
        } else {
            "latest".to_string()
        };

        Ok(AgentStatusesMap {
            claudeCode: AgentCliStatus {
                current: claude_curr,
                latest: claude_latest,
                status: claude_status,
            },
            codex: AgentCliStatus {
                current: codex_curr,
                latest: codex_latest,
                status: codex_status,
            },
            geminiCli: AgentCliStatus {
                current: gemini_curr,
                latest: gemini_latest,
                status: gemini_status,
            },
            openCode: AgentCliStatus {
                current: opencode_curr,
                latest: opencode_latest,
                status: opencode_status,
            },
        })
    }).await {
        Ok(res) => res,
        Err(e) => Err(e.to_string()),
    }
}

#[derive(serde::Serialize, Clone)]
pub struct CliInstallLog {
    pub stream: String,
    pub text: String,
}

#[tauri::command]
pub async fn run_agent_cli_install(
    window: tauri::Window,
    agent_id: String,
) -> Result<(), String> {
    let npm_pkg = match agent_id.as_str() {
        "claudeCode" => "@anthropic-ai/claude-code",
        "codex" => "codex",
        "geminiCli" => "@google/gemini-cli",
        "openCode" => "opencode",
        _ => return Err(format!("不支持的 Agent ID: {agent_id}")),
    };

    match tauri::async_runtime::spawn_blocking(move || {
        let emit_log = |stream: &str, text: &str| {
            let _ = window.emit(
                "cli-install-log",
                CliInstallLog {
                    stream: stream.to_string(),
                    text: text.to_string(),
                },
            );
        };

        emit_log("status", &format!("开始执行 npm install -g {}...", npm_pkg));
        
        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.args(&["/C", &format!("npm install -g {npm_pkg} --force")]);
            #[cfg(target_os = "windows")]
            {
                c.creation_flags(0x08000000);
            }
            c
        } else {
            let mut c = Command::new("npm");
            c.args(&["install", "-g", npm_pkg, "--force"]);
            c
        };

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                emit_log("stderr", &format!("无法启动 npm 命令。请确认您的系统已安装 Node.js 与 npm。\n错误信息: {e}"));
                emit_log("status", "failed");
                return;
            }
        };

        let stdout = child.stdout.take().expect("Failed to open stdout");
        let stderr = child.stderr.take().expect("Failed to open stderr");
        
        let window_clone = window.clone();
        let stderr_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = window_clone.emit(
                        "cli-install-log",
                        CliInstallLog {
                            stream: "stderr".to_string(),
                            text: l,
                        },
                    );
                }
            }
        });

        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                emit_log("stdout", &l);
            }
        }

        let _ = stderr_thread.join();
        
        match child.wait() {
            Ok(status) if status.success() => {
                emit_log("status", "success");
            }
            Ok(status) => {
                emit_log("stderr", &format!("安装失败，npm 命令返回状态: {status}"));
                emit_log("status", "failed");
            }
            Err(e) => {
                emit_log("stderr", &format!("等待安装进程完成时发生错误: {e}"));
                emit_log("status", "failed");
            }
        }
    }).await {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(serde::Serialize)]
pub struct DiagnosisReport {
    pub healthy: bool,
    pub score: i32,
    pub issues: Vec<String>,
}

#[tauri::command]
pub fn diagnose_agent_collisions() -> Result<DiagnosisReport, String> {
    let mut issues = Vec::new();
    let mut score = 100;

    if let Some(path_env) = std::env::var_os("PATH") {
        let paths: Vec<std::path::PathBuf> = std::env::split_paths(&path_env).collect();
        let target_clis = ["claude", "codex", "gemini-cli", "opencode"];
        for cli in target_clis {
            let mut found_paths = Vec::new();
            for p in &paths {
                if cfg!(target_os = "windows") {
                    for ext in [".cmd", ".bat", ".exe", ""] {
                        let full = p.join(format!("{cli}{ext}"));
                        if full.exists() && full.is_file() {
                            found_paths.push(full);
                            break;
                        }
                    }
                } else {
                    let full = p.join(cli);
                    if full.exists() && full.is_file() {
                        found_paths.push(full);
                    }
                }
            }
            found_paths.sort();
            found_paths.dedup();

            if found_paths.len() > 1 {
                issues.push(format!(
                    "检测到命令行工具 `{}` 存在多个全局安装路径，可能会引起冲突：\n{}",
                    cli,
                    found_paths.iter().map(|p| format!("  - {}", p.to_string_lossy())).collect::<Vec<_>>().join("\n")
                ));
                score -= 20;
            }
        }
    }

    if score < 0 {
        score = 0;
    }

    Ok(DiagnosisReport {
        healthy: issues.is_empty(),
        score,
        issues,
    })
}

#[tauri::command]
pub fn app_ready(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    let settings = settings::load_settings(&app).unwrap_or_default();
    if !settings.silent_start {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}


