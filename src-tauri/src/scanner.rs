use crate::fs_ops::{ensure_dir, hash_dir, path_to_string, skill_slug_from_path};
use crate::models::{
    InventorySnapshot, ResolvedRoot, ScanOptions, SkillContent, SkillFrontmatter,
    SkillInstallation, SkillIssue, SkillRecord,
};
use crate::registry::{detect_agents, resolve_roots};
use crate::settings::{app_data_dir, load_settings};
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub fn scan(app: &AppHandle, options: ScanOptions) -> Result<InventorySnapshot, String> {
    let _ = crate::trash::clean_expired_trash_items(app);
    let settings = load_settings(app)?;
    let app_data = app_data_dir(app)?;
    let library_path = PathBuf::from(&settings.library_path);
    let roots = resolve_roots(&settings, options.include_orphaned);
    let agents = detect_agents(&settings, options.include_orphaned);

    let mut all_issues = Vec::new();
    let canonical = scan_canonical_library(app, &library_path, &mut all_issues)?;
    let mut grouped: BTreeMap<SkillGroupKey, Vec<SkillInstallation>> = BTreeMap::new();

    for root in &roots {
        scan_root(root, &library_path, &mut grouped, &mut all_issues)?;
    }

    let mut keys: BTreeSet<SkillGroupKey> = canonical.keys().cloned().collect();
    keys.extend(grouped.keys().cloned());
    let duplicated_slugs = duplicated_slugs(&keys);

    let mut skills = Vec::new();
    for key in keys {
        let slug = key.slug.clone();
        let installations = dedupe_installations(grouped.remove(&key).unwrap_or_default());
        let canonical_install = canonical.get(&key);
        let mut issues = installations
            .iter()
            .flat_map(|installation| installation.issues.clone())
            .collect::<Vec<_>>();

        let mut hashes = installations
            .iter()
            .filter_map(|installation| installation.hash.clone())
            .collect::<BTreeSet<_>>();
        if let Some(canonical_install) = canonical_install {
            if let Some(hash) = &canonical_install.hash {
                hashes.insert(hash.clone());
            }
        }
        let conflict = hashes.len() > 1;
        if conflict {
            let issue = SkillIssue {
                code: "content-conflict".to_string(),
                severity: "warning".to_string(),
                message: format!("Multiple content hashes found for skill '{slug}'"),
                path: None,
                agent_id: None,
            };
            issues.push(issue.clone());
            all_issues.push(issue);
        }

        let installed_agent_ids = installations
            .iter()
            .map(|installation| installation.agent_id.clone())
            .collect::<BTreeSet<_>>();
        let missing_agents = agents
            .iter()
            .filter(|agent| agent.installed && !installed_agent_ids.contains(&agent.id))
            .map(|agent| agent.id.clone())
            .collect::<Vec<_>>();

        let display_name = canonical_install
            .and_then(|installation| installation.frontmatter.as_ref())
            .and_then(|frontmatter| frontmatter.name.clone())
            .or_else(|| {
                installations
                    .iter()
                    .find_map(|installation| installation.frontmatter.as_ref()?.name.clone())
            })
            .unwrap_or_else(|| slug.clone());

        let description = canonical_install
            .and_then(|installation| installation.frontmatter.as_ref())
            .and_then(|frontmatter| frontmatter.description.clone())
            .or_else(|| {
                installations
                    .iter()
                    .find_map(|installation| installation.frontmatter.as_ref()?.description.clone())
            });

        skills.push(SkillRecord {
            id: if duplicated_slugs.contains(&slug) {
                format!("{}@{}", slug, short_fingerprint(&key.identity))
            } else {
                slug.clone()
            },
            slug,
            display_name,
            description,
            canonical_status: if canonical_install.is_some() {
                "imported".to_string()
            } else {
                "not-imported".to_string()
            },
            canonical_path: canonical_install.map(|installation| installation.entry_path.clone()),
            canonical_hash: canonical_install.and_then(|installation| installation.hash.clone()),
            installations,
            missing_agents,
            issues,
            conflict,
        });
    }

    Ok(InventorySnapshot {
        agents,
        roots,
        skills,
        issues: all_issues,
        scanned_at: Utc::now().to_rfc3339(),
        app_data_path: path_to_string(&app_data),
        library_path: path_to_string(&library_path),
    })
}

pub fn inventory_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("inventory-cache.json"))
}

pub fn read_inventory_cache(app: &AppHandle) -> Result<Option<InventorySnapshot>, String> {
    let path = inventory_cache_path(app)?;
    let Ok(text) = fs::read_to_string(&path) else {
        return Ok(None);
    };
    Ok(serde_json::from_str::<InventorySnapshot>(&text).ok())
}

pub fn write_inventory_cache(app: &AppHandle, snapshot: &InventorySnapshot) -> Result<(), String> {
    let path = inventory_cache_path(app)?;
    ensure_dir(path.parent().ok_or("Inventory cache path has no parent")?)?;
    let text = serde_json::to_string_pretty(snapshot)
        .map_err(|error| format!("Unable to serialize inventory cache: {error}"))?;
    fs::write(&path, text).map_err(|error| {
        format!(
            "Unable to write inventory cache {}: {error}",
            path_to_string(&path)
        )
    })
}

pub fn write_library_index(app: &AppHandle, snapshot: &InventorySnapshot) -> Result<(), String> {
    let settings = load_settings(app)?;
    let index_path = PathBuf::from(settings.library_path)
        .parent()
        .map(|parent| parent.join("index.json"))
        .ok_or_else(|| "Library path has no parent".to_string())?;
    if let Some(parent) = index_path.parent() {
        ensure_dir(parent)?;
    }
    let text = serde_json::to_string_pretty(&snapshot.skills)
        .map_err(|error| format!("Unable to serialize library index: {error}"))?;
    fs::write(&index_path, text).map_err(|error| {
        format!(
            "Unable to write library index {}: {error}",
            path_to_string(&index_path)
        )
    })
}

pub fn read_skill_content(skill_ref: crate::models::SkillRef) -> Result<SkillContent, String> {
    let entry_path = skill_ref
        .path
        .ok_or_else(|| "read_skill_content requires a path in this MVP".to_string())?;
    let entry_path = PathBuf::from(entry_path);
    let skill_md = entry_path.join("SKILL.md");
    let text = fs::read_to_string(&skill_md)
        .map_err(|error| format!("Unable to read {}: {error}", path_to_string(&skill_md)))?;
    let (frontmatter, body) = parse_skill_markdown(&text);
    let title = frontmatter
        .as_ref()
        .and_then(|frontmatter| frontmatter.name.clone())
        .or_else(|| skill_slug_from_path(&entry_path).ok())
        .unwrap_or_else(|| "Untitled Skill".to_string());

    Ok(SkillContent {
        path: path_to_string(&entry_path),
        title,
        frontmatter,
        content: text,
        markdown_body: body,
    })
}

fn scan_canonical_library(
    app: &AppHandle,
    library_path: &Path,
    issues: &mut Vec<SkillIssue>,
) -> Result<BTreeMap<SkillGroupKey, SkillInstallation>, String> {
    let mut canonical = BTreeMap::new();
    if !library_path.exists() {
        return Ok(canonical);
    }

    for entry in fs::read_dir(library_path).map_err(|error| {
        format!(
            "Unable to read central library {}: {error}",
            path_to_string(library_path)
        )
    })? {
        let entry = entry.map_err(|error| {
            format!(
                "Unable to read central library entry in {}: {error}",
                path_to_string(library_path)
            )
        })?;
        let path = entry.path();
        if is_hidden_skill_entry(&path) {
            continue;
        }
        if !entry
            .file_type()
            .map(|file_type| file_type.is_dir())
            .unwrap_or(false)
        {
            continue;
        }
        let slug = skill_slug_from_path(&path)?;
        let mut installation = inspect_installation(
            "library",
            "Central Library",
            "library",
            library_path,
            &path,
            library_path,
        );

        // 哈希审计
        if let Some(local_hash) = &installation.hash {
            if let Some(remote_hash) = get_remote_skill_hash(app, &slug) {
                if *local_hash != remote_hash {
                    let issue = SkillIssue {
                        code: "tampered-skill".to_string(),
                        severity: "error".to_string(),
                        message: format!(
                            "该技能的本地内容哈希与官方 Git 仓库缓存不符，已被非法修改（可能遭遇写穿透投毒）！请重新导入或更新技能。"
                        ),
                        path: Some(path_to_string(&path)),
                        agent_id: None,
                    };
                    installation.issues.push(issue.clone());
                    issues.push(issue);
                }
            }
        }

        for issue in &installation.issues {
            issues.push(issue.clone());
        }
        let key = group_key(&slug, &installation);
        canonical.insert(key, installation);
    }
    Ok(canonical)
}

fn scan_root(
    root: &ResolvedRoot,
    library_path: &Path,
    grouped: &mut BTreeMap<SkillGroupKey, Vec<SkillInstallation>>,
    issues: &mut Vec<SkillIssue>,
) -> Result<(), String> {
    let root_path = PathBuf::from(&root.path);
    if !root_path.exists() {
        return Ok(());
    }

    if root_path.join("SKILL.md").exists() {
        let slug = skill_slug_from_path(&root_path)?;
        let installation = inspect_installation(
            &root.agent_id,
            &root.agent_label,
            &root.scope,
            root_path.parent().unwrap_or(root_path.as_path()),
            &root_path,
            library_path,
        );
        for issue in &installation.issues {
            issues.push(issue.clone());
        }
        let key = group_key(&slug, &installation);
        grouped.entry(key).or_default().push(installation);
        return Ok(());
    }

    for entry in fs::read_dir(&root_path)
        .map_err(|error| format!("Unable to read root {}: {error}", root.path))?
    {
        let entry =
            entry.map_err(|error| format!("Unable to read entry in {}: {error}", root.path))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Unable to inspect {}: {error}", path_to_string(&path)))?;
        if !(metadata.is_dir() || metadata.file_type().is_symlink()) {
            continue;
        }
        if is_hidden_skill_entry(&path) {
            continue;
        }

        let slug = skill_slug_from_path(&path)?;
        let installation = inspect_installation(
            &root.agent_id,
            &root.agent_label,
            &root.scope,
            &root_path,
            &path,
            library_path,
        );
        for issue in &installation.issues {
            issues.push(issue.clone());
        }
        let key = group_key(&slug, &installation);
        grouped.entry(key).or_default().push(installation);
    }

    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct SkillGroupKey {
    slug: String,
    identity: String,
}

fn group_key(slug: &str, installation: &SkillInstallation) -> SkillGroupKey {
    SkillGroupKey {
        slug: slug.to_string(),
        identity: installation
            .real_path
            .clone()
            .unwrap_or_else(|| installation.entry_path.clone()),
    }
}

fn duplicated_slugs(keys: &BTreeSet<SkillGroupKey>) -> BTreeSet<String> {
    let mut counts = BTreeMap::<String, usize>::new();
    for key in keys {
        *counts.entry(key.slug.clone()).or_default() += 1;
    }
    counts
        .into_iter()
        .filter_map(|(slug, count)| (count > 1).then_some(slug))
        .collect()
}

fn dedupe_installations(installations: Vec<SkillInstallation>) -> Vec<SkillInstallation> {
    let mut seen = BTreeSet::new();
    installations
        .into_iter()
        .filter(|installation| seen.insert(installation.id.clone()))
        .collect()
}

fn short_fingerprint(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
        .chars()
        .take(12)
        .collect()
}

fn is_hidden_skill_entry(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            name.starts_with('.') 
            || name.contains(".bak_") 
            || name == "codex-primary-runtime" 
            || name.ends_with("-runtime")
        })
}

pub fn inspect_installation(
    agent_id: &str,
    agent_label: &str,
    scope: &str,
    root_path: &Path,
    entry_path: &Path,
    library_path: &Path,
) -> SkillInstallation {
    let metadata = fs::symlink_metadata(entry_path);
    let is_symlink = metadata
        .as_ref()
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false);
    let symlink_target = if is_symlink {
        fs::read_link(entry_path)
            .ok()
            .map(|target| path_to_string(&target))
    } else {
        None
    };
    let canonicalized = fs::canonicalize(entry_path);
    let broken_symlink = is_symlink && canonicalized.is_err();
    let real_path = canonicalized.as_ref().ok().map(|path| path_to_string(path));
    let inspect_path = canonicalized
        .as_ref()
        .map_or(entry_path, |path| path.as_path());
    let skill_md = inspect_path.join("SKILL.md");
    let slug = skill_slug_from_path(entry_path).unwrap_or_else(|_| "unknown".to_string());

    let mut issues = Vec::new();
    let mut frontmatter = None;
    let mut hash = None;
    let mut status = if is_symlink {
        "external-link"
    } else if scope == "plugin" {
        "plugin-installed"
    } else {
        "installed"
    }
    .to_string();

    if broken_symlink {
        status = "broken".to_string();
        issues.push(issue(
            "broken-symlink",
            "error",
            "This skill entry is a broken symlink",
            Some(entry_path),
            Some(agent_id),
        ));
    } else if !skill_md.exists() {
        status = "invalid".to_string();
        issues.push(issue(
            "missing-skill-md",
            "warning",
            "This folder is not a valid skill because SKILL.md is missing",
            Some(entry_path),
            Some(agent_id),
        ));
    } else {
        match fs::read_to_string(&skill_md) {
            Ok(text) => {
                let (parsed, _) = parse_skill_markdown(&text);
                if let Some(parsed) = parsed {
                    let is_mismatch = if cfg!(windows) {
                        parsed.name.as_deref().is_some_and(|name| name.to_uppercase() != slug.to_uppercase())
                    } else {
                        parsed.name.as_deref().is_some_and(|name| name != slug)
                    };
                    if is_mismatch {
                        issues.push(issue(
                            "name-mismatch",
                            "warning",
                            "Frontmatter name does not match the folder name",
                            Some(entry_path),
                            Some(agent_id),
                        ));
                    }

                    // 检测申请的高危工具
                    let dangerous_tools = ["bash", "sh", "cmd", "powershell", "execute_command", "run_command", "execute_bash", "terminal", "computer_control", "run_terminal_command"];
                    let requested_dangerous: Vec<String> = parsed.allowed_tools
                        .iter()
                        .filter(|tool| dangerous_tools.iter().any(|&d| tool.to_lowercase().contains(d)))
                        .cloned()
                        .collect();
                    if !requested_dangerous.is_empty() {
                        issues.push(issue(
                            "dangerous-tools-requested",
                            "warning",
                            &format!(
                                "该第三方技能申请使用高危系统工具：{:?}。为安全起见，请确保此技能来源可信，并限制大模型对其的授权。",
                                requested_dangerous
                            ),
                            Some(entry_path),
                            Some(agent_id),
                        ));
                    }

                    frontmatter = Some(parsed);
                } else {
                    issues.push(issue(
                        "missing-frontmatter",
                        "warning",
                        "SKILL.md does not start with valid frontmatter",
                        Some(entry_path),
                        Some(agent_id),
                    ));
                }
            }
            Err(error) => issues.push(issue(
                "unreadable-skill-md",
                "error",
                &format!("Unable to read SKILL.md: {error}"),
                Some(entry_path),
                Some(agent_id),
            )),
        }

        hash = hash_dir(inspect_path).ok();
        if is_symlink && inspect_path.starts_with(library_path) {
            status = "linked".to_string();
        }
    }

    SkillInstallation {
        id: format!("{agent_id}:{scope}:{}", path_to_string(entry_path)),
        agent_id: agent_id.to_string(),
        agent_label: agent_label.to_string(),
        scope: scope.to_string(),
        root_path: path_to_string(root_path),
        entry_path: path_to_string(entry_path),
        real_path,
        symlink_target,
        is_symlink,
        broken_symlink,
        hash,
        frontmatter,
        status,
        issues,
    }
}

pub fn parse_skill_markdown(text: &str) -> (Option<SkillFrontmatter>, String) {
    let Some(rest) = text.strip_prefix("---") else {
        return (None, text.to_string());
    };
    let rest = rest.strip_prefix('\n').unwrap_or(rest);
    let Some(end) = rest.find("\n---") else {
        return (None, text.to_string());
    };

    let raw = &rest[..end];
    let body = rest[end + "\n---".len()..]
        .strip_prefix('\n')
        .unwrap_or(&rest[end + "\n---".len()..])
        .to_string();

    (Some(parse_frontmatter(raw)), body)
}

fn parse_frontmatter(raw: &str) -> SkillFrontmatter {
    let mut fm = SkillFrontmatter {
        name: None,
        description: None,
        license: None,
        allowed_tools: Vec::new(),
        metadata: BTreeMap::new(),
    };
    let mut section: Option<String> = None;
    let lines = raw.lines().collect::<Vec<_>>();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index];
        index += 1;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(section_name) = &section {
            if trimmed.starts_with("- ") {
                if section_name == "allowed-tools" {
                    fm.allowed_tools
                        .push(clean_scalar(trimmed.trim_start_matches("- ")));
                }
                continue;
            }
            if line.starts_with(' ') || line.starts_with('\t') {
                if section_name == "metadata" {
                    if let Some((key, value)) = split_key_value(trimmed) {
                        fm.metadata.insert(key.to_string(), clean_scalar(value));
                    }
                }
                continue;
            }
        }

        section = None;
        let Some((key, value)) = split_key_value(trimmed) else {
            continue;
        };

        match key {
            "name" => fm.name = Some(clean_scalar(value)),
            "description" => {
                fm.description = if matches!(value, "|" | ">") {
                    Some(read_block_scalar(&lines, &mut index, value == ">"))
                } else {
                    Some(clean_scalar(value))
                }
            }
            "license" => fm.license = Some(clean_scalar(value)),
            "allowed-tools" => {
                if value.is_empty() {
                    section = Some("allowed-tools".to_string());
                } else {
                    fm.allowed_tools = parse_inline_list(value);
                }
            }
            "metadata" => {
                section = Some("metadata".to_string());
                if !value.is_empty() {
                    fm.metadata.insert("value".to_string(), clean_scalar(value));
                }
            }
            _ => {}
        }
    }

    fm
}

fn read_block_scalar(lines: &[&str], index: &mut usize, folded: bool) -> String {
    let mut block = Vec::new();

    while *index < lines.len() {
        let line = lines[*index];
        if !line.trim().is_empty() && !line.starts_with(' ') && !line.starts_with('\t') {
            break;
        }
        *index += 1;
        block.push(line.trim().to_string());
    }

    if folded {
        block.join(" ")
    } else {
        block.join("\n")
    }
    .trim()
    .to_string()
}

fn split_key_value(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once(':')?;
    Some((key.trim(), value.trim()))
}

fn parse_inline_list(value: &str) -> Vec<String> {
    let value = value.trim();
    let value = value
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(value);
    value
        .split(',')
        .map(clean_scalar)
        .filter(|item| !item.is_empty())
        .collect()
}

fn clean_scalar(value: &str) -> String {
    let value = value.trim();
    value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .or_else(|| {
            value
                .strip_prefix('\'')
                .and_then(|value| value.strip_suffix('\''))
        })
        .unwrap_or(value)
        .trim()
        .to_string()
}

fn issue(
    code: &str,
    severity: &str,
    message: &str,
    path: Option<&Path>,
    agent_id: Option<&str>,
) -> SkillIssue {
    SkillIssue {
        code: code.to_string(),
        severity: severity.to_string(),
        message: message.to_string(),
        path: path.map(path_to_string),
        agent_id: agent_id.map(|agent_id| agent_id.to_string()),
    }
}

fn find_skill_dirs_simple(base_path: &Path, current_path: &Path, depth: u32, results: &mut Vec<PathBuf>) {
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
            find_skill_dirs_simple(base_path, &path, depth + 1, results);
        }
    }
}

fn normalize_github_url_simple(source_url: &str) -> Result<String, String> {
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
    } else {
        let parts: Vec<&str> = trimmed_clean.split('/').collect();
        if parts.len() == 2 && parts.iter().all(|p| !p.is_empty()) {
            trimmed_clean.to_string()
        } else {
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                return Ok(trimmed.to_string());
            }
            return Err("Unsupported".to_string());
        }
    };
    Ok(format!("https://github.com/{path}.git"))
}

fn get_remote_skill_hash(app: &AppHandle, slug: &str) -> Option<String> {
    let settings = load_settings(app).ok()?;
    let repos = settings.skill_repositories.unwrap_or_default();
    let cache_repos_root = app_data_dir(app).ok()?
        .join("cache")
        .join("repos");
    if !cache_repos_root.exists() {
        return None;
    }
    for repo_url in repos {
        let clone_url = match normalize_github_url_simple(&repo_url) {
            Ok(url) => url,
            Err(_) => repo_url.clone(),
        };
        let mut hasher = Sha256::new();
        hasher.update(clone_url.as_bytes());
        let cache_dir_name = format!("{:x}", hasher.finalize());
        let repo_path = cache_repos_root.join(cache_dir_name);
        if repo_path.exists() {
            let mut candidates = Vec::new();
            find_skill_dirs_simple(&repo_path, &repo_path, 0, &mut candidates);
            for candidate in candidates {
                if candidate.file_name().and_then(|n| n.to_str()) == Some(slug) {
                    if let Ok(hash) = hash_dir(&candidate) {
                        return Some(hash);
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parses_frontmatter_and_body() {
        let input = "---\nname: blog-translator\ndescription: Translate blogs\nmetadata:\n  tags: writing, translation\n---\n# Body";
        let (frontmatter, body) = parse_skill_markdown(input);
        let frontmatter = frontmatter.expect("frontmatter");
        assert_eq!(frontmatter.name.as_deref(), Some("blog-translator"));
        assert_eq!(frontmatter.description.as_deref(), Some("Translate blogs"));
        assert_eq!(
            frontmatter.metadata.get("tags").map(String::as_str),
            Some("writing, translation")
        );
        assert_eq!(body, "# Body");
    }

    #[test]
    fn parses_literal_block_description() {
        let input = "---\nname: dbs-action\ndescription: |\n  第一行描述。\n  第二行触发方式。\nlicense: MIT\n---\n# Body";
        let (frontmatter, body) = parse_skill_markdown(input);
        let frontmatter = frontmatter.expect("frontmatter");

        assert_eq!(
            frontmatter.description.as_deref(),
            Some("第一行描述。\n第二行触发方式。")
        );
        assert_eq!(frontmatter.license.as_deref(), Some("MIT"));
        assert_eq!(body, "# Body");
    }

    #[test]
    fn detects_name_mismatch() {
        let temp = tempfile::tempdir().expect("temp dir");
        let skill = temp.path().join("folder-name");
        fs::create_dir_all(&skill).expect("skill dir");
        fs::write(
            skill.join("SKILL.md"),
            "---\nname: other-name\ndescription: Test\n---\nBody",
        )
        .expect("skill md");

        let installation =
            inspect_installation("test", "Test", "global", temp.path(), &skill, temp.path());
        assert!(installation
            .issues
            .iter()
            .any(|issue| issue.code == "name-mismatch"));
    }

    #[test]
    fn marks_plugin_installations_as_plugin_installed() {
        let temp = tempfile::tempdir().expect("temp dir");
        let skill = temp.path().join("plugin-skill");
        fs::create_dir_all(&skill).expect("skill dir");
        fs::write(
            skill.join("SKILL.md"),
            "---\nname: plugin-skill\ndescription: Plugin skill\n---\nBody",
        )
        .expect("skill md");

        let installation =
            inspect_installation("test", "Test", "plugin", temp.path(), &skill, temp.path());

        assert_eq!(installation.status, "plugin-installed");
    }

    #[test]
    fn scans_root_that_is_itself_a_skill() {
        let temp = tempfile::tempdir().expect("temp dir");
        let skill = temp.path().join("direct-skill");
        fs::create_dir_all(&skill).expect("skill dir");
        fs::write(
            skill.join("SKILL.md"),
            "---\nname: direct-skill\ndescription: Root skill\n---\nBody",
        )
        .expect("skill md");

        let root = ResolvedRoot {
            agent_id: "test".to_string(),
            agent_label: "Test".to_string(),
            scope: "global".to_string(),
            path: path_to_string(&skill),
            exists: true,
            active: true,
            orphaned: false,
        };
        let mut grouped = BTreeMap::new();
        let mut issues = Vec::new();

        scan_root(&root, temp.path(), &mut grouped, &mut issues).expect("scan root");

        assert!(grouped.keys().any(|key| key.slug == "direct-skill"));
        assert!(issues.is_empty());
    }

    #[test]
    fn separates_same_slug_from_different_paths() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root_a = temp.path().join("agent-a-skills");
        let root_b = temp.path().join("agent-b-skills");
        let skill_a = root_a.join("frontend-design");
        let skill_b = root_b.join("frontend-design");
        fs::create_dir_all(&skill_a).expect("skill a dir");
        fs::create_dir_all(&skill_b).expect("skill b dir");
        fs::write(
            skill_a.join("SKILL.md"),
            "---\nname: frontend-design\ndescription: Plugin copy\n---\nBody A",
        )
        .expect("skill a md");
        fs::write(
            skill_b.join("SKILL.md"),
            "---\nname: frontend-design\ndescription: Local copy\n---\nBody B",
        )
        .expect("skill b md");

        let root_a = ResolvedRoot {
            agent_id: "claude".to_string(),
            agent_label: "Claude Code".to_string(),
            scope: "global".to_string(),
            path: path_to_string(&root_a),
            exists: true,
            active: true,
            orphaned: false,
        };
        let root_b = ResolvedRoot {
            agent_id: "cursor".to_string(),
            agent_label: "Cursor".to_string(),
            scope: "global".to_string(),
            path: path_to_string(&root_b),
            exists: true,
            active: true,
            orphaned: false,
        };
        let mut grouped = BTreeMap::new();
        let mut issues = Vec::new();

        scan_root(&root_a, temp.path(), &mut grouped, &mut issues).expect("scan root a");
        scan_root(&root_b, temp.path(), &mut grouped, &mut issues).expect("scan root b");

        assert_eq!(
            grouped
                .keys()
                .filter(|key| key.slug == "frontend-design")
                .count(),
            2
        );
    }

    #[test]
    fn skips_hidden_entries_inside_skill_roots() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().join("skills");
        let hidden = root.join(".system");
        let visible = root.join("visible-skill");
        fs::create_dir_all(&hidden).expect("hidden dir");
        fs::create_dir_all(&visible).expect("visible dir");
        fs::write(
            visible.join("SKILL.md"),
            "---\nname: visible-skill\ndescription: Visible\n---\nBody",
        )
        .expect("visible skill md");

        let root = ResolvedRoot {
            agent_id: "test".to_string(),
            agent_label: "Test".to_string(),
            scope: "global".to_string(),
            path: path_to_string(&root),
            exists: true,
            active: true,
            orphaned: false,
        };
        let mut grouped = BTreeMap::new();
        let mut issues = Vec::new();

        scan_root(&root, temp.path(), &mut grouped, &mut issues).expect("scan root");

        assert!(grouped.keys().any(|key| key.slug == "visible-skill"));
        assert!(!grouped.keys().any(|key| key.slug == ".system"));
        assert!(issues.iter().all(|issue| {
            issue
                .path
                .as_deref()
                .map_or(true, |path| !path.ends_with(".system"))
        }));
    }

    #[test]
    fn skips_backup_entries_inside_skill_roots() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().join("skills");
        let backup = root.join("frontend-design.bak_20260624_115229");
        let visible = root.join("visible-skill");
        fs::create_dir_all(&backup).expect("backup dir");
        fs::create_dir_all(&visible).expect("visible dir");
        fs::write(
            visible.join("SKILL.md"),
            "---\nname: visible-skill\ndescription: Visible\n---\nBody",
        )
        .expect("visible skill md");
        fs::write(
            backup.join("SKILL.md"),
            "---\nname: frontend-design\ndescription: Backup\n---\nBody",
        )
        .expect("backup skill md");

        let root = ResolvedRoot {
            agent_id: "test".to_string(),
            agent_label: "Test".to_string(),
            scope: "global".to_string(),
            path: path_to_string(&root),
            exists: true,
            active: true,
            orphaned: false,
        };
        let mut grouped = BTreeMap::new();
        let mut issues = Vec::new();

        scan_root(&root, temp.path(), &mut grouped, &mut issues).expect("scan root");

        assert!(grouped.keys().any(|key| key.slug == "visible-skill"));
        assert!(!grouped.keys().any(|key| key.slug == "frontend-design"));
        assert!(!grouped.keys().any(|key| key.slug == "frontend-design.bak_20260624_115229"));
    }

    #[test]
    fn detects_dangerous_tools() {
        let temp = tempfile::tempdir().expect("temp dir");
        let skill = temp.path().join("evil-skill");
        fs::create_dir_all(&skill).expect("skill dir");
        fs::write(
            skill.join("SKILL.md"),
            "---\nname: evil-skill\ndescription: test\nallowed-tools:\n  - run_command\n  - some_safe_tool\n---\nBody",
        )
        .expect("skill md");

        let installation =
            inspect_installation("test", "Test", "global", temp.path(), &skill, temp.path());
        assert!(installation
            .issues
            .iter()
            .any(|issue| issue.code == "dangerous-tools-requested"));
    }
}
