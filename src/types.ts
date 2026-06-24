export type Settings = {
  libraryPath: string;
  projectFolders: string[];
  customRoots: CustomRoot[];
  showRawPaths: boolean;
  language: string;
};

export type CustomRoot = {
  id: string;
  label: string;
  path: string;
};

export type AgentDetectionSource = {
  kind: string;
  label: string;
  path: string;
  exists: boolean;
};

export type AgentRecord = {
  id: string;
  label: string;
  globalRoots: string[];
  projectRoots: string[];
  activeSignals: string[];
  cliNames: string[];
  appPaths: string[];
  symlinkSupport: boolean;
  priority: number;
  installed: boolean;
  status: string;
  detectionSources: AgentDetectionSource[];
  skillRoots: ResolvedRoot[];
  skillEntryCount: number;
};

export type ResolvedRoot = {
  agentId: string;
  agentLabel: string;
  scope: string;
  path: string;
  exists: boolean;
  active: boolean;
  orphaned: boolean;
};

export type ProjectWorkspaceAgentRoot = {
  agentId: string;
  agentLabel: string;
  path: string;
  skillCount: number;
};

export type ProjectWorkspaceCandidate = {
  name: string;
  path: string;
  agentRoots: ProjectWorkspaceAgentRoot[];
  skillCount: number;
  alreadyLinked: boolean;
};

export type SkillFrontmatter = {
  name?: string;
  description?: string;
  license?: string;
  allowedTools: string[];
  metadata: Record<string, string>;
};

export type SkillIssue = {
  code: string;
  severity: string;
  message: string;
  path?: string;
  agentId?: string;
};

export type SkillInstallation = {
  id: string;
  agentId: string;
  agentLabel: string;
  scope: string;
  rootPath: string;
  entryPath: string;
  realPath?: string;
  symlinkTarget?: string;
  isSymlink: boolean;
  brokenSymlink: boolean;
  hash?: string;
  frontmatter?: SkillFrontmatter;
  status: string;
  issues: SkillIssue[];
};

export type SkillRecord = {
  id: string;
  slug: string;
  displayName: string;
  description?: string;
  canonicalStatus: string;
  canonicalPath?: string;
  canonicalHash?: string;
  installations: SkillInstallation[];
  missingAgents: string[];
  issues: SkillIssue[];
  conflict: boolean;
};

export type InventorySnapshot = {
  agents: AgentRecord[];
  roots: ResolvedRoot[];
  skills: SkillRecord[];
  issues: SkillIssue[];
  scannedAt: string;
  appDataPath: string;
  libraryPath: string;
};

export type SkillContent = {
  path: string;
  title: string;
  frontmatter?: SkillFrontmatter;
  content: string;
  markdownBody: string;
};

export type SkillLockEntry = {
  source?: string;
  sourceType?: string;
  sourceUrl?: string;
  skillPath?: string;
  installedAt?: string;
  updatedAt?: string;
};

export type SkillUpdateCheck = {
  status: string;
  message?: string;
  localHash?: string;
  remoteHash?: string;
};

export type InstallationRef = {
  installationId: string;
  entryPath: string;
  slug: string;
};

export type AgentTarget = {
  agentId: string;
  scope?: string;
  projectPath?: string;
};

export type SyncOperation = {
  id: string;
  opType: string;
  status: string;
  sourcePath?: string;
  targetPath?: string;
  backupPath?: string;
  message: string;
  agentId?: string;
  skillId?: string;
};

export type SyncPlan = {
  planId: string;
  kind: string;
  riskLevel: string;
  operations: SyncOperation[];
  preconditions: string[];
  blockedConflicts: string[];
  createdAt: string;
};

export type ApplyResult = {
  planId: string;
  appliedOperations: string[];
  skippedOperations: string[];
  errors: string[];
  inventoryRefreshRecommended: boolean;
};
