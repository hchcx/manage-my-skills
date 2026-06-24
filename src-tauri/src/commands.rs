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
use std::process::Command;
use tauri::AppHandle;
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
    settings::save_settings(&app, &settings)?;
    settings::load_settings(&app)
}

#[tauri::command]
pub fn scan_inventory(
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
pub fn read_inventory_cache(app: AppHandle) -> Result<Option<InventorySnapshot>, String> {
    scanner::read_inventory_cache(&app)
}

#[tauri::command]
pub fn discover_project_workspaces(
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

fn checkout_skills_sh_source(
    app: &AppHandle,
    slug: &str,
    source_url: &str,
    skill_path: Option<&str>,
) -> Result<PathBuf, String> {
    let clone_url = normalize_github_url(source_url)?;
    
    // 生成唯一的本地缓存文件夹名
    let cache_dir_name = url_to_cache_dir_name(&clone_url);
    
    // 我们把所有缓存仓库保存在 app_data_dir/cache/repos 目录下
    let cache_repos_root = crate::settings::app_data_dir(app)?
        .join("cache")
        .join("repos");
    fs_ops::ensure_dir(&cache_repos_root)?;
    
    let repo_path = cache_repos_root.join(cache_dir_name);

    if !repo_path.exists() {
        let status = Command::new("git")
            .args(["clone", "--depth", "1", &clone_url])
            .arg(&repo_path)
            .status()
            .map_err(|error| format!("Unable to clone {clone_url}: {error}"))?;
        if !status.success() {
            return Err(format!(
                "Unable to clone {clone_url}: git exited with {status}"
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
            let status = Command::new("git")
                .args(["fetch", "--depth", "1"])
                .current_dir(&repo_path)
                .status()
                .map_err(|error| format!("Unable to fetch {clone_url}: {error}"))?;
            if !status.success() {
                return Err(format!(
                    "Unable to fetch {clone_url}: git exited with {status}"
                ));
            }

            let status = Command::new("git")
                .args(["reset", "--hard", "FETCH_HEAD"])
                .current_dir(&repo_path)
                .status()
                .map_err(|error| format!("Unable to reset {clone_url}: {error}"))?;
            if !status.success() {
                return Err(format!(
                    "Unable to reset {clone_url}: git exited with {status}"
                ));
            }
        }
    }

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
    let trimmed = source_url
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git");

    let path = if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        rest.to_string()
    } else if let Some(rest) = trimmed.strip_prefix("github.com/") {
        rest.to_string()
    } else if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        rest.to_string()
    } else if looks_like_github_slug(trimmed) {
        trimmed.to_string()
    } else {
        return Err("skills.sh update currently supports GitHub sources only".to_string());
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
    let Some(agent) = registry::find_agent(&agent_id) else {
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

