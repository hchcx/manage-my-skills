use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

pub fn expand_home(path: &str) -> PathBuf {
    if path == "~" {
        return home_dir();
    }
    if let Some(rest) = path.strip_prefix("~/") {
        return home_dir().join(rest);
    }
    PathBuf::from(path)
}

pub fn home_dir() -> PathBuf {
    if cfg!(windows) {
        std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .or_else(|| {
                let drive = std::env::var_os("HOMEDRIVE")?;
                let path = std::env::var_os("HOMEPATH")?;
                Some(PathBuf::from(drive).join(path))
            })
            .unwrap_or_else(|| PathBuf::from("C:\\"))
    } else {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/"))
    }
}

pub fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| {
        format!(
            "Unable to create directory {}: {error}",
            path_to_string(path)
        )
    })
}

pub fn skill_slug_from_path(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
        .ok_or_else(|| format!("Unable to infer skill slug from {}", path_to_string(path)))
}

pub fn hash_dir(path: &Path) -> Result<String, String> {
    let mut files = Vec::new();
    for entry in WalkDir::new(path).follow_links(false).sort_by_file_name() {
        let entry =
            entry.map_err(|error| format!("Unable to walk {}: {error}", path_to_string(path)))?;
        if entry.file_type().is_file() {
            files.push(entry.path().to_path_buf());
        }
    }

    let mut hasher = Sha256::new();
    for file in files {
        let rel = file
            .strip_prefix(path)
            .map_err(|error| format!("Unable to hash {}: {error}", path_to_string(&file)))?;
        hasher.update(rel.to_string_lossy().as_bytes());
        hasher.update([0]);

        let mut handle = fs::File::open(&file)
            .map_err(|error| format!("Unable to read {}: {error}", path_to_string(&file)))?;
        let mut buffer = [0_u8; 8192];
        loop {
            let read = handle
                .read(&mut buffer)
                .map_err(|error| format!("Unable to read {}: {error}", path_to_string(&file)))?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        hasher.update([0xff]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

pub fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_dir() {
        return Err(format!(
            "Source is not a directory: {}",
            path_to_string(source)
        ));
    }
    ensure_dir(destination)?;

    for entry in WalkDir::new(source).follow_links(false).sort_by_file_name() {
        let entry =
            entry.map_err(|error| format!("Unable to copy {}: {error}", path_to_string(source)))?;
        let rel = entry
            .path()
            .strip_prefix(source)
            .map_err(|error| format!("Unable to copy {}: {error}", path_to_string(entry.path())))?;
        if rel.as_os_str().is_empty() {
            continue;
        }
        let target = destination.join(rel);
        if entry.file_type().is_dir() {
            ensure_dir(&target)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                ensure_dir(parent)?;
            }
            fs::copy(entry.path(), &target).map_err(|error| {
                format!(
                    "Unable to copy {} to {}: {error}",
                    path_to_string(entry.path()),
                    path_to_string(&target)
                )
            })?;
        } else if entry.file_type().is_symlink() {
            let link_target = fs::read_link(entry.path()).map_err(|error| {
                format!(
                    "Unable to read symlink {}: {error}",
                    path_to_string(entry.path())
                )
            })?;
            create_symlink(&link_target, &target)?;
        }
    }

    Ok(())
}

pub fn move_path(source: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        ensure_dir(parent)?;
    }
    fs::rename(source, destination).map_err(|error| {
        format!(
            "Unable to move {} to {}: {error}",
            path_to_string(source),
            path_to_string(destination)
        )
    })
}

fn remove_dir_all_force(path: &Path) -> std::io::Result<()> {
    // 递归解除所有文件和子目录的只读权限以防止 Windows 拒绝访问
    for entry in walkdir::WalkDir::new(path).follow_links(false) {
        if let Ok(entry) = entry {
            let p = entry.path();
            if let Ok(meta) = fs::symlink_metadata(p) {
                let mut perms = meta.permissions();
                if perms.readonly() {
                    perms.set_readonly(false);
                    let _ = fs::set_permissions(p, perms);
                }
            }
        }
    }
    fs::remove_dir_all(path)
}

pub fn remove_entry(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Unable to inspect {}: {error}", path_to_string(path)))?;
    
    // 如果文件或目录本身是只读的，在 Windows 下必须要先解除只读权限才能执行删除/重命名
    let mut permissions = metadata.permissions();
    if permissions.readonly() {
        permissions.set_readonly(false);
        let _ = fs::set_permissions(path, permissions);
    }

    if metadata.file_type().is_symlink() {
        // 在 Windows 上，指向目录的符号链接（symlink_dir）不能通过 fs::remove_file 删除（会返回 os error 5 拒绝访问）
        // 必须使用 fs::remove_dir 删除。为了兼容，我们优先尝试 remove_file，失败时尝试 remove_dir
        if fs::remove_file(path).is_err() {
            fs::remove_dir(path).map_err(|error| {
                format!(
                    "Unable to remove symlink {}: {error}",
                    path_to_string(path)
                )
            })?;
        }
        Ok(())
    } else if metadata.is_file() {
        fs::remove_file(path).map_err(|error| {
            format!(
                "Unable to remove file {}: {error}",
                path_to_string(path)
            )
        })
    } else if metadata.is_dir() {
        remove_dir_all_force(path).map_err(|error| {
            format!(
                "Unable to remove directory {}: {error}",
                path_to_string(path)
            )
        })
    } else {
        Err(format!(
            "Unsupported entry type at {}",
            path_to_string(path)
        ))
    }
}

#[cfg(unix)]
pub fn create_symlink(source: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        ensure_dir(parent)?;
    }
    std::os::unix::fs::symlink(source, destination).map_err(|error| {
        format!(
            "Unable to symlink {} to {}: {error}",
            path_to_string(destination),
            path_to_string(source)
        )
    })
}

#[cfg(windows)]
pub fn create_symlink(source: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        ensure_dir(parent)?;
    }
    let res = if source.is_dir() {
        std::os::windows::fs::symlink_dir(source, destination)
    } else {
        std::os::windows::fs::symlink_file(source, destination)
    };
    res.map_err(|error| {
        format!(
            "Unable to symlink {} to {}: {error}. Note: On Windows, creating symlinks requires Administrator privileges or Developer Mode enabled.",
            path_to_string(destination),
            path_to_string(source)
        )
    })
}

#[cfg(not(any(unix, windows)))]
pub fn create_symlink(_source: &Path, _destination: &Path) -> Result<(), String> {
    Err("Symlink sync is only implemented for Unix-like and Windows systems".to_string())
}

pub fn set_dir_readonly(path: &Path, readonly: bool) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    for entry in WalkDir::new(path).follow_links(false) {
        let entry = entry.map_err(|error| format!("无法遍历目录 {}: {}", path_to_string(path), error))?;
        let p = entry.path();
        if let Ok(meta) = fs::symlink_metadata(p) {
            if !meta.file_type().is_symlink() {
                let mut perms = meta.permissions();
                perms.set_readonly(readonly);
                if let Err(e) = fs::set_permissions(p, perms) {
                    if meta.is_file() {
                        return Err(format!("无法设置文件权限 {}: {}", path_to_string(p), e));
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn folder_hash_changes_when_file_changes() {
        let temp = tempfile::tempdir().expect("temp dir");
        fs::write(temp.path().join("SKILL.md"), "one").expect("write one");
        let first = hash_dir(temp.path()).expect("first hash");
        fs::write(temp.path().join("SKILL.md"), "two").expect("write two");
        let second = hash_dir(temp.path()).expect("second hash");
        assert_ne!(first, second);
    }
}
