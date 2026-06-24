import type { AgentRecord, InstallationRef, SkillInstallation, SkillLockEntry, SkillRecord, SkillUpdateCheck, SyncPlan } from "../types";

export function syncPlanSummary(plan: SyncPlan) {
  return plan.operations.reduce(
    (summary, operation) => {
      if (operation.opType === "create-root") summary.create += 1;
      if (operation.opType === "copy-to-library") summary.create += 1;
      if (operation.opType === "copy-to-target") summary.create += 1;
      if (operation.opType === "remove-existing") summary.overwrite += 1;
      if (operation.opType === "backup-existing") {
        summary.backup += 1;
        summary.overwrite += 1;
      }
      if (operation.opType === "create-symlink") summary.symlink += 1;
      if (operation.opType === "noop" || operation.status === "noop") summary.noop += 1;
      return summary;
    },
    { create: 0, overwrite: 0, backup: 0, symlink: 0, noop: 0 }
  );
}

export function firstValidInstallation(skill: SkillRecord): SkillInstallation | null {
  return skill.installations.find((installation) => installation.status !== "invalid" && !installation.brokenSymlink) ?? null;
}

export function syncSourcesForSkills(skills: SkillRecord[]): InstallationRef[] {
  return skills.map((skill) => {
    if (skill.canonicalStatus === "imported") {
      return {
        installationId: "",
        entryPath: "",
        slug: skill.slug
      };
    }

    const installation = firstValidInstallation(skill);
    return {
      installationId: installation?.id ?? "",
      entryPath: installation?.entryPath ?? "",
      slug: skill.slug
    };
  });
}

export function quickMigrationSourcesForSkills(skills: SkillRecord[]): InstallationRef[] {
  return skills.map((skill) => {
    const installation = firstValidInstallation(skill);
    return {
      installationId: installation?.id ?? "",
      entryPath: installation?.entryPath ?? skill.canonicalPath ?? "",
      slug: skill.slug
    };
  });
}

export function skillListStatus(
  skill: SkillRecord,
  skillLocks: Record<string, SkillLockEntry>,
  updateCheck?: SkillUpdateCheck
) {
  if (
    skill.conflict ||
    skill.issues.length > 0 ||
    skill.installations.some((installation) => installation.brokenSymlink || installation.status === "invalid" || installation.status === "broken")
  ) {
    return { kind: "check", label: "需检查", title: "检测到内容冲突、缺失文件或无效安装入口" };
  }

  if (updateCheck?.status === "available") {
    return { kind: "update", label: "可更新", title: "发现 skills.sh 来源有新内容，点击更新" };
  }
  if (updateCheck?.status === "checking") {
    return { kind: "checking", label: "检查中", title: "正在检查 skills.sh 来源是否有更新" };
  }
  if (updateCheck?.status === "check-failed") {
    return { kind: "ok", label: "可用", title: updateCheck.message ?? "更新检查失败，不影响当前可用性" };
  }

  return { kind: "ok", label: "可用", title: "当前未发现明显问题" };
}

export function skillSourceSummary(skill: SkillRecord, skillLocks: Record<string, SkillLockEntry>) {
  const skillsShInstallation = skill.installations.find((installation) => isAgentsSkillPath(installation.entryPath));
  const lock = skillsShLock(skill, skillLocks);
  if (skillsShInstallation && lock) {
    const detail = formatSourceDetail(lock.sourceUrl || lock.source || skillsShInstallation.entryPath);
    return {
      label: "skills.sh 安装",
      detail,
      owner: sourceOwner(detail),
      githubUrl: githubUrlFromDetail(detail)
    };
  }

  const pluginInstallation = skill.installations.find((installation) => pluginSourceDetail(installation.entryPath));
  if (pluginInstallation) {
    const detail = pluginSourceDetail(pluginInstallation.entryPath) ?? compactPath(pluginInstallation.entryPath);
    return {
      label: "Plugin 安装",
      detail,
      owner: sourceOwner(detail),
      githubUrl: githubUrlFromDetail(detail)
    };
  }

  const gitInstallation = skill.installations.find((installation) => installation.entryPath.includes("/.git/") || installation.rootPath.includes("/.git/"));
  if (gitInstallation) {
    const detail = compactPath(gitInstallation.entryPath);
    return {
      label: "Git 安装",
      detail,
      owner: sourceOwner(detail),
      githubUrl: githubUrlFromDetail(detail)
    };
  }

  const installation = firstValidInstallation(skill);
  const detail = compactPath(skill.canonicalPath ?? installation?.entryPath ?? skill.slug);
  return {
    label: "本地安装",
    detail,
    owner: sourceOwner(detail),
    githubUrl: githubUrlFromDetail(detail)
  };
}

export function skillsShUpdateSource(skill: SkillRecord, skillLocks: Record<string, SkillLockEntry>) {
  const installation = skill.installations.find((item) => isAgentsSkillPath(item.entryPath));
  const lock = skillsShLock(skill, skillLocks);
  const sourceUrl = lock?.sourceUrl || lock?.source;
  if (!installation || !lock || !sourceUrl) return null;
  return { installation, lock, sourceUrl };
}

function skillsShLock(skill: SkillRecord, skillLocks: Record<string, SkillLockEntry>) {
  return skillLocks[skill.slug] ?? skillLocks[skill.displayName];
}

const AGENTS_SKILL_PATH_REGEX = /\/\.agents\/skills\/[^/]+$/;

function isAgentsSkillPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return AGENTS_SKILL_PATH_REGEX.test(normalized);
}

export function failedUpdateCheck(reason: unknown): SkillUpdateCheck {
  return { status: "check-failed", message: String(reason) };
}

function pluginSourceDetail(path: string) {
  const normalized = path.replace(/\\/g, "/");
  
  const claudeMarketplace = normalized.match(/\/\.claude\/plugins\/marketplaces\/([^/]+)/);
  if (claudeMarketplace) return marketplaceRepositoryLabel(claudeMarketplace[1]);

  const cursorMarketplace = normalized.match(/\/\.cursor\/plugins\/marketplaces\/([^/]+)/);
  if (cursorMarketplace) return marketplaceRepositoryLabel(cursorMarketplace[1]);

  const codexPlugin = normalized.match(/\/\.codex\/plugins\/cache\/([^/]+)\/([^/]+)/);
  if (codexPlugin) return codexPluginRepositoryLabel(codexPlugin[1], codexPlugin[2]);

  return null;
}

function marketplaceRepositoryLabel(name: string) {
  const repositories: Record<string, string> = {
    "anthropic-agent-skills": "github.com/anthropics/skills",
    "axton-obsidian-visual-skills": "github.com/axtonliu/axton-obsidian-visual-skills",
    "caicai-skills": "github.com/nextcaicai/caicai-skills",
    "claude-plugins-official": "github.com/anthropics/claude-plugins-official",
    "dontbesilent-skills": "github.com/dontbesilent2025/dbskill"
  };
  return repositories[name] ?? name;
}

function codexPluginRepositoryLabel(marketplace: string, name: string) {
  const repositories: Record<string, string> = {
    "build-ios-apps": "github.com/openai/plugins",
    browser: "openai-bundled/browser",
    chrome: "openai-bundled/chrome",
    hyperframes: "github.com/heygen-com/hyperframes",
    remotion: "github.com/remotion-dev/remotion"
  };
  return repositories[name] ?? `${marketplace}/${name}`;
}

function formatSourceDetail(value: string) {
  return compactPath(value.replace(/^https?:\/\//, "").replace(/^git@github\.com:/, "github.com/").replace(/\.git$/, ""));
}

function sourceOwner(detail: string) {
  const github = detail.match(/^github\.com\/([^/]+)/);
  if (github) return github[1];

  const bundled = detail.match(/^(openai-bundled|openai-curated)(?:\/|$)/);
  if (bundled) return bundled[1];

  return null;
}

function githubUrlFromDetail(detail: string) {
  return detail.startsWith("github.com/") ? `https://${detail}` : null;
}

export function compactPath(path: string) {
  let result = path;
  // 去除 Windows UNC 路径前缀 \\?\
  result = result.replace(/^\\\\\?\\/, "");
  result = result.replace(/^[a-zA-Z]:[/\\]users[/\\][^/\\]+/i, "~");
  result = result.replace(/^\/users\/[^/]+/i, "~");
  return result;
}

export function samePath(left: string, right: string) {
  const normLeft = left.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const normRight = right.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return normLeft === normRight;
}

export function projectSkillsForFolder(skills: SkillRecord[], folder: string | null): SkillRecord[] {
  if (!folder) return [];
  const projectSkills: SkillRecord[] = [];
  for (const skill of skills) {
    const installations = skill.installations.filter((installation) =>
      installation.scope === "project" && isPathInFolder(installation.rootPath, folder)
    );
    if (installations.length === 0) continue;
    projectSkills.push({
      ...skill,
      installations,
      missingAgents: []
    });
  }
  return projectSkills;
}

export function projectName(folder: string) {
  const clean = folder.replace(/\/+$/, "");
  return clean.split("/").pop() || clean;
}

export function projectStats(folder: string, skills: SkillRecord[]) {
  const projectSkills = projectSkillsForFolder(skills, folder);
  const agentLabels = projectSkills
    .flatMap((skill) => skill.installations.map((installation) => installation.agentLabel))
    .filter((label, index, labels) => labels.indexOf(label) === index);
  return {
    skillCount: projectSkills.length,
    agentLabels
  };
}

function isPathInFolder(path: string, folder: string) {
  const normalizedPath = path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const normalizedFolder = folder.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
}

export function agentSkillCount(agentId: string, skills: SkillRecord[]) {
  return skills.filter((skill) => skill.installations.some((installation) => installation.agentId === agentId)).length;
}

export function agentSignalSummary(agent: AgentRecord) {
  const labels = agent.detectionSources.flatMap((source) => {
    if (source.kind === "cli") return ["CLI"];
    if (source.kind === "app") return ["APP"];
    if (source.kind === "extension") return ["插件"];
    if (source.kind === "plugin-installed") return ["插件"];
    return [];
  });
  return Array.from(new Set(labels)).join(" · ");
}
