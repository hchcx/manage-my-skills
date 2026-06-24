export type Language = "zh-CN" | "en";

export const LANGUAGES: { code: Language; label: string; shortLabel: string }[] = [
  { code: "zh-CN", label: "中文", shortLabel: "中" },
  { code: "en", label: "English", shortLabel: "EN" }
];

const zh = {
  appSubtitle: "本地 Agent 工作台",
  navAgents: "Agents",
  navSkills: "Skills",
  navPreview: "同步预览",
  navSettings: "设置",
  statSkills: "Skills",
  statAgents: "已安装",
  statTotalAgents: "默认工具",
  statIssues: "问题",
  searchPlaceholder: "搜索 Skill、描述或 Agent",
  includeOrphaned: "包含孤儿目录",
  rescan: "重新扫描",
  skillsTitle: "Skills 总览",
  skillsDescription: "查看 Skill 在哪里、缺什么，以及是否可以安全同步。",
  agentsTitle: "Agent 检测",
  agentsDescription: "先识别这台机器安装了哪些默认 Agent，再扫描它们的 Skills。",
  tableAgent: "Agent",
  tableInstallState: "安装状态",
  tableSkillRoots: "Skills 根目录",
  tableDetectionSignals: "检测信号",
  agentInstalled: "已安装",
  agentNotInstalled: "未安装",
  agentSkillsOnly: "仅发现 Skills",
  agentResidual: "仅有残留",
  agentRootReady: "可用",
  agentRootMissing: "未创建",
  agentRootOrphaned: "残留",
  noDetectionSignals: "没有检测到 CLI、App、扩展或配置残留",
  cliSignal: "CLI",
  appSignal: "App",
  extensionSignal: "扩展",
  pluginInstalledSignal: "已安装插件",
  configSignal: "配置",
  libraryNotInitialized: "中心库尚未初始化",
  tableSkill: "Skill",
  tableCoverage: "覆盖率",
  tableState: "状态",
  tableSources: "来源",
  currentPath: "当前路径",
  source: "来源",
  description: "简介",
  noDescription: "暂无简介。",
  unknown: "未知",
  syncTargets: "可同步的 Agent",
  syncGlobal: "同步到全局",
  syncProject: "同步到项目",
  compareTitle: "Agent 覆盖矩阵",
  compareDescription: "对比各本地 Agent 中已安装、已链接、断链和缺失的状态。",
  noPlanTitle: "还没有同步计划",
  noPlanDescription: "先选择一个 Skill，再预览导入或同步；预览前不会写入任何内容。",
  importPreview: "导入预览",
  syncPreview: "同步预览",
  applyPlan: "执行计划",
  from: "来源",
  to: "目标",
  backup: "备份",
  applyErrorTitle: "执行完成，但有错误",
  applySuccessTitle: "执行完成",
  applied: "已执行",
  skipped: "已跳过",
  settingsTitle: "设置",
  settingsDescription: "路径默认收起来，需要审计时再展开。",
  save: "保存",
  language: "语言",
  centralLibrary: "中心库",
  showRawPaths: "在 Skill 详情中显示原始文件路径",
  projectFolders: "项目目录",
  add: "添加",
  noProjectFolders: "还没有添加项目目录。",
  remove: "移除",
  scanRoots: "扫描根目录",
  appData: "应用数据目录",
  selectSkill: "选择一个 Skill",
  import: "导入",
  sync: "同步",
  installedIn: "已安装在",
  missingAgents: "缺失的 Agent",
  noMissingAgents: "当前扫描中没有缺失的 Agent。",
  more: "更多",
  issues: "问题",
  noIssues: "未发现问题。",
  noReadableSkill: "这个选择没有可读取的 SKILL.md。",
  stateConflict: "冲突",
  stateNeedsReview: "需检查",
  stateImported: "已导入",
  stateExternal: "外部来源",
  riskLow: "低风险",
  riskMedium: "中风险",
  riskBlocked: "已阻塞",
  kindAdopt: "导入",
  kindSync: "同步",
  statusMissing: "缺失",
  statusInstalled: "已安装",
  statusPluginInstalled: "插件提供",
  statusLinked: "已链接",
  statusExternalLink: "外部链接",
  statusBroken: "断链",
  statusInvalid: "无效",
  statusOrphaned: "孤儿",
  statusActive: "活跃",
  statusNoop: "无需操作",
  statusPlanned: "计划中",
  statusBlocked: "已阻塞",
  opNoop: "无需操作",
  opCopyToLibrary: "复制到中心库",
  opCreateRoot: "创建根目录",
  opRemoveExisting: "移除现有项",
  opBackupExisting: "备份现有项",
  opCreateSymlink: "创建软链接",
  issueBrokenSymlink: "这个 Skill 条目是断开的软链接",
  issueMissingSkillMd: "这个目录缺少 SKILL.md，不是有效 Skill",
  issueNameMismatch: "Frontmatter name 与目录名不一致",
  issueContentConflict: "这个 Skill 存在多个不同内容版本",
  issueMissingFrontmatter: "SKILL.md 没有有效 frontmatter",
  issueUnreadableSkillMd: "无法读取 SKILL.md"
} as const;

const en: Record<keyof typeof zh, string> = {
  appSubtitle: "Local Agent Workbench",
  navAgents: "Agents",
  navSkills: "Skills",
  navPreview: "Sync Preview",
  navSettings: "Settings",
  statSkills: "Skills",
  statAgents: "Installed",
  statTotalAgents: "Default tools",
  statIssues: "Issues",
  searchPlaceholder: "Search skills, descriptions, agents",
  includeOrphaned: "Include orphaned roots",
  rescan: "Rescan",
  skillsTitle: "Skills Inventory",
  skillsDescription: "Find where a skill lives, what is missing, and whether it is safe to sync.",
  agentsTitle: "Agent Detection",
  agentsDescription: "Detect which default Agents are installed on this machine before scanning their Skills.",
  tableAgent: "Agent",
  tableInstallState: "Install state",
  tableSkillRoots: "Skills roots",
  tableDetectionSignals: "Detection signals",
  agentInstalled: "Installed",
  agentNotInstalled: "Not installed",
  agentSkillsOnly: "Skills only",
  agentResidual: "Residual only",
  agentRootReady: "ready",
  agentRootMissing: "missing",
  agentRootOrphaned: "orphaned",
  noDetectionSignals: "No CLI, app, extension, or config residue detected",
  cliSignal: "CLI",
  appSignal: "App",
  extensionSignal: "Extension",
  pluginInstalledSignal: "Installed plugin",
  configSignal: "Config",
  libraryNotInitialized: "Library not initialized",
  tableSkill: "Skill",
  tableCoverage: "Coverage",
  tableState: "State",
  tableSources: "Sources",
  currentPath: "Current path",
  source: "Source",
  description: "Description",
  noDescription: "No description yet.",
  unknown: "Unknown",
  syncTargets: "Available sync targets",
  syncGlobal: "Sync global",
  syncProject: "Sync project",
  compareTitle: "Agent Coverage Matrix",
  compareDescription: "Installed, linked, broken, and missing states across known local Agents.",
  noPlanTitle: "No sync plan yet",
  noPlanDescription: "Select a skill, then preview import or sync before anything is written.",
  importPreview: "Import Preview",
  syncPreview: "Sync Preview",
  applyPlan: "Apply Plan",
  from: "from",
  to: "to",
  backup: "backup",
  applyErrorTitle: "Apply finished with errors",
  applySuccessTitle: "Apply completed",
  applied: "applied",
  skipped: "skipped",
  settingsTitle: "Settings",
  settingsDescription: "Keep paths out of the way, but available when you need to audit them.",
  save: "Save",
  language: "Language",
  centralLibrary: "Central library",
  showRawPaths: "Show raw filesystem paths in skill detail",
  projectFolders: "Project folders",
  add: "Add",
  noProjectFolders: "No project folders added yet.",
  remove: "Remove",
  scanRoots: "Scan roots",
  appData: "App data",
  selectSkill: "Select a skill",
  import: "Import",
  sync: "Sync",
  installedIn: "Installed in",
  missingAgents: "Missing agents",
  noMissingAgents: "No missing Agents in the current scan.",
  more: "more",
  issues: "Issues",
  noIssues: "No issues found.",
  noReadableSkill: "No readable SKILL.md for this selection.",
  stateConflict: "Conflict",
  stateNeedsReview: "Needs review",
  stateImported: "Imported",
  stateExternal: "External",
  riskLow: "low",
  riskMedium: "medium",
  riskBlocked: "blocked",
  kindAdopt: "Import",
  kindSync: "Sync",
  statusMissing: "Missing",
  statusInstalled: "installed",
  statusPluginInstalled: "plugin installed",
  statusLinked: "linked",
  statusExternalLink: "external link",
  statusBroken: "broken",
  statusInvalid: "invalid",
  statusOrphaned: "orphaned",
  statusActive: "active",
  statusNoop: "noop",
  statusPlanned: "planned",
  statusBlocked: "blocked",
  opNoop: "noop",
  opCopyToLibrary: "copy to library",
  opCreateRoot: "create root",
  opRemoveExisting: "remove existing",
  opBackupExisting: "backup existing",
  opCreateSymlink: "create symlink",
  issueBrokenSymlink: "This skill entry is a broken symlink",
  issueMissingSkillMd: "This folder is not a valid skill because SKILL.md is missing",
  issueNameMismatch: "Frontmatter name does not match the folder name",
  issueContentConflict: "Multiple content versions found for this skill",
  issueMissingFrontmatter: "SKILL.md does not start with valid frontmatter",
  issueUnreadableSkillMd: "Unable to read SKILL.md"
};

const dictionaries: Record<Language, Record<keyof typeof zh, string>> = {
  "zh-CN": zh,
  en
};

export type TranslationKey = keyof typeof zh;

export function normalizeLanguage(value?: string): Language {
  return value === "en" ? "en" : "zh-CN";
}

export function t(language: Language, key: TranslationKey): string {
  return dictionaries[language][key];
}

export function statusLabel(language: Language, status: string): string {
  const map: Record<string, TranslationKey> = {
    missing: "statusMissing",
    installed: "statusInstalled",
    "plugin-installed": "statusPluginInstalled",
    linked: "statusLinked",
    "external-link": "statusExternalLink",
    broken: "statusBroken",
    invalid: "statusInvalid",
    orphaned: "statusOrphaned",
    active: "statusActive",
    noop: "statusNoop",
    planned: "statusPlanned",
    blocked: "statusBlocked"
  };
  const key = map[status];
  return key ? t(language, key) : status;
}

export function agentStatusLabel(language: Language, status: string): string {
  const map: Record<string, TranslationKey> = {
    installed: "agentInstalled",
    "not-installed": "agentNotInstalled",
    "skills-only": "agentSkillsOnly",
    residual: "agentResidual"
  };
  const key = map[status];
  return key ? t(language, key) : status;
}

export function detectionKindLabel(language: Language, kind: string): string {
  const map: Record<string, TranslationKey> = {
    cli: "cliSignal",
    app: "appSignal",
    extension: "extensionSignal",
    "plugin-installed": "pluginInstalledSignal",
    config: "configSignal"
  };
  const key = map[kind];
  return key ? t(language, key) : kind;
}

export function opTypeLabel(language: Language, opType: string): string {
  const map: Record<string, TranslationKey> = {
    noop: "opNoop",
    "copy-to-library": "opCopyToLibrary",
    "create-root": "opCreateRoot",
    "remove-existing": "opRemoveExisting",
    "backup-existing": "opBackupExisting",
    "create-symlink": "opCreateSymlink"
  };
  const key = map[opType];
  return key ? t(language, key) : opType;
}

export function riskLabel(language: Language, risk: string): string {
  const map: Record<string, TranslationKey> = {
    low: "riskLow",
    medium: "riskMedium",
    blocked: "riskBlocked"
  };
  const key = map[risk];
  return key ? t(language, key) : risk;
}

export function issueLabel(language: Language, code: string, fallback: string): string {
  const map: Record<string, TranslationKey> = {
    "broken-symlink": "issueBrokenSymlink",
    "missing-skill-md": "issueMissingSkillMd",
    "name-mismatch": "issueNameMismatch",
    "content-conflict": "issueContentConflict",
    "missing-frontmatter": "issueMissingFrontmatter",
    "unreadable-skill-md": "issueUnreadableSkillMd"
  };
  const key = map[code];
  return key ? t(language, key) : fallback;
}
