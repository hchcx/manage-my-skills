import type {
  AgentRecord,
  AgentTarget,
  InventorySnapshot,
  SkillInstallation,
  SkillLockEntry,
  SkillRecord,
  SyncPlan,
} from '../types'
import { firstValidInstallation } from './skillUtils'

export const demoAgents: AgentRecord[] = [
  demoAgent('amp', 'AMP', 'installed', 3, ['cli']),
  demoAgent('antigravity', 'Antigravity', 'not-installed', 0, []),
  demoAgent('augment', 'Augment', 'not-installed', 0, []),
  demoAgent('claude-code', 'Claude Code', 'installed', 8, ['cli', 'config']),
  demoAgent('cline', 'Cline', 'installed', 2, ['extension']),
  demoAgent('codebuddy', 'CodeBuddy', 'not-installed', 0, []),
  demoAgent('codex', 'Codex', 'installed', 12, ['cli', 'plugin-installed']),
  demoAgent('cursor', 'Cursor', 'installed', 4, ['app']),
  demoAgent('gemini-cli', 'Gemini CLI', 'installed', 2, ['cli']),
  demoAgent('github-copilot', 'GitHub Copilot', 'not-installed', 1, ['config']),
  demoAgent('grok-cli', 'Grok CLI', 'not-installed', 0, []),
  demoAgent('hermes', 'Hermes', 'not-installed', 0, []),
  demoAgent('junie', 'Junie', 'not-installed', 0, []),
  demoAgent('kilo-code', 'Kilo Code', 'not-installed', 0, []),
  demoAgent('kimi', 'Kimi', 'not-installed', 0, []),
  demoAgent('kiro', 'Kiro', 'not-installed', 0, []),
  demoAgent('openclaw', 'OpenClaw', 'not-installed', 0, []),
  demoAgent('opencode', 'OpenCode', 'installed', 1, ['cli']),
  demoAgent('pi', 'Pi', 'not-installed', 0, []),
  demoAgent('qoder', 'Qoder', 'not-installed', 0, []),
  demoAgent('qwen_code', 'Qwen Code', 'not-installed', 0, []),
  demoAgent('trae', 'TRAE', 'installed', 1, ['app']),
  demoAgent('trae_cn', 'TRAE CN', 'not-installed', 0, []),
  demoAgent('warp', 'Warp', 'not-installed', 0, []),
  demoAgent('windsurf', 'Windsurf', 'installed', 3, ['app']),
  demoAgent('workbuddy', 'WorkBuddy', 'not-installed', 0, []),
  demoAgent('zed', 'Zed', 'installed', 2, ['app']),
]

export const demoInventory: InventorySnapshot = {
  agents: demoAgents,
  roots: [],
  skills: [
    demoSkill(
      'browser',
      'Browser Control',
      '控制浏览器、截图和验证本地页面。',
      ['codex', 'claude-code', 'cursor'],
    ),
    demoSkill(
      'blog-translator',
      'Blog Translator',
      '抓取英文博客并整理成中文 Markdown。',
      ['codex', 'amp'],
    ),
    demoSkill(
      'swiftui-patterns',
      'SwiftUI UI Patterns',
      '构建和重构 SwiftUI 界面结构。',
      ['codex', 'windsurf', 'claude-code'],
    ),
    demoSkill('playwright', 'Playwright', '自动化真实浏览器做 UI 验证。', [
      'codex',
      'gemini-cli',
    ]),
  ],
  issues: [],
  scannedAt: new Date().toISOString(),
  appDataPath: '/Users/example/Library/Application Support/manage-my-skills',
  libraryPath: '/Users/example/.manage-my-skills/skills',
}

export const demoSkillLocks: Record<string, SkillLockEntry> = {
  browser: {
    sourceType: 'github',
    sourceUrl: 'https://github.com/example/browser-skills.git',
  },
}

export function demoAgent(
  id: string,
  label: string,
  status: string,
  count: number,
  kinds: string[],
): AgentRecord {
  const installed = status === 'installed'
  return {
    id,
    label,
    globalRoots: [`~/.${id}/skills`],
    projectRoots: [`.${id}/skills`],
    activeSignals: [`~/.${id}`],
    cliNames: installed ? [id] : [],
    appPaths: [],
    symlinkSupport: true,
    priority: 1,
    installed,
    status,
    detectionSources: kinds.map((kind) => ({
      kind,
      label: kind,
      path:
        kind === 'app' ? `/Applications/${label}.app` : `/Users/example/.${id}`,
      exists: true,
    })),
    skillRoots: [],
    skillEntryCount: count,
  }
}

function demoSkill(
  id: string,
  name: string,
  description: string,
  agentIds: string[],
): SkillRecord {
  const installations = agentIds.map((agentId) => {
    const agent =
      demoAgents.find((item) => item.id === agentId) ?? demoAgents[0]
    return {
      id: `${agentId}:${id}`,
      agentId,
      agentLabel: agent.label,
      scope: 'global',
      rootPath: `/Users/example/.${agentId}/skills`,
      entryPath: `/Users/example/.${agentId}/skills/${id}`,
      isSymlink: agentId !== agentIds[0],
      brokenSymlink: false,
      status: agentId === agentIds[0] ? 'installed' : 'linked',
      issues: [],
    } satisfies SkillInstallation
  })

  return {
    id,
    slug: id,
    displayName: name,
    description,
    canonicalStatus: 'imported',
    canonicalPath: `/Users/example/.manage-my-skills/skills/${id}`,
    canonicalHash: 'demo',
    installations,
    missingAgents: demoAgents
      .filter((agent) => agent.installed && !agentIds.includes(agent.id))
      .map((agent) => agent.id),
    issues: [],
    conflict: false,
  }
}

function demoPlan(
  skill: SkillRecord,
  targets: AgentTarget[],
  kind: 'adopt' | 'sync' | 'quick-migrate',
): SyncPlan {
  const fallbackTargets =
    targets.length > 0 ? targets : [{ agentId: 'codex', scope: 'global' }]
  return {
    planId: `demo-${kind}-${Date.now()}`,
    kind,
    riskLevel: 'low',
    preconditions:
      kind === 'adopt'
        ? ['复制源 Skill 到中心库']
        : ['确认目标 Agent 根目录存在'],
    blockedConflicts: [],
    createdAt: new Date().toISOString(),
    operations: [
      ...(kind === 'adopt'
        ? [
            {
              id: 'demo-copy',
              opType: 'copy-to-library',
              status: 'planned',
              sourcePath: firstValidInstallation(skill)?.entryPath,
              targetPath: `/Users/example/.manage-my-skills/skills/${skill.slug}`,
              message: `导入 ${skill.displayName} 到中心库`,
              skillId: skill.id,
            },
          ]
        : []),
      ...fallbackTargets.map((target, index) => ({
        id: `demo-link-${index}`,
        opType: 'create-symlink',
        status: 'planned',
        sourcePath: `/Users/example/.manage-my-skills/skills/${skill.slug}`,
        targetPath:
          target.scope === 'project' && target.projectPath
            ? `${target.projectPath}/.agents/skills/${skill.slug}`
            : `/Users/example/.${target.agentId}/skills/${skill.slug}`,
        message: `同步 ${skill.displayName} 到 ${target.agentId} ${target.scope ?? 'global'}`,
        agentId: target.agentId,
        skillId: skill.id,
      })),
    ],
  }
}

export function demoBatchPlan(
  skills: SkillRecord[],
  targets: AgentTarget[],
  kind: 'batch-sync' | 'batch-quick-migrate',
): SyncPlan {
  const plans = skills.map((skill) =>
    demoPlan(skill, targets, kind === 'batch-sync' ? 'sync' : 'quick-migrate'),
  )
  return {
    planId: `demo-${kind}-${Date.now()}`,
    kind,
    riskLevel: plans.some((plan) => plan.riskLevel === 'medium')
      ? 'medium'
      : 'low',
    preconditions: Array.from(
      new Set(plans.flatMap((plan) => plan.preconditions)),
    ),
    blockedConflicts: plans.flatMap((plan) => plan.blockedConflicts),
    createdAt: new Date().toISOString(),
    operations: plans.flatMap((plan, planIndex) =>
      plan.operations.map((operation) => ({
        ...operation,
        id: `${operation.id}-${planIndex}`,
      })),
    ),
  }
}
