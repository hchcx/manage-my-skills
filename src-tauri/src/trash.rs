use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use crate::fs_ops::{ensure_dir, copy_dir_recursive, remove_entry};
use crate::settings::app_data_dir;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashItem {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub original_path: String,
    pub deleted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TrashIndex {
    pub items: Vec<TrashItem>,
}

fn trash_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?.join("trash");
    ensure_dir(&dir)?;
    Ok(dir)
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(trash_dir(app)?.join("trash-index.json"))
}

pub fn load_trash_index(app: &AppHandle) -> Result<TrashIndex, String> {
    let path = index_path(app)?;
    if !path.exists() {
        return Ok(TrashIndex::default());
    }
    let text = fs::read_to_string(&path)
        .map_err(|e| format!("Unable to read trash index: {e}"))?;
    let index: TrashIndex = serde_json::from_str(&text)
        .map_err(|e| format!("Unable to parse trash index: {e}"))?;
    Ok(index)
}

pub fn save_trash_index(app: &AppHandle, index: &TrashIndex) -> Result<(), String> {
    let path = index_path(app)?;
    let text = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Unable to serialize trash index: {e}"))?;
    fs::write(&path, text)
        .map_err(|e| format!("Unable to write trash index: {e}"))?;
    Ok(())
}

fn move_dir(source: &Path, destination: &Path) -> Result<(), String> {
    if fs::rename(source, destination).is_err() {
        copy_dir_recursive(source, destination)?;
        remove_entry(source)?;
    }
    Ok(())
}

fn extract_skill_name(skill_dir: &Path) -> Option<String> {
    let skill_md_path = skill_dir.join("SKILL.md");
    if !skill_md_path.exists() {
        return None;
    }
    let content = fs::read_to_string(skill_md_path).ok()?;
    let mut in_frontmatter = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "---" {
            if in_frontmatter {
                break;
            } else {
                in_frontmatter = true;
                continue;
            }
        }
        if in_frontmatter && trimmed.starts_with("name:") {
            let parts: Vec<&str> = trimmed.splitn(2, ':').collect();
            if parts.len() == 2 {
                let name = parts[1].trim().trim_matches('"').trim_matches('\'').to_string();
                if !name.is_empty() {
                    return Some(name);
                }
            }
        }
    }
    None
}

#[tauri::command]
pub async fn delete_skill(app: AppHandle, path: String) -> Result<TrashItem, String> {
    let source_path = PathBuf::from(&path);
    if !source_path.exists() {
        return Err(format!("Skill path does not exist: {}", path));
    }

    let slug = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid skill path: {}", path))?
        .to_string();

    let name = extract_skill_name(&source_path).unwrap_or_else(|| slug.clone());
    let id = format!("{}_{}", slug, Utc::now().timestamp_millis());

    let trash_item_dir = trash_dir(&app)?.join(&id);
    move_dir(&source_path, &trash_item_dir)?;

    let mut index = load_trash_index(&app)?;
    let item = TrashItem {
        id: id.clone(),
        name,
        slug,
        original_path: path,
        deleted_at: Utc::now().to_rfc3339(),
    };
    index.items.push(item.clone());
    save_trash_index(&app, &index)?;

    Ok(item)
}

#[tauri::command]
pub async fn get_trash_items(app: AppHandle) -> Result<Vec<TrashItem>, String> {
    let index = load_trash_index(&app)?;
    let mut items = index.items;
    items.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    Ok(items)
}

#[tauri::command]
pub async fn restore_skill(app: AppHandle, id: String) -> Result<(), String> {
    let mut index = load_trash_index(&app)?;
    let item_idx = index.items.iter().position(|item| item.id == id)
        .ok_or_else(|| format!("Skill not found in recycle bin with id: {}", id))?;

    let item = &index.items[item_idx];
    let trash_item_dir = trash_dir(&app)?.join(&id);
    if !trash_item_dir.exists() {
        // 如果物理目录不在了，我们从索引中删掉，并返回错误
        index.items.remove(item_idx);
        let _ = save_trash_index(&app, &index);
        return Err("Skill physical directory not found in recycle bin".to_string());
    }

    let dest_path = PathBuf::from(&item.original_path);
    if dest_path.exists() {
        return Err(format!("A folder already exists at the restore destination: {}", item.original_path));
    }

    if let Some(parent) = dest_path.parent() {
        ensure_dir(parent)?;
    }

    move_dir(&trash_item_dir, &dest_path)?;

    index.items.remove(item_idx);
    save_trash_index(&app, &index)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_trash_item_permanently(app: AppHandle, id: String) -> Result<(), String> {
    let mut index = load_trash_index(&app)?;
    let item_idx = index.items.iter().position(|item| item.id == id)
        .ok_or_else(|| format!("Skill not found in recycle bin: {}", id))?;

    let trash_item_dir = trash_dir(&app)?.join(&id);
    if trash_item_dir.exists() {
        remove_entry(&trash_item_dir)?;
    }

    index.items.remove(item_idx);
    save_trash_index(&app, &index)?;

    Ok(())
}

#[tauri::command]
pub async fn empty_trash(app: AppHandle) -> Result<(), String> {
    let mut index = load_trash_index(&app)?;
    for item in &index.items {
        let trash_item_dir = trash_dir(&app)?.join(&item.id);
        if trash_item_dir.exists() {
            let _ = remove_entry(&trash_item_dir);
        }
    }
    index.items.clear();
    save_trash_index(&app, &index)?;
    Ok(())
}

pub fn clean_expired_trash_items(app: &AppHandle) -> Result<(), String> {
    let mut index = load_trash_index(app)?;
    let mut active_items = Vec::new();
    let mut index_changed = false;
    let now = Utc::now();

    for item in index.items {
        let expired = match DateTime::parse_from_rfc3339(&item.deleted_at) {
            Ok(deleted_time) => {
                let deleted_time: DateTime<Utc> = deleted_time.with_timezone(&Utc);
                let duration = now.signed_duration_since(deleted_time);
                duration.num_days() >= 30
            }
            Err(_) => true, // 无法解析时间的项，为了稳妥起见也清理掉
        };

        if expired {
            let trash_item_dir = trash_dir(app)?.join(&item.id);
            if trash_item_dir.exists() {
                let _ = remove_entry(&trash_item_dir);
            }
            index_changed = true;
        } else {
            active_items.push(item);
        }
    }

    if index_changed {
        index.items = active_items;
        save_trash_index(app, &index)?;
    }

    Ok(())
}
