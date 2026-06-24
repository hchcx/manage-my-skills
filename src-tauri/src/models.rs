use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub library_path: String,
    pub project_folders: Vec<String>,
    pub custom_roots: Vec<CustomRoot>,
    pub show_raw_paths: bool,
    #[serde(default = "default_language")]
    pub language: String,
}

pub fn default_language() -> String {
    "zh-CN".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomRoot {
    pub id: String,
    pub label: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScanOptions {
    pub include_orphaned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentDefinition {
    pub id: String,
    pub label: String,
    pub global_roots: Vec<String>,
    pub project_roots: Vec<String>,
    pub active_signals: Vec<String>,
    pub cli_names: Vec<String>,
    pub app_paths: Vec<String>,
    pub priority: u16,
    pub symlink_support: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentDetectionSource {
    pub kind: String,
    pub label: String,
    pub path: String,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecord {
    pub id: String,
    pub label: String,
    pub global_roots: Vec<String>,
    pub project_roots: Vec<String>,
    pub active_signals: Vec<String>,
    pub cli_names: Vec<String>,
    pub app_paths: Vec<String>,
    pub symlink_support: bool,
    pub priority: u16,
    pub installed: bool,
    pub status: String,
    pub detection_sources: Vec<AgentDetectionSource>,
    pub skill_roots: Vec<ResolvedRoot>,
    pub skill_entry_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedRoot {
    pub agent_id: String,
    pub agent_label: String,
    pub scope: String,
    pub path: String,
    pub exists: bool,
    pub active: bool,
    pub orphaned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspaceAgentRoot {
    pub agent_id: String,
    pub agent_label: String,
    pub path: String,
    pub skill_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspaceCandidate {
    pub name: String,
    pub path: String,
    pub agent_roots: Vec<ProjectWorkspaceAgentRoot>,
    pub skill_count: usize,
    pub already_linked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillFrontmatter {
    pub name: Option<String>,
    pub description: Option<String>,
    pub license: Option<String>,
    pub allowed_tools: Vec<String>,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillIssue {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub path: Option<String>,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInstallation {
    pub id: String,
    pub agent_id: String,
    pub agent_label: String,
    pub scope: String,
    pub root_path: String,
    pub entry_path: String,
    pub real_path: Option<String>,
    pub symlink_target: Option<String>,
    pub is_symlink: bool,
    pub broken_symlink: bool,
    pub hash: Option<String>,
    pub frontmatter: Option<SkillFrontmatter>,
    pub status: String,
    pub issues: Vec<SkillIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillRecord {
    pub id: String,
    pub slug: String,
    pub display_name: String,
    pub description: Option<String>,
    pub canonical_status: String,
    pub canonical_path: Option<String>,
    pub canonical_hash: Option<String>,
    pub installations: Vec<SkillInstallation>,
    pub missing_agents: Vec<String>,
    pub issues: Vec<SkillIssue>,
    pub conflict: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InventorySnapshot {
    pub agents: Vec<AgentRecord>,
    pub roots: Vec<ResolvedRoot>,
    pub skills: Vec<SkillRecord>,
    pub issues: Vec<SkillIssue>,
    pub scanned_at: String,
    pub app_data_path: String,
    pub library_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillRef {
    pub skill_id: Option<String>,
    pub installation_id: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillLockEntry {
    pub source: Option<String>,
    pub source_type: Option<String>,
    pub source_url: Option<String>,
    pub skill_path: Option<String>,
    pub installed_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillLockFile {
    pub skills: BTreeMap<String, SkillLockEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpdateCheck {
    pub status: String,
    pub message: Option<String>,
    pub local_hash: Option<String>,
    pub remote_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillContent {
    pub path: String,
    pub title: String,
    pub frontmatter: Option<SkillFrontmatter>,
    pub content: String,
    pub markdown_body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallationRef {
    pub installation_id: String,
    pub entry_path: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentTarget {
    pub agent_id: String,
    pub scope: Option<String>,
    pub project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncPlan {
    pub plan_id: String,
    pub kind: String,
    pub risk_level: String,
    pub operations: Vec<SyncOperation>,
    pub preconditions: Vec<String>,
    pub blocked_conflicts: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncOperation {
    pub id: String,
    pub op_type: String,
    pub status: String,
    pub source_path: Option<String>,
    pub target_path: Option<String>,
    pub backup_path: Option<String>,
    pub message: String,
    pub agent_id: Option<String>,
    pub skill_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub plan_id: String,
    pub applied_operations: Vec<String>,
    pub skipped_operations: Vec<String>,
    pub errors: Vec<String>,
    pub inventory_refresh_recommended: bool,
}
