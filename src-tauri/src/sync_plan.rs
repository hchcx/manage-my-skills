use crate::fs_ops::{
    copy_dir_recursive, create_symlink, ensure_dir, hash_dir, move_path, path_to_string,
    remove_entry,
};
use crate::models::{
    AgentTarget, ApplyResult, InstallationRef, ScanOptions, SyncOperation, SyncPlan,
};
use crate::registry::{detect_agents, find_agent};
use crate::scanner::{inspect_installation, scan, write_library_index};
use crate::settings::{app_data_dir, load_settings};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub fn preview_adopt(app: &AppHandle, source: InstallationRef) -> Result<SyncPlan, String> {
    let settings = load_settings(app)?;
    let source_path = PathBuf::from(&source.entry_path);
    let destination = PathBuf::from(&settings.library_path).join(&source.slug);
    let plan_id = plan_id("adopt");
    let created_at = Utc::now().to_rfc3339();
    let mut operations = Vec::new();
    let mut blocked_conflicts = Vec::new();
    let mut preconditions = Vec::new();

    let source_hash = hash_dir(&source_path)?;
    let skill_md = source_path.join("SKILL.md");
    if !skill_md.exists() {
        blocked_conflicts.push(format!(
            "{} is missing SKILL.md and cannot be adopted",
            path_to_string(&source_path)
        ));
    }

    if destination.exists() {
        let existing_hash = hash_dir(&destination)?;
        if existing_hash == source_hash {
            operations.push(operation(
                "noop",
                "noop",
                Some(&source_path),
                Some(&destination),
                None,
                &format!("{} is already imported with the same content", source.slug),
                None,
                Some(&source.slug),
            ));
        } else {
            blocked_conflicts.push(format!(
                "{} already exists in the central library with different content",
                source.slug
            ));
        }
    } else {
        preconditions.push("Copy source skill into the central library".to_string());
        operations.push(operation(
            "copy-to-library",
            "planned",
            Some(&source_path),
            Some(&destination),
            None,
            &format!("Import {} into the central library", source.slug),
            None,
            Some(&source.slug),
        ));
    }

    let plan = SyncPlan {
        plan_id,
        kind: "adopt".to_string(),
        risk_level: if blocked_conflicts.is_empty() {
            "low"
        } else {
            "blocked"
        }
        .to_string(),
        operations,
        preconditions,
        blocked_conflicts,
        created_at,
    };
    save_plan(app, &plan)?;
    Ok(plan)
}

pub fn preview_sync(
    app: &AppHandle,
    skill_id: String,
    targets: Vec<AgentTarget>,
) -> Result<SyncPlan, String> {
    let settings = load_settings(app)?;
    let library_path = PathBuf::from(&settings.library_path);
    let source_path = library_path.join(&skill_id);
    let plan_id = plan_id("sync");
    let created_at = Utc::now().to_rfc3339();
    let backup_root = app_data_dir(app)?.join("backups").join(&plan_id);
    let mut operations = Vec::new();
    let mut blocked_conflicts = Vec::new();
    let mut preconditions = Vec::new();

    let source_hash = if !source_path.join("SKILL.md").exists() {
        blocked_conflicts.push(format!(
            "{} is not imported into the central library yet",
            skill_id
        ));
        None
    } else {
        Some(hash_dir(&source_path)?)
    };

    append_sync_operations(
        &settings,
        &skill_id,
        &source_path,
        source_hash.as_deref(),
        targets,
        &backup_root,
        &mut operations,
        &mut blocked_conflicts,
        &mut preconditions,
    );

    let plan = sync_plan_from_parts(
        plan_id,
        "sync",
        operations,
        preconditions,
        blocked_conflicts,
        created_at,
    );
    save_plan(app, &plan)?;
    Ok(plan)
}

pub fn preview_sync_from_installation(
    app: &AppHandle,
    source: InstallationRef,
    targets: Vec<AgentTarget>,
) -> Result<SyncPlan, String> {
    let settings = load_settings(app)?;
    let source_path = PathBuf::from(&source.entry_path);
    let destination = PathBuf::from(&settings.library_path).join(&source.slug);
    let plan_id = plan_id("sync");
    let created_at = Utc::now().to_rfc3339();
    let backup_root = app_data_dir(app)?.join("backups").join(&plan_id);
    let mut operations = Vec::new();
    let mut blocked_conflicts = Vec::new();
    let mut preconditions = Vec::new();

    if source.entry_path.is_empty() || !source_path.join("SKILL.md").exists() {
        blocked_conflicts.push(format!(
            "{} has no valid source SKILL.md and cannot be synced",
            source.slug
        ));
    }

    let source_hash = if blocked_conflicts.is_empty() {
        Some(hash_dir(&source_path)?)
    } else {
        None
    };

    if let Some(source_hash) = &source_hash {
        if destination.exists() {
            let existing_hash = hash_dir(&destination)?;
            if existing_hash == *source_hash {
                operations.push(operation(
                    "noop",
                    "noop",
                    Some(&source_path),
                    Some(&destination),
                    None,
                    &format!("{} is already imported with the same content", source.slug),
                    None,
                    Some(&source.slug),
                ));
            } else {
                blocked_conflicts.push(format!(
                    "{} already exists in the central library with different content",
                    source.slug
                ));
            }
        } else {
            preconditions
                .push("Copy source skill into the central library before linking".to_string());
            operations.push(operation(
                "copy-to-library",
                "planned",
                Some(&source_path),
                Some(&destination),
                None,
                &format!("Import {} into the central library", source.slug),
                None,
                Some(&source.slug),
            ));
        }
    }

    append_sync_operations(
        &settings,
        &source.slug,
        &destination,
        source_hash.as_deref(),
        targets,
        &backup_root,
        &mut operations,
        &mut blocked_conflicts,
        &mut preconditions,
    );

    let plan = sync_plan_from_parts(
        plan_id,
        "sync",
        operations,
        preconditions,
        blocked_conflicts,
        created_at,
    );
    save_plan(app, &plan)?;
    Ok(plan)
}

pub fn preview_quick_migration(
    app: &AppHandle,
    source: InstallationRef,
    targets: Vec<AgentTarget>,
    method: String,
) -> Result<SyncPlan, String> {
    let settings = load_settings(app)?;
    let source_path = PathBuf::from(&source.entry_path);
    let plan_id = plan_id("quick-migrate");
    let created_at = Utc::now().to_rfc3339();
    let backup_root = app_data_dir(app)?.join("backups").join(&plan_id);
    let mut operations = Vec::new();
    let mut blocked_conflicts = Vec::new();
    let mut preconditions = Vec::new();

    if source.entry_path.is_empty() || !source_path.join("SKILL.md").exists() {
        blocked_conflicts.push(format!(
            "{} has no valid source SKILL.md and cannot be migrated",
            source.slug
        ));
    }

    let source_hash = if blocked_conflicts.is_empty() {
        Some(hash_dir(&source_path)?)
    } else {
        None
    };

    append_quick_migration_operations(
        &settings,
        &source.slug,
        &source_path,
        source_hash.as_deref(),
        targets,
        &method,
        &backup_root,
        &mut operations,
        &mut blocked_conflicts,
        &mut preconditions,
    );

    let plan = sync_plan_from_parts(
        plan_id,
        "quick-migrate",
        operations,
        preconditions,
        blocked_conflicts,
        created_at,
    );
    save_plan(app, &plan)?;
    Ok(plan)
}

pub fn preview_batch_sync(
    app: &AppHandle,
    sources: Vec<InstallationRef>,
    targets: Vec<AgentTarget>,
) -> Result<SyncPlan, String> {
    let settings = load_settings(app)?;
    let library_path = PathBuf::from(&settings.library_path);
    let plan_id = plan_id("batch-sync");
    let created_at = Utc::now().to_rfc3339();
    let backup_root = app_data_dir(app)?.join("backups").join(&plan_id);
    let mut operations = Vec::new();
    let mut blocked_conflicts = Vec::new();
    let mut preconditions = Vec::new();

    for source in sources {
        let destination = library_path.join(&source.slug);
        let source_path = if source.entry_path.is_empty() {
            destination.clone()
        } else {
            PathBuf::from(&source.entry_path)
        };

        if source.entry_path.is_empty() {
            let source_hash = if !source_path.join("SKILL.md").exists() {
                blocked_conflicts.push(format!(
                    "{} is not imported into the central library yet",
                    source.slug
                ));
                None
            } else {
                Some(hash_dir(&source_path)?)
            };

            append_sync_operations(
                &settings,
                &source.slug,
                &source_path,
                source_hash.as_deref(),
                targets.clone(),
                &backup_root,
                &mut operations,
                &mut blocked_conflicts,
                &mut preconditions,
            );
            continue;
        }

        if !source_path.join("SKILL.md").exists() {
            blocked_conflicts.push(format!(
                "{} has no valid source SKILL.md and cannot be synced",
                source.slug
            ));
            append_sync_operations(
                &settings,
                &source.slug,
                &destination,
                None,
                targets.clone(),
                &backup_root,
                &mut operations,
                &mut blocked_conflicts,
                &mut preconditions,
            );
            continue;
        }

        let source_hash = hash_dir(&source_path)?;
        if destination.exists() {
            let existing_hash = hash_dir(&destination)?;
            if existing_hash == source_hash {
                operations.push(operation(
                    "noop",
                    "noop",
                    Some(&source_path),
                    Some(&destination),
                    None,
                    &format!("{} is already imported with the same content", source.slug),
                    None,
                    Some(&source.slug),
                ));
            } else {
                blocked_conflicts.push(format!(
                    "{} already exists in the central library with different content",
                    source.slug
                ));
            }
        } else {
            preconditions
                .push("Copy source skill into the central library before linking".to_string());
            operations.push(operation(
                "copy-to-library",
                "planned",
                Some(&source_path),
                Some(&destination),
                None,
                &format!("Import {} into the central library", source.slug),
                None,
                Some(&source.slug),
            ));
        }

        append_sync_operations(
            &settings,
            &source.slug,
            &destination,
            Some(&source_hash),
            targets.clone(),
            &backup_root,
            &mut operations,
            &mut blocked_conflicts,
            &mut preconditions,
        );
    }

    let plan = sync_plan_from_parts(
        plan_id,
        "batch-sync",
        operations,
        preconditions,
        blocked_conflicts,
        created_at,
    );
    save_plan(app, &plan)?;
    Ok(plan)
}

pub fn preview_batch_quick_migration(
    app: &AppHandle,
    sources: Vec<InstallationRef>,
    targets: Vec<AgentTarget>,
    method: String,
) -> Result<SyncPlan, String> {
    let settings = load_settings(app)?;
    let plan_id = plan_id("batch-quick-migrate");
    let created_at = Utc::now().to_rfc3339();
    let backup_root = app_data_dir(app)?.join("backups").join(&plan_id);
    let mut operations = Vec::new();
    let mut blocked_conflicts = Vec::new();
    let mut preconditions = Vec::new();

    for source in sources {
        let source_path = PathBuf::from(&source.entry_path);
        if source.entry_path.is_empty() || !source_path.join("SKILL.md").exists() {
            blocked_conflicts.push(format!(
                "{} has no valid source SKILL.md and cannot be migrated",
                source.slug
            ));
            append_quick_migration_operations(
                &settings,
                &source.slug,
                &source_path,
                None,
                targets.clone(),
                &method,
                &backup_root,
                &mut operations,
                &mut blocked_conflicts,
                &mut preconditions,
            );
            continue;
        }

        let source_hash = hash_dir(&source_path)?;
        append_quick_migration_operations(
            &settings,
            &source.slug,
            &source_path,
            Some(&source_hash),
            targets.clone(),
            &method,
            &backup_root,
            &mut operations,
            &mut blocked_conflicts,
            &mut preconditions,
        );
    }

    let plan = sync_plan_from_parts(
        plan_id,
        "batch-quick-migrate",
        operations,
        preconditions,
        blocked_conflicts,
        created_at,
    );
    save_plan(app, &plan)?;
    Ok(plan)
}

fn append_quick_migration_operations(
    settings: &crate::models::Settings,
    skill_id: &str,
    source_path: &Path,
    source_hash: Option<&str>,
    targets: Vec<AgentTarget>,
    method: &str,
    backup_root: &Path,
    operations: &mut Vec<SyncOperation>,
    blocked_conflicts: &mut Vec<String>,
    preconditions: &mut Vec<String>,
) {
    let installed_agent_ids = detect_agents(settings, false)
        .into_iter()
        .filter(|agent| agent.installed)
        .map(|agent| agent.id)
        .collect::<std::collections::BTreeSet<_>>();

    let targets = if targets.is_empty() {
        default_targets(settings)
    } else {
        targets
    };

    for target in targets {
        let Some(agent) = find_agent(settings, &target.agent_id) else {
            blocked_conflicts.push(format!("Unknown agent id '{}'", target.agent_id));
            continue;
        };
        if method == "symlink" && !agent.symlink_support {
            blocked_conflicts.push(format!(
                "{} does not support symlink migration",
                agent.label
            ));
            continue;
        }
        if !installed_agent_ids.contains(&agent.id) {
            blocked_conflicts.push(format!("{} is not detected as installed", agent.label));
            continue;
        }
        let target_roots = target_roots_for_agent(&agent, &target, settings);
        if target_roots.is_empty() {
            let scope = target.scope.as_deref().unwrap_or("global");
            blocked_conflicts.push(format!(
                "{} has no {scope} skill root configured",
                agent.label
            ));
            continue;
        }

        for (scope, root_path) in target_roots {
            let target_path = root_path.join(skill_id);
            if target_path == source_path {
                operations.push(operation(
                    "noop",
                    "noop",
                    Some(source_path),
                    Some(&target_path),
                    None,
                    &format!("{} is already in {}", skill_id, agent.label),
                    Some(&agent.id),
                    Some(skill_id),
                ));
                continue;
            }

            if !root_path.exists() {
                preconditions.push(format!("Create {} {scope} skill root", agent.label));
                operations.push(operation(
                    "create-root",
                    "planned",
                    None,
                    Some(&root_path),
                    None,
                    &format!("Create {scope} skill root for {}", agent.label),
                    Some(&agent.id),
                    Some(skill_id),
                ));
            }

            plan_quick_target(
                &agent.id,
                &agent.label,
                skill_id,
                source_path,
                source_hash,
                &root_path,
                &target_path,
                method,
                backup_root,
                operations,
                blocked_conflicts,
            );
        }
    }
}

fn append_sync_operations(
    settings: &crate::models::Settings,
    skill_id: &str,
    source_path: &Path,
    source_hash: Option<&str>,
    targets: Vec<AgentTarget>,
    backup_root: &Path,
    operations: &mut Vec<SyncOperation>,
    blocked_conflicts: &mut Vec<String>,
    preconditions: &mut Vec<String>,
) {
    let installed_agent_ids = detect_agents(&settings, false)
        .into_iter()
        .filter(|agent| agent.installed)
        .map(|agent| agent.id)
        .collect::<std::collections::BTreeSet<_>>();

    let targets = if targets.is_empty() {
        default_targets(&settings)
    } else {
        targets
    };

    for target in targets {
        let Some(agent) = find_agent(settings, &target.agent_id) else {
            blocked_conflicts.push(format!("Unknown agent id '{}'", target.agent_id));
            continue;
        };
        if !agent.symlink_support {
            blocked_conflicts.push(format!("{} does not support symlink sync", agent.label));
            continue;
        }
        if !installed_agent_ids.contains(&agent.id) {
            blocked_conflicts.push(format!("{} is not detected as installed", agent.label));
            continue;
        }
        let target_roots = target_roots_for_agent(&agent, &target, &settings);
        if target_roots.is_empty() {
            let scope = target.scope.as_deref().unwrap_or("global");
            blocked_conflicts.push(format!(
                "{} has no {scope} skill root configured",
                agent.label
            ));
            continue;
        }

        for (scope, root_path) in target_roots {
            let target_path = root_path.join(&skill_id);
            if !root_path.exists() {
                preconditions.push(format!("Create {} {scope} skill root", agent.label));
                operations.push(operation(
                    "create-root",
                    "planned",
                    None,
                    Some(&root_path),
                    None,
                    &format!("Create {scope} skill root for {}", agent.label),
                    Some(&agent.id),
                    Some(&skill_id),
                ));
            }

            plan_target_sync(
                &agent.id,
                &agent.label,
                skill_id,
                source_path,
                source_hash,
                &root_path,
                &target_path,
                backup_root,
                operations,
                blocked_conflicts,
            );
        }
    }
}

fn sync_plan_from_parts(
    plan_id: String,
    kind: &str,
    operations: Vec<SyncOperation>,
    preconditions: Vec<String>,
    blocked_conflicts: Vec<String>,
    created_at: String,
) -> SyncPlan {
    let risk_level = if !blocked_conflicts.is_empty() {
        "blocked"
    } else if operations
        .iter()
        .any(|operation| operation.op_type == "backup-existing")
    {
        "medium"
    } else {
        "low"
    };

    SyncPlan {
        plan_id,
        kind: kind.to_string(),
        risk_level: risk_level.to_string(),
        operations,
        preconditions,
        blocked_conflicts,
        created_at,
    }
}

pub fn apply_plan(app: &AppHandle, plan_id: String) -> Result<ApplyResult, String> {
    let plan = load_plan(app, &plan_id)?;
    let mut applied_operations = Vec::new();
    let mut skipped_operations = Vec::new();
    let mut errors = Vec::new();

    if !plan.blocked_conflicts.is_empty() {
        return Ok(ApplyResult {
            plan_id,
            applied_operations,
            skipped_operations: plan
                .operations
                .iter()
                .map(|operation| operation.id.clone())
                .collect(),
            errors: plan.blocked_conflicts,
            inventory_refresh_recommended: false,
        });
    }

    for operation in &plan.operations {
        if operation.status == "noop" {
            skipped_operations.push(operation.id.clone());
            continue;
        }
        let result = match operation.op_type.as_str() {
            "copy-to-library" => {
                let source = required_path(operation.source_path.as_deref(), operation)?;
                let target = required_path(operation.target_path.as_deref(), operation)?;
                copy_dir_recursive(&source, &target)?;
                let _ = crate::fs_ops::set_dir_readonly(&target, true);
                Ok(())
            }
            "copy-to-target" => {
                let source = required_path(operation.source_path.as_deref(), operation)?;
                let target = required_path(operation.target_path.as_deref(), operation)?;
                copy_dir_recursive(&source, &target)
            }
            "create-root" => {
                let target = required_path(operation.target_path.as_deref(), operation)?;
                ensure_dir(&target)
            }
            "remove-existing" => {
                let target = required_path(operation.target_path.as_deref(), operation)?;
                remove_entry(&target)
            }
            "backup-existing" => {
                let source = required_path(operation.target_path.as_deref(), operation)?;
                let backup = required_path(operation.backup_path.as_deref(), operation)?;
                move_path(&source, &backup)
            }
            "create-symlink" => {
                let source = required_path(operation.source_path.as_deref(), operation)?;
                let target = required_path(operation.target_path.as_deref(), operation)?;
                create_symlink(&source, &target)
            }
            _ => Ok(()),
        };

        match result {
            Ok(()) => applied_operations.push(operation.id.clone()),
            Err(error) => errors.push(format!("{}: {error}", operation.message)),
        }

        if !errors.is_empty() {
            break;
        }
    }

    write_history(app, &plan, &applied_operations, &errors)?;
    if plan.kind == "adopt" && errors.is_empty() {
        let snapshot = scan(
            app,
            ScanOptions {
                include_orphaned: false,
            },
        )?;
        write_library_index(app, &snapshot)?;
    }

    Ok(ApplyResult {
        plan_id,
        applied_operations,
        skipped_operations,
        errors,
        inventory_refresh_recommended: true,
    })
}

fn plan_target_sync(
    agent_id: &str,
    agent_label: &str,
    skill_id: &str,
    source_path: &Path,
    source_hash: Option<&str>,
    root_path: &Path,
    target_path: &Path,
    backup_root: &Path,
    operations: &mut Vec<SyncOperation>,
    blocked_conflicts: &mut Vec<String>,
) {
    let backup_path = backup_root.join(agent_id).join(skill_id);
    let source_hash = source_hash.unwrap_or_default();

    if fs::symlink_metadata(target_path).is_err() {
        operations.push(operation(
            "create-symlink",
            "planned",
            Some(source_path),
            Some(target_path),
            None,
            &format!("Link {} into {}", skill_id, agent_label),
            Some(agent_id),
            Some(skill_id),
        ));
        return;
    }

    let installation = inspect_installation(
        agent_id,
        agent_label,
        "global",
        root_path,
        target_path,
        source_path.parent().unwrap_or(source_path),
    );

    if installation.broken_symlink {
        operations.push(operation(
            "remove-existing",
            "planned",
            None,
            Some(target_path),
            None,
            &format!("Remove broken symlink in {}", agent_label),
            Some(agent_id),
            Some(skill_id),
        ));
        operations.push(operation(
            "create-symlink",
            "planned",
            Some(source_path),
            Some(target_path),
            None,
            &format!("Relink {} into {}", skill_id, agent_label),
            Some(agent_id),
            Some(skill_id),
        ));
        return;
    }

    if installation.real_path.as_deref() == Some(&path_to_string(source_path)) {
        operations.push(operation(
            "noop",
            "noop",
            Some(source_path),
            Some(target_path),
            None,
            &format!("{} is already linked into {}", skill_id, agent_label),
            Some(agent_id),
            Some(skill_id),
        ));
        return;
    }

    if let Some(hash) = &installation.hash {
        if hash == source_hash {
            operations.push(operation(
                "backup-existing",
                "planned",
                None,
                Some(target_path),
                Some(&backup_path),
                &format!("Back up existing same-content skill in {}", agent_label),
                Some(agent_id),
                Some(skill_id),
            ));
            operations.push(operation(
                "create-symlink",
                "planned",
                Some(source_path),
                Some(target_path),
                None,
                &format!("Link central {} into {}", skill_id, agent_label),
                Some(agent_id),
                Some(skill_id),
            ));
        } else {
            blocked_conflicts.push(format!(
                "{} already has {} with different content",
                agent_label, skill_id
            ));
        }
    } else {
        blocked_conflicts.push(format!(
            "{} has an invalid or unreadable {} entry",
            agent_label, skill_id
        ));
    }
}

fn plan_quick_target(
    agent_id: &str,
    agent_label: &str,
    skill_id: &str,
    source_path: &Path,
    source_hash: Option<&str>,
    root_path: &Path,
    target_path: &Path,
    method: &str,
    backup_root: &Path,
    operations: &mut Vec<SyncOperation>,
    blocked_conflicts: &mut Vec<String>,
) {
    let backup_path = backup_root.join(agent_id).join(skill_id);
    let source_hash = source_hash.unwrap_or_default();
    let final_op = if method == "symlink" {
        "create-symlink"
    } else {
        "copy-to-target"
    };
    let final_message = if method == "symlink" {
        format!("Link {} into {}", skill_id, agent_label)
    } else {
        format!("Copy {} into {}", skill_id, agent_label)
    };

    if fs::symlink_metadata(target_path).is_err() {
        operations.push(operation(
            final_op,
            "planned",
            Some(source_path),
            Some(target_path),
            None,
            &final_message,
            Some(agent_id),
            Some(skill_id),
        ));
        return;
    }

    let installation = inspect_installation(
        agent_id,
        agent_label,
        "global",
        root_path,
        target_path,
        source_path.parent().unwrap_or(source_path),
    );

    if installation.broken_symlink {
        operations.push(operation(
            "remove-existing",
            "planned",
            None,
            Some(target_path),
            None,
            &format!("Remove broken symlink in {}", agent_label),
            Some(agent_id),
            Some(skill_id),
        ));
        operations.push(operation(
            final_op,
            "planned",
            Some(source_path),
            Some(target_path),
            None,
            &final_message,
            Some(agent_id),
            Some(skill_id),
        ));
        return;
    }

    if installation.real_path.as_deref() == Some(&path_to_string(source_path)) {
        operations.push(operation(
            "noop",
            "noop",
            Some(source_path),
            Some(target_path),
            None,
            &format!("{} is already linked into {}", skill_id, agent_label),
            Some(agent_id),
            Some(skill_id),
        ));
        return;
    }

    if let Some(hash) = &installation.hash {
        if hash == source_hash {
            if method == "copy" {
                operations.push(operation(
                    "noop",
                    "noop",
                    Some(source_path),
                    Some(target_path),
                    None,
                    &format!(
                        "{} already exists with the same content in {}",
                        skill_id, agent_label
                    ),
                    Some(agent_id),
                    Some(skill_id),
                ));
            } else {
                operations.push(operation(
                    "backup-existing",
                    "planned",
                    None,
                    Some(target_path),
                    Some(&backup_path),
                    &format!("Back up existing same-content skill in {}", agent_label),
                    Some(agent_id),
                    Some(skill_id),
                ));
                operations.push(operation(
                    final_op,
                    "planned",
                    Some(source_path),
                    Some(target_path),
                    None,
                    &final_message,
                    Some(agent_id),
                    Some(skill_id),
                ));
            }
        } else {
            blocked_conflicts.push(format!(
                "{} already has {} with different content",
                agent_label, skill_id
            ));
        }
    } else {
        blocked_conflicts.push(format!(
            "{} has an invalid or unreadable {} entry",
            agent_label, skill_id
        ));
    }
}

fn default_targets(settings: &crate::models::Settings) -> Vec<AgentTarget> {
    crate::registry::detect_agents(settings, false)
        .into_iter()
        .filter(|agent| agent.installed)
        .map(|agent| AgentTarget {
            agent_id: agent.id,
            scope: Some("global".to_string()),
            project_path: None,
        })
        .collect()
}

pub(crate) fn target_roots_for_agent(
    agent: &crate::models::AgentDefinition,
    target: &AgentTarget,
    settings: &crate::models::Settings,
) -> Vec<(String, PathBuf)> {
    match target.scope.as_deref().unwrap_or("global") {
        "project" => {
            if let Some(project_path) = target
                .project_path
                .as_deref()
                .map(str::trim)
                .filter(|path| !path.is_empty())
            {
                return project_roots_for_folder(agent, project_path);
            }

            settings
                .project_folders
                .iter()
                .flat_map(|folder| project_roots_for_folder(agent, folder))
                .collect()
        }
        _ => agent
            .global_roots
            .iter()
            .map(|root| ("global".to_string(), crate::fs_ops::expand_home(root)))
            .collect(),
    }
}

fn project_roots_for_folder(
    agent: &crate::models::AgentDefinition,
    project_path: &str,
) -> Vec<(String, PathBuf)> {
    let project_path = crate::fs_ops::expand_home(project_path);
    let roots = agent
        .project_roots
        .iter()
        .map(|root| ("project".to_string(), project_path.join(root)))
        .collect::<Vec<_>>();
    let existing_roots = roots
        .iter()
        .filter(|(_, root)| root.exists())
        .cloned()
        .collect::<Vec<_>>();

    if existing_roots.is_empty() {
        roots.into_iter().take(1).collect()
    } else {
        existing_roots
    }
}

fn operation(
    op_type: &str,
    status: &str,
    source_path: Option<&Path>,
    target_path: Option<&Path>,
    backup_path: Option<&Path>,
    message: &str,
    agent_id: Option<&str>,
    skill_id: Option<&str>,
) -> SyncOperation {
    let seed = format!(
        "{}:{}:{}:{}:{}:{}",
        op_type,
        agent_id.unwrap_or_default(),
        skill_id.unwrap_or_default(),
        source_path.map(path_to_string).unwrap_or_default(),
        target_path.map(path_to_string).unwrap_or_default(),
        message
    );
    SyncOperation {
        id: stable_id(&seed),
        op_type: op_type.to_string(),
        status: status.to_string(),
        source_path: source_path.map(path_to_string),
        target_path: target_path.map(path_to_string),
        backup_path: backup_path.map(path_to_string),
        message: message.to_string(),
        agent_id: agent_id.map(|agent_id| agent_id.to_string()),
        skill_id: skill_id.map(|skill_id| skill_id.to_string()),
    }
}

fn stable_id(seed: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    format!("{:x}", hasher.finalize())[..16].to_string()
}

fn plan_id(prefix: &str) -> String {
    format!("{}-{}", prefix, Utc::now().timestamp_millis())
}

fn required_path(value: Option<&str>, operation: &SyncOperation) -> Result<PathBuf, String> {
    value
        .map(PathBuf::from)
        .ok_or_else(|| format!("Operation {} is missing a required path", operation.id))
}

fn plans_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("plans"))
}

fn save_plan(app: &AppHandle, plan: &SyncPlan) -> Result<(), String> {
    let dir = plans_dir(app)?;
    ensure_dir(&dir)?;
    let path = dir.join(format!("{}.json", plan.plan_id));
    let text = serde_json::to_string_pretty(plan)
        .map_err(|error| format!("Unable to serialize sync plan: {error}"))?;
    fs::write(&path, text).map_err(|error| {
        format!(
            "Unable to write sync plan {}: {error}",
            path_to_string(&path)
        )
    })
}

fn load_plan(app: &AppHandle, plan_id: &str) -> Result<SyncPlan, String> {
    let path = plans_dir(app)?.join(format!("{plan_id}.json"));
    let text = fs::read_to_string(&path).map_err(|error| {
        format!(
            "Unable to read sync plan {}: {error}",
            path_to_string(&path)
        )
    })?;
    serde_json::from_str(&text).map_err(|error| {
        format!(
            "Unable to parse sync plan {}: {error}",
            path_to_string(&path)
        )
    })
}

fn write_history(
    app: &AppHandle,
    plan: &SyncPlan,
    applied_operations: &[String],
    errors: &[String],
) -> Result<(), String> {
    let path = app_data_dir(app)?.join("sync-history.json");
    let mut history = if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<Vec<serde_json::Value>>(&text).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    history.push(serde_json::json!({
        "planId": plan.plan_id,
        "kind": plan.kind,
        "appliedAt": Utc::now().to_rfc3339(),
        "appliedOperations": applied_operations,
        "errors": errors
    }));
    let text = serde_json::to_string_pretty(&history)
        .map_err(|error| format!("Unable to serialize sync history: {error}"))?;
    fs::write(&path, text).map_err(|error| {
        format!(
            "Unable to write sync history {}: {error}",
            path_to_string(&path)
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn plans_same_hash_directory_as_backup_then_link() {
        let temp = tempfile::tempdir().expect("temp dir");
        let source = temp.path().join("library").join("demo");
        let root = temp.path().join("agent");
        let target = root.join("demo");
        fs::create_dir_all(&source).expect("source");
        fs::create_dir_all(&target).expect("target");
        fs::write(
            source.join("SKILL.md"),
            "---\nname: demo\ndescription: Demo\n---\nBody",
        )
        .expect("source skill");
        fs::write(
            target.join("SKILL.md"),
            "---\nname: demo\ndescription: Demo\n---\nBody",
        )
        .expect("target skill");

        let source_hash = hash_dir(&source).expect("hash");
        let mut operations = Vec::new();
        let mut conflicts = Vec::new();
        plan_target_sync(
            "agent",
            "Agent",
            "demo",
            &source,
            Some(&source_hash),
            &root,
            &target,
            &temp.path().join("backups"),
            &mut operations,
            &mut conflicts,
        );

        assert!(conflicts.is_empty());
        assert_eq!(operations[0].op_type, "backup-existing");
        assert_eq!(operations[1].op_type, "create-symlink");
    }

    #[test]
    fn blocks_different_content_target() {
        let temp = tempfile::tempdir().expect("temp dir");
        let source = temp.path().join("library").join("demo");
        let root = temp.path().join("agent");
        let target = root.join("demo");
        fs::create_dir_all(&source).expect("source");
        fs::create_dir_all(&target).expect("target");
        fs::write(
            source.join("SKILL.md"),
            "---\nname: demo\ndescription: Demo\n---\nBody",
        )
        .expect("source skill");
        fs::write(
            target.join("SKILL.md"),
            "---\nname: demo\ndescription: Demo\n---\nDifferent",
        )
        .expect("target skill");

        let source_hash = hash_dir(&source).expect("hash");
        let mut operations = Vec::new();
        let mut conflicts = Vec::new();
        plan_target_sync(
            "agent",
            "Agent",
            "demo",
            &source,
            Some(&source_hash),
            &root,
            &target,
            &temp.path().join("backups"),
            &mut operations,
            &mut conflicts,
        );

        assert!(operations.is_empty());
        assert_eq!(conflicts.len(), 1);
    }

    #[test]
    fn external_sync_plan_copies_to_library_before_linking() {
        let temp = tempfile::tempdir().expect("temp dir");
        let source = temp.path().join("external").join("demo");
        let library = temp.path().join("library").join("demo");
        let root = temp.path().join("agent");
        let target = root.join("demo");
        fs::create_dir_all(&source).expect("source");
        fs::create_dir_all(&root).expect("root");
        fs::write(
            source.join("SKILL.md"),
            "---\nname: demo\ndescription: Demo\n---\nBody",
        )
        .expect("source skill");

        let source_hash = hash_dir(&source).expect("hash");
        let mut operations = vec![operation(
            "copy-to-library",
            "planned",
            Some(&source),
            Some(&library),
            None,
            "Import demo into the central library",
            None,
            Some("demo"),
        )];
        let mut conflicts = Vec::new();
        plan_target_sync(
            "agent",
            "Agent",
            "demo",
            &library,
            Some(&source_hash),
            &root,
            &target,
            &temp.path().join("backups"),
            &mut operations,
            &mut conflicts,
        );

        assert!(conflicts.is_empty());
        assert_eq!(operations[0].op_type, "copy-to-library");
        assert_eq!(operations[1].op_type, "create-symlink");
    }

    #[cfg(unix)]
    #[test]
    fn broken_symlink_is_removed_then_relinked() {
        let temp = tempfile::tempdir().expect("temp dir");
        let source = temp.path().join("library").join("demo");
        let root = temp.path().join("agent");
        let target = root.join("demo");
        fs::create_dir_all(&source).expect("source");
        fs::create_dir_all(&root).expect("root");
        fs::write(
            source.join("SKILL.md"),
            "---\nname: demo\ndescription: Demo\n---\nBody",
        )
        .expect("source skill");
        std::os::unix::fs::symlink(temp.path().join("missing"), &target).expect("broken symlink");

        let source_hash = hash_dir(&source).expect("hash");
        let mut operations = Vec::new();
        let mut conflicts = Vec::new();
        plan_target_sync(
            "agent",
            "Agent",
            "demo",
            &source,
            Some(&source_hash),
            &root,
            &target,
            &temp.path().join("backups"),
            &mut operations,
            &mut conflicts,
        );

        assert!(conflicts.is_empty());
        assert_eq!(operations[0].op_type, "remove-existing");
        assert_eq!(operations[1].op_type, "create-symlink");
    }
}
