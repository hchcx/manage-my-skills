use crate::fs_ops::{expand_home, path_to_string};
use crate::models::{
    AgentDefinition, AgentDetectionSource, AgentRecord, CustomRoot, ProjectWorkspaceAgentRoot,
    ProjectWorkspaceCandidate, ResolvedRoot, Settings,
};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

const PROJECT_DISCOVERY_DEPTH: usize = 2;

pub fn known_agents() -> Vec<AgentDefinition> {
    let mut agents = vec![
        agent(
            "amp",
            "AMP",
            &["~/.config/agents/skills"],
            &[".agents/skills"],
            &["~/.config/agents"],
            &["amp"],
            &[],
            101,
        ),
        agent(
            "antigravity",
            "Antigravity",
            &["~/.gemini/antigravity/skills"],
            &[".agent/skills"],
            &["~/.gemini/antigravity"],
            &["antigravity"],
            &[
                "/Applications/Antigravity.app",
                "~/Applications/Antigravity.app",
            ],
            1,
        ),
        agent(
            "augment",
            "Augment",
            &["~/.augment/skills"],
            &[".augment/skills"],
            &["~/.augment"],
            &["augment"],
            &["/Applications/Augment.app", "~/Applications/Augment.app"],
            2,
        ),
        agent(
            "claude-code",
            "Claude Code",
            &["~/.claude/skills"],
            &[".claude/skills"],
            &["~/.claude"],
            &["claude"],
            &[],
            3,
        ),
        agent(
            "cline",
            "Cline",
            &["~/.cline/skills"],
            &[".cline/skills"],
            &["~/.cline"],
            &[],
            &[],
            4,
        ),
        agent(
            "codebuddy",
            "CodeBuddy",
            &["~/.codebuddy/skills"],
            &[".codebuddy/skills"],
            &["~/.codebuddy"],
            &["codebuddy"],
            &[
                "/Applications/CodeBuddy.app",
                "~/Applications/CodeBuddy.app",
            ],
            5,
        ),
        agent(
            "codex",
            "Codex",
            &["~/.codex/skills", "~/.agents/skills"],
            &[".agents/skills"],
            &["~/.codex"],
            &["codex"],
            &[],
            6,
        ),
        agent(
            "cursor",
            "Cursor",
            &["~/.cursor/skills"],
            &[".cursor/skills"],
            &["~/.cursor"],
            &["cursor"],
            &["/Applications/Cursor.app", "~/Applications/Cursor.app"],
            7,
        ),
        agent(
            "gemini-cli",
            "Gemini CLI",
            &["~/.gemini/skills"],
            &[".gemini/skills"],
            &["~/.gemini"],
            &["gemini"],
            &[],
            9,
        ),
        agent(
            "github-copilot",
            "GitHub Copilot",
            &["~/.copilot/skills"],
            &[".github/skills"],
            &["~/.copilot"],
            &[],
            &[],
            10,
        ),
        agent(
            "grok-cli",
            "Grok CLI",
            &["~/.agents/skills"],
            &[".agents/skills"],
            &["~/.grok"],
            &["grok"],
            &[],
            11,
        ),
        agent(
            "hermes",
            "Hermes",
            &["~/.hermes/skills/"],
            &[],
            &["~/.hermes"],
            &["hermes"],
            &["/Applications/Hermes.app", "~/Applications/Hermes.app"],
            12,
        ),
        agent(
            "junie",
            "Junie",
            &["~/.junie/skills"],
            &[".junie/skills"],
            &["~/.junie"],
            &["junie"],
            &["/Applications/Junie.app", "~/Applications/Junie.app"],
            14,
        ),
        agent(
            "kilo-code",
            "Kilo Code",
            &["~/.kilocode/skills"],
            &[".kilocode/skills"],
            &["~/.kilocode"],
            &[],
            &[],
            15,
        ),
        agent(
            "kimi",
            "Kimi",
            &["~/.kimi/skills"],
            &[".kimi/skills"],
            &["~/.kimi"],
            &["kimi"],
            &["/Applications/Kimi.app", "~/Applications/Kimi.app"],
            16,
        ),
        agent(
            "kiro",
            "Kiro",
            &["~/.kiro/skills"],
            &[".kiro/skills"],
            &["~/.kiro"],
            &["kiro"],
            &["/Applications/Kiro.app", "~/Applications/Kiro.app"],
            17,
        ),
        agent(
            "openclaw",
            "OpenClaw",
            &["~/.openclaw/skills/"],
            &["skills", ".agents/skills"],
            &["~/.openclaw"],
            &["openclaw"],
            &["/Applications/OpenClaw.app", "~/Applications/OpenClaw.app"],
            18,
        ),
        agent(
            "opencode",
            "OpenCode",
            &["~/.config/opencode/skills"],
            &[".opencode/skills"],
            &["~/.config/opencode"],
            &["opencode"],
            &[],
            19,
        ),
        agent(
            "pi",
            "Pi",
            &["~/.pi/skills"],
            &[".pi/skills"],
            &["~/.pi"],
            &["pi"],
            &["/Applications/Pi.app", "~/Applications/Pi.app"],
            20,
        ),
        agent(
            "qoder",
            "Qoder",
            &["~/.qoder/skills"],
            &[".qoder/skills"],
            &["~/.qoder"],
            &["qoder"],
            &["/Applications/Qoder.app", "~/Applications/Qoder.app"],
            21,
        ),
        agent(
            "qwen_code",
            "Qwen Code",
            &["~/.qwen/skills", "~/.qwen-code/skills"],
            &[".qwen/skills", ".qwen-code/skills"],
            &["~/.qwen", "~/.qwen-code"],
            &["qwen", "qwen-code"],
            &[
                "/Applications/Qwen Code.app",
                "/Applications/Qwen.app",
                "~/Applications/Qwen Code.app",
                "~/Applications/Qwen.app",
            ],
            22,
        ),
        agent(
            "trae",
            "TRAE",
            &["~/.trae/skills"],
            &[".trae/skills"],
            &["~/.trae"],
            &["trae"],
            &[
                "/Applications/TRAE.app",
                "/Applications/Trae.app",
                "~/Applications/TRAE.app",
                "~/Applications/Trae.app",
            ],
            23,
        ),
        agent(
            "trae_cn",
            "TRAE CN",
            &["~/.trae-cn/skills"],
            &[".trae-cn/skills"],
            &["~/.trae-cn"],
            &["trae-cn"],
            &[
                "/Applications/TRAE CN.app",
                "/Applications/Trae CN.app",
                "~/Applications/TRAE CN.app",
                "~/Applications/Trae CN.app",
            ],
            24,
        ),
        agent(
            "warp",
            "Warp",
            &["~/.warp/skills"],
            &[".warp/skills"],
            &["~/.warp"],
            &["warp"],
            &["/Applications/Warp.app", "~/Applications/Warp.app"],
            25,
        ),
        agent(
            "windsurf",
            "Windsurf",
            &["~/.codeium/windsurf/skills"],
            &[".windsurf/skills"],
            &["~/.codeium/windsurf"],
            &["windsurf"],
            &["/Applications/Windsurf.app", "~/Applications/Windsurf.app"],
            26,
        ),
        agent(
            "workbuddy",
            "WorkBuddy",
            &["~/.workbuddy/skills"],
            &[".workbuddy/skills"],
            &["~/.workbuddy"],
            &["workbuddy"],
            &[
                "/Applications/WorkBuddy.app",
                "~/Applications/WorkBuddy.app",
            ],
            27,
        ),
        agent(
            "zed",
            "Zed",
            &["~/.agents/skills"],
            &[".agents/skills"],
            &["~/.config/zed"],
            &["zed"],
            &["/Applications/Zed.app", "~/Applications/Zed.app"],
            28,
        ),
    ];

    agents.sort_by_key(|agent| (agent.priority, agent.label.clone()));
    agents
}

pub fn detect_agents(settings: &Settings, include_orphaned: bool) -> Vec<AgentRecord> {
    let definitions = known_agents();
    let install_map = definitions
        .iter()
        .map(|definition| (definition.id.clone(), detect_install_sources(definition)))
        .collect::<BTreeMap<_, _>>();
    let roots = resolve_roots_for_definitions(
        &definitions,
        settings,
        include_orphaned,
        &install_map,
        false,
    );

    let mut records = definitions
        .into_iter()
        .map(|definition| {
            let detection_sources = install_map.get(&definition.id).cloned().unwrap_or_default();
            let installed = has_install_evidence(&detection_sources);
            let skill_roots = roots
                .iter()
                .filter(|root| root.agent_id == definition.id)
                .cloned()
                .collect::<Vec<_>>();
            let skill_entry_count = skill_roots
                .iter()
                .filter(|root| root.exists)
                .map(|root| count_root_entries(Path::new(&root.path)))
                .sum::<usize>();
            let status = if installed {
                "installed"
            } else {
                "not-installed"
            };

            AgentRecord {
                id: definition.id,
                label: definition.label,
                global_roots: definition.global_roots,
                project_roots: definition.project_roots,
                active_signals: definition.active_signals,
                cli_names: definition.cli_names,
                app_paths: definition.app_paths,
                symlink_support: definition.symlink_support,
                priority: definition.priority,
                installed,
                status: status.to_string(),
                detection_sources,
                skill_roots,
                skill_entry_count,
            }
        })
        .collect::<Vec<_>>();

    records.sort_by_key(|agent| (!agent.installed, agent.label.to_ascii_lowercase()));
    records
}

pub fn resolve_roots(settings: &Settings, include_orphaned: bool) -> Vec<ResolvedRoot> {
    let definitions = known_agents();
    let install_map = definitions
        .iter()
        .map(|definition| (definition.id.clone(), detect_install_sources(definition)))
        .collect::<BTreeMap<_, _>>();
    resolve_roots_for_definitions(&definitions, settings, include_orphaned, &install_map, true)
}

pub fn find_agent(id: &str) -> Option<AgentDefinition> {
    known_agents().into_iter().find(|agent| agent.id == id)
}

pub fn discover_project_workspaces(
    base_path: &str,
    settings: &Settings,
) -> Result<Vec<ProjectWorkspaceCandidate>, String> {
    let base = expand_home(base_path);
    if !base.exists() {
        return Err(format!(
            "Scan root does not exist: {}",
            path_to_string(&base)
        ));
    }
    if !base.is_dir() {
        return Err(format!(
            "Scan root is not a directory: {}",
            path_to_string(&base)
        ));
    }

    let definitions = known_agents();
    let mut candidates = Vec::new();
    collect_project_candidates(&base, 0, &definitions, settings, &mut candidates)?;
    candidates.sort_by_key(|candidate| {
        (
            candidate.already_linked,
            std::cmp::Reverse(candidate.skill_count),
            candidate.name.to_ascii_lowercase(),
        )
    });
    Ok(candidates)
}

fn agent(
    id: &str,
    label: &str,
    global_roots: &[&str],
    project_roots: &[&str],
    active_signals: &[&str],
    cli_names: &[&str],
    app_paths: &[&str],
    priority: u16,
) -> AgentDefinition {
    AgentDefinition {
        id: id.to_string(),
        label: label.to_string(),
        global_roots: global_roots.iter().map(|root| root.to_string()).collect(),
        project_roots: project_roots.iter().map(|root| root.to_string()).collect(),
        active_signals: active_signals.iter().map(|root| root.to_string()).collect(),
        cli_names: cli_names.iter().map(|name| name.to_string()).collect(),
        app_paths: app_paths.iter().map(|path| path.to_string()).collect(),
        priority,
        symlink_support: true,
    }
}

fn resolve_roots_for_definitions(
    definitions: &[AgentDefinition],
    settings: &Settings,
    include_orphaned: bool,
    install_map: &BTreeMap<String, Vec<AgentDetectionSource>>,
    include_custom_roots: bool,
) -> Vec<ResolvedRoot> {
    let mut roots = Vec::new();

    for definition in definitions {
        let installed = install_map
            .get(&definition.id)
            .map(|sources| has_install_evidence(sources))
            .unwrap_or(false);

        for root in &definition.global_roots {
            push_root(
                &mut roots,
                definition,
                "global",
                expand_home(root),
                installed,
                include_orphaned,
                true,
            );
        }

        for folder in &settings.project_folders {
            for relative in &definition.project_roots {
                push_root(
                    &mut roots,
                    definition,
                    "project",
                    PathBuf::from(folder).join(relative),
                    installed,
                    include_orphaned,
                    false,
                );
            }
        }
    }

    for definition in definitions {
        let installed = install_map
            .get(&definition.id)
            .map(|sources| has_install_evidence(sources))
            .unwrap_or(false);

        for root in installed_plugin_skill_roots_for_agent(&definition.id) {
            push_root(
                &mut roots,
                definition,
                "global",
                root,
                installed,
                include_orphaned,
                false,
            );
        }
    }

    if include_custom_roots {
        for root in &settings.custom_roots {
            push_custom_root(&mut roots, root, include_orphaned);
        }
    }

    dedupe_roots(roots)
}

fn collect_project_candidates(
    path: &Path,
    depth: usize,
    definitions: &[AgentDefinition],
    settings: &Settings,
    candidates: &mut Vec<ProjectWorkspaceCandidate>,
) -> Result<(), String> {
    if depth > 0 && should_skip_project_discovery_dir(path) {
        return Ok(());
    }

    if let Some(candidate) = inspect_project_candidate(path, definitions, settings) {
        candidates.push(candidate);
    }

    if depth >= PROJECT_DISCOVERY_DEPTH {
        return Ok(());
    }

    let entries = fs::read_dir(path)
        .map_err(|error| format!("Unable to scan {}: {error}", path_to_string(path)))?;
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!("Unable to read entry in {}: {error}", path_to_string(path))
        })?;
        let entry_path = entry.path();
        if !entry_path.is_dir() || should_skip_project_discovery_dir(&entry_path) {
            continue;
        }
        collect_project_candidates(&entry_path, depth + 1, definitions, settings, candidates)?;
    }

    Ok(())
}

fn inspect_project_candidate(
    path: &Path,
    definitions: &[AgentDefinition],
    settings: &Settings,
) -> Option<ProjectWorkspaceCandidate> {
    let mut agent_roots = Vec::new();
    for definition in definitions {
        for relative in &definition.project_roots {
            let root = path.join(relative);
            if !root.exists() || !root.is_dir() {
                continue;
            }
            let skill_count = count_skill_entries(&root);
            if skill_count == 0 {
                continue;
            }
            agent_roots.push(ProjectWorkspaceAgentRoot {
                agent_id: definition.id.clone(),
                agent_label: definition.label.clone(),
                path: path_to_string(&root),
                skill_count,
            });
        }
    }

    if agent_roots.is_empty() {
        return None;
    }

    let skill_count = agent_roots.iter().map(|root| root.skill_count).sum();
    let project_path = path_to_string(path);
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&project_path)
        .to_string();
    let already_linked = settings.project_folders.iter().any(|folder| {
        let linked = expand_home(folder);
        linked == path
    });

    Some(ProjectWorkspaceCandidate {
        name,
        path: project_path,
        agent_roots,
        skill_count,
        already_linked,
    })
}

fn count_skill_entries(root: &Path) -> usize {
    let mut count = 0;
    if root.join("SKILL.md").is_file() {
        count += 1;
    }

    let Ok(entries) = fs::read_dir(root) else {
        return count;
    };

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() && entry_path.join("SKILL.md").is_file() {
            count += 1;
        }
    }

    count
}

fn should_skip_project_discovery_dir(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return true;
    };
    if name.starts_with('.') {
        return true;
    }
    matches!(name, "node_modules" | "target" | "dist" | "build" | "venv")
}

fn push_root(
    roots: &mut Vec<ResolvedRoot>,
    definition: &AgentDefinition,
    scope: &str,
    path: PathBuf,
    installed: bool,
    _include_orphaned: bool,
    include_missing_installed_root: bool,
) {
    let exists = path.exists();
    let active = installed && exists;
    let orphaned = exists && !installed;

    if active || (installed && include_missing_installed_root) {
        roots.push(ResolvedRoot {
            agent_id: definition.id.clone(),
            agent_label: definition.label.clone(),
            scope: scope.to_string(),
            path: path_to_string(&path),
            exists,
            active,
            orphaned,
        });
    }
}

fn push_custom_root(roots: &mut Vec<ResolvedRoot>, root: &CustomRoot, include_orphaned: bool) {
    let path = expand_home(&root.path);
    let exists = path.exists();
    let active = exists && has_entries(&path);
    let orphaned = exists && !active;

    if exists && (include_orphaned || !orphaned) {
        roots.push(ResolvedRoot {
            agent_id: root.id.clone(),
            agent_label: root.label.clone(),
            scope: "custom".to_string(),
            path: path_to_string(&path),
            exists,
            active,
            orphaned,
        });
    }
}

fn detect_install_sources(definition: &AgentDefinition) -> Vec<AgentDetectionSource> {
    let mut sources = Vec::new();
    let mut seen = BTreeSet::new();

    for command in &definition.cli_names {
        if let Some(path) = find_binary(command) {
            push_source(
                &mut sources,
                &mut seen,
                "cli",
                command,
                path_to_string(&path),
            );
        }
    }

    for app_path in &definition.app_paths {
        let path = expand_home(app_path);
        if path.exists() {
            push_source(
                &mut sources,
                &mut seen,
                "app",
                app_path,
                path_to_string(&path),
            );
        }
    }

    for app_name in app_names_for_detection(definition) {
        if let Some(path) = find_app_bundle(&app_name) {
            push_source(
                &mut sources,
                &mut seen,
                "app",
                &app_name,
                path_to_string(&path),
            );
        }
    }

    for extension_id in extension_ids_for_agent(&definition.id) {
        if let Some(path) = find_extension_installation(extension_id) {
            push_source(
                &mut sources,
                &mut seen,
                "extension",
                extension_id,
                path_to_string(&path),
            );
        }
    }

    for signal in &definition.active_signals {
        let path = expand_home(signal);
        if path.exists() {
            push_source(
                &mut sources,
                &mut seen,
                "config",
                signal,
                path_to_string(&path),
            );
        }
    }

    for root in installed_plugin_skill_roots_for_agent(&definition.id) {
        push_source(
            &mut sources,
            &mut seen,
            "plugin-installed",
            "installed plugin skills",
            path_to_string(&root),
        );
    }

    sources
}

fn has_install_evidence(sources: &[AgentDetectionSource]) -> bool {
    sources.iter().any(|source| {
        matches!(
            source.kind.as_str(),
            "cli" | "app" | "extension" | "plugin-installed"
        )
    })
}

fn push_source(
    sources: &mut Vec<AgentDetectionSource>,
    seen: &mut BTreeSet<String>,
    kind: &str,
    label: &str,
    path: String,
) {
    let key = format!("{kind}:{path}");
    if seen.insert(key) {
        sources.push(AgentDetectionSource {
            kind: kind.to_string(),
            label: label.to_string(),
            path,
            exists: true,
        });
    }
}

fn find_binary(command: &str) -> Option<PathBuf> {
    binary_search_dirs()
        .into_iter()
        .map(|path| path.join(command))
        .find(|candidate| candidate.is_file())
}

fn binary_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut seen = BTreeSet::new();

    if let Some(paths) = std::env::var_os("PATH") {
        for path in std::env::split_paths(&paths) {
            push_unique_path(&mut dirs, &mut seen, path);
        }
    }

    for path in [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        "~/.local/bin",
        "~/.cargo/bin",
        "~/.npm-global/bin",
        "~/.bun/bin",
        "~/.volta/bin",
        "~/Library/pnpm",
        "~/.pnpm-global/bin",
    ] {
        push_unique_path(&mut dirs, &mut seen, expand_home(path));
    }

    dirs
}

fn app_names_for_detection(definition: &AgentDefinition) -> Vec<String> {
    let mut names = Vec::new();
    let mut seen = BTreeSet::new();

    for app_path in &definition.app_paths {
        if let Some(name) = Path::new(app_path)
            .file_name()
            .and_then(|name| name.to_str())
        {
            push_unique_name(&mut names, &mut seen, normalize_app_name(name));
        }
    }

    if !definition.app_paths.is_empty() {
        push_unique_name(&mut names, &mut seen, normalize_app_name(&definition.label));
    }

    names
}

fn normalize_app_name(name: &str) -> String {
    if name.to_ascii_lowercase().ends_with(".app") {
        name.to_string()
    } else {
        format!("{name}.app")
    }
}

fn find_app_bundle(app_name: &str) -> Option<PathBuf> {
    let expected = normalize_app_name(app_name);

    for root in app_search_roots() {
        let direct = root.join(&expected);
        if direct.exists() {
            return Some(direct);
        }

        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };

        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let Some(name) = entry.file_name().to_str().map(|name| name.to_string()) else {
                continue;
            };
            if name.eq_ignore_ascii_case(&expected) {
                return Some(path);
            }
        }
    }

    None
}

fn app_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = BTreeSet::new();

    for path in [
        "/Applications",
        "~/Applications",
        "/System/Applications",
        "/Applications/Utilities",
    ] {
        push_unique_path(&mut roots, &mut seen, expand_home(path));
    }

    roots
}

fn extension_ids_for_agent(agent_id: &str) -> &'static [&'static str] {
    match agent_id {
        "cline" => &["cline.cline", "saoudrizwan.claude-dev"],
        "github-copilot" => &["github.copilot", "github.copilot-chat"],
        "kilo-code" => &[
            "kilocode.kilo-code",
            "kilo-code.kilo-code",
            "kilocode.kilocode",
        ],
        "roo-code" => &[
            "rooveterinaryinc.roo-cline",
            "rooveterinaryinc.roo-code",
            "roo-cline.roo-cline",
        ],
        _ => &[],
    }
}

fn find_extension_installation(extension_id: &str) -> Option<PathBuf> {
    let expected = extension_id.to_ascii_lowercase();

    for root in extension_search_roots() {
        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };

        for entry in entries.filter_map(Result::ok) {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if name == expected || name.starts_with(&format!("{expected}-")) {
                return Some(entry.path());
            }
        }
    }

    None
}

fn extension_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = BTreeSet::new();

    for path in [
        "~/.vscode/extensions",
        "~/.vscode-insiders/extensions",
        "~/.cursor/extensions",
        "~/.cursor-insiders/extensions",
        "~/.windsurf/extensions",
        "~/.codeium/windsurf/extensions",
        "~/.trae/extensions",
        "~/.kiro/extensions",
    ] {
        push_unique_path(&mut roots, &mut seen, expand_home(path));
    }

    roots
}

fn installed_plugin_skill_roots_for_agent(agent_id: &str) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = BTreeSet::new();

    match agent_id {
        "claude-code" => {
            collect_recursive_skill_roots(
                &mut roots,
                &mut seen,
                expand_home("~/.claude/plugins/marketplaces"),
                PLUGIN_SKILL_DISCOVERY_DEPTH,
            );
        }
        "codex" => {
            collect_codex_enabled_plugin_skill_roots(&mut roots, &mut seen);
            collect_recursive_skill_roots(
                &mut roots,
                &mut seen,
                expand_home("~/.codex/plugins/cache/openai-curated"),
                PLUGIN_SKILL_DISCOVERY_DEPTH,
            );
        }
        "cursor" => {
            collect_recursive_skill_roots(
                &mut roots,
                &mut seen,
                expand_home("~/.cursor/plugins/marketplaces"),
                PLUGIN_SKILL_DISCOVERY_DEPTH,
            );
        }
        _ => {}
    }

    roots
}

const PLUGIN_SKILL_DISCOVERY_DEPTH: usize = 8;

fn collect_codex_enabled_plugin_skill_roots(roots: &mut Vec<PathBuf>, seen: &mut BTreeSet<String>) {
    let config = expand_home("~/.codex/config.toml");
    let Ok(text) = fs::read_to_string(&config) else {
        return;
    };

    for plugin_key in parse_enabled_codex_plugins(&text) {
        let Some((plugin, marketplace)) = plugin_key.split_once('@') else {
            continue;
        };
        let plugin_root = expand_home("~/.codex/plugins/cache")
            .join(marketplace)
            .join(plugin);

        collect_recursive_skill_roots(roots, seen, plugin_root, PLUGIN_SKILL_DISCOVERY_DEPTH);
    }
}

fn parse_enabled_codex_plugins(text: &str) -> Vec<String> {
    let mut enabled = Vec::new();
    let mut current_plugin: Option<String> = None;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            current_plugin = parse_codex_plugin_table(trimmed);
            continue;
        }
        if trimmed == "enabled = true" {
            if let Some(plugin) = current_plugin.take() {
                enabled.push(plugin);
            }
        }
    }

    enabled
}

fn parse_codex_plugin_table(line: &str) -> Option<String> {
    let rest = line.strip_prefix("[plugins.")?.strip_suffix(']')?;
    let rest = rest.trim();
    rest.strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .or_else(|| {
            rest.strip_prefix('\'')
                .and_then(|value| value.strip_suffix('\''))
        })
        .or_else(|| (!rest.is_empty()).then_some(rest))
        .map(str::to_string)
}

fn collect_recursive_skill_roots(
    roots: &mut Vec<PathBuf>,
    seen: &mut BTreeSet<String>,
    path: PathBuf,
    max_depth: usize,
) {
    collect_recursive_skill_roots_at(roots, seen, &path, 0, max_depth);
}

fn collect_recursive_skill_roots_at(
    roots: &mut Vec<PathBuf>,
    seen: &mut BTreeSet<String>,
    path: &Path,
    depth: usize,
    max_depth: usize,
) {
    if !path.is_dir() {
        return;
    }

    if path.join("SKILL.md").is_file() {
        push_unique_path(roots, seen, path.to_path_buf());
        return;
    }

    if depth >= max_depth {
        return;
    }

    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.filter_map(Result::ok) {
        let entry_path = entry.path();
        if should_skip_skill_discovery_dir(&entry_path) {
            continue;
        }
        let Ok(metadata) = fs::symlink_metadata(&entry_path) else {
            continue;
        };
        if metadata.is_dir() {
            collect_recursive_skill_roots_at(roots, seen, &entry_path, depth + 1, max_depth);
        } else if metadata.file_type().is_symlink() && entry_path.join("SKILL.md").is_file() {
            push_unique_path(roots, seen, entry_path);
        }
    }
}

fn should_skip_skill_discovery_dir(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return true;
    };
    if name.starts_with('.') {
        return true;
    }
    matches!(
        name,
        "node_modules" | "target" | "dist" | "build" | "venv" | "__pycache__"
    )
}

fn push_unique_name(names: &mut Vec<String>, seen: &mut BTreeSet<String>, name: String) {
    if seen.insert(name.to_ascii_lowercase()) {
        names.push(name);
    }
}

fn push_unique_path(paths: &mut Vec<PathBuf>, seen: &mut BTreeSet<String>, path: PathBuf) {
    if seen.insert(path_to_string(&path)) {
        paths.push(path);
    }
}

fn has_entries(path: &Path) -> bool {
    fs::read_dir(path)
        .map(|mut entries| entries.any(|entry| entry.is_ok()))
        .unwrap_or(false)
}

fn count_root_entries(path: &Path) -> usize {
    if path.join("SKILL.md").exists() {
        return 1;
    }

    fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|entry| {
                    fs::symlink_metadata(entry.path())
                        .map(|metadata| metadata.is_dir() || metadata.file_type().is_symlink())
                        .unwrap_or(false)
                        && entry.path().join("SKILL.md").exists()
                })
                .count()
        })
        .unwrap_or(0)
}

fn dedupe_roots(roots: Vec<ResolvedRoot>) -> Vec<ResolvedRoot> {
    let mut seen = BTreeSet::new();
    let mut unique = Vec::new();
    for root in roots {
        let key = format!("{}:{}:{}", root.agent_id, root.scope, root.path);
        if seen.insert(key) {
            unique.push(root);
        }
    }
    unique
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_agents_include_all_default_tools() {
        let agents = known_agents();
        let labels: Vec<String> = agents.iter().map(|agent| agent.label.clone()).collect();
        assert_eq!(agents.len(), 27);
        assert!(labels.contains(&"AMP".to_string()));
        assert!(labels.contains(&"Antigravity".to_string()));
        assert!(labels.contains(&"Augment".to_string()));
        assert!(labels.contains(&"Claude Code".to_string()));
        assert!(labels.contains(&"Cline".to_string()));
        assert!(labels.contains(&"CodeBuddy".to_string()));
        assert!(labels.contains(&"Codex".to_string()));
        assert!(labels.contains(&"Cursor".to_string()));
        assert!(labels.contains(&"Gemini CLI".to_string()));
        assert!(labels.contains(&"GitHub Copilot".to_string()));
        assert!(labels.contains(&"Grok CLI".to_string()));
        assert!(labels.contains(&"Hermes".to_string()));
        assert!(labels.contains(&"Junie".to_string()));
        assert!(labels.contains(&"Kilo Code".to_string()));
        assert!(labels.contains(&"Kimi".to_string()));
        assert!(labels.contains(&"Kiro".to_string()));
        assert!(labels.contains(&"OpenClaw".to_string()));
        assert!(labels.contains(&"OpenCode".to_string()));
        assert!(labels.contains(&"Pi".to_string()));
        assert!(labels.contains(&"Qoder".to_string()));
        assert!(labels.contains(&"Qwen Code".to_string()));
        assert!(labels.contains(&"TRAE".to_string()));
        assert!(labels.contains(&"TRAE CN".to_string()));
        assert!(labels.contains(&"Warp".to_string()));
        assert!(labels.contains(&"Windsurf".to_string()));
        assert!(labels.contains(&"WorkBuddy".to_string()));
        assert!(labels.contains(&"Zed".to_string()));
    }

    #[test]
    fn shared_agents_root_does_not_mark_agents_installed() {
        let agents = known_agents();
        for id in ["grok-cli", "zed"] {
            let agent = agents.iter().find(|agent| agent.id == id).expect("agent");
            assert!(!agent.active_signals.contains(&"~/.agents".to_string()));
        }
    }

    #[test]
    fn extension_source_is_install_evidence() {
        let sources = vec![AgentDetectionSource {
            kind: "extension".to_string(),
            label: "cline.cline".to_string(),
            path: "/Users/example/.vscode/extensions/cline.cline-1.0.0".to_string(),
            exists: true,
        }];

        assert!(has_install_evidence(&sources));
    }

    #[test]
    fn plugin_installed_source_is_install_evidence() {
        let sources = vec![AgentDetectionSource {
            kind: "plugin-installed".to_string(),
            label: "installed plugin skills".to_string(),
            path: "/Users/example/.codex/plugins/cache/openai/plugin/1.0.0/skills".to_string(),
            exists: true,
        }];

        assert!(has_install_evidence(&sources));
    }

    #[test]
    fn config_source_is_not_install_evidence() {
        let sources = vec![AgentDetectionSource {
            kind: "config".to_string(),
            label: "~/.openclaw/skills/".to_string(),
            path: "/Users/example/.openclaw/skills".to_string(),
            exists: true,
        }];

        assert!(!has_install_evidence(&sources));
    }

    #[test]
    fn app_names_are_derived_from_explicit_app_paths() {
        let agent = known_agents()
            .into_iter()
            .find(|agent| agent.id == "trae")
            .expect("trae");
        let names = app_names_for_detection(&agent);

        assert!(names.contains(&"TRAE.app".to_string()));
        assert_eq!(
            names
                .iter()
                .filter(|name| name.eq_ignore_ascii_case("trae.app"))
                .count(),
            1
        );
    }

    #[test]
    fn parses_enabled_codex_plugins_from_config() {
        let config = r#"
[plugins."documents@openai-primary-runtime"]
enabled = true

[plugins."disabled@openai-curated"]
enabled = false

[plugins.'hyperframes@openai-curated']
enabled = true
"#;

        assert_eq!(
            parse_enabled_codex_plugins(config),
            vec![
                "documents@openai-primary-runtime".to_string(),
                "hyperframes@openai-curated".to_string()
            ]
        );
    }

    #[test]
    fn counts_root_that_is_itself_a_skill() {
        let temp = tempfile::tempdir().expect("temp dir");
        fs::write(
            temp.path().join("SKILL.md"),
            "---\nname: root-skill\ndescription: Root\n---\nBody",
        )
        .expect("skill md");

        assert_eq!(count_root_entries(temp.path()), 1);
    }

    #[test]
    fn recursive_plugin_discovery_collects_only_skill_directories() {
        let temp = tempfile::tempdir().expect("temp dir");
        let marketplace = temp.path().join("marketplace");
        let skill = marketplace
            .join("official")
            .join("plugins")
            .join("plugin-dev")
            .join("skills")
            .join("skill-development");
        let non_skill = marketplace
            .join("official")
            .join("plugins")
            .join("plugin-dev");
        let skipped = marketplace
            .join("official")
            .join("plugins")
            .join("plugin-dev")
            .join("node_modules")
            .join("fake-skill");
        fs::create_dir_all(&skill).expect("skill dir");
        fs::create_dir_all(&skipped).expect("skipped dir");
        fs::write(
            skill.join("SKILL.md"),
            "---\nname: skill-development\ndescription: Skill\n---\nBody",
        )
        .expect("skill md");
        fs::write(
            skipped.join("SKILL.md"),
            "---\nname: fake-skill\ndescription: Skip\n---\nBody",
        )
        .expect("skipped skill md");

        let mut roots = Vec::new();
        let mut seen = BTreeSet::new();
        collect_recursive_skill_roots(&mut roots, &mut seen, marketplace, 8);

        assert_eq!(roots, vec![skill]);
        assert!(!roots.contains(&non_skill));
    }

    #[test]
    fn project_discovery_does_not_treat_agent_config_folder_as_project() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project = temp.path().join("skills-hub");
        let skill = project.join(".claude").join("skills").join("review");
        fs::create_dir_all(&skill).expect("skill dir");
        fs::write(
            skill.join("SKILL.md"),
            "---\nname: review\ndescription: Review\n---\nBody",
        )
        .expect("skill md");

        let settings = Settings {
            library_path: path_to_string(&temp.path().join("library")),
            project_folders: Vec::new(),
            custom_roots: Vec::new(),
            show_raw_paths: false,
            language: "zh-CN".to_string(),
        };
        let candidates =
            discover_project_workspaces(&path_to_string(temp.path()), &settings).expect("discover");

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].name, "skills-hub");
        assert_eq!(candidates[0].agent_roots[0].agent_label, "Claude Code");
        assert!(!candidates
            .iter()
            .any(|candidate| candidate.name == ".claude"));
    }
}
