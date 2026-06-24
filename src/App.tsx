import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgentDiscoveryEmptyState } from "./components/AgentDiscoveryEmptyState";
import { SettingsSheet } from "./components/SettingsSheet";
import { TabButton } from "./components/TabButton";
import { demoBatchPlan, demoInventory, demoSkillLocks } from "./lib/demoData";
import { isTauriRuntime } from "./lib/runtime";
import { failedUpdateCheck, projectSkillsForFolder, quickMigrationSourcesForSkills, samePath, skillsShUpdateSource, syncSourcesForSkills } from "./lib/skillUtils";
import type { QuickMigrationMethod, SkillWorkspace, SyncMode, View } from "./uiTypes";
import { SkillsView } from "./views/SkillsView";
import { SyncView } from "./views/SyncView";
// @ts-ignore
import appLogo from "./m-my-skills-logo.png";
import type {
  AgentTarget,
  ApplyResult,
  InventorySnapshot,
  ProjectWorkspaceCandidate,
  Settings as AppSettings,
  SkillLockEntry,
  SkillRecord,
  SkillUpdateCheck,
  SyncPlan
} from "./types";

const defaultSettings: AppSettings = {
  libraryPath: "",
  projectFolders: [],
  customRoots: [],
  showRawPaths: false,
  language: "zh-CN"
};


export default function App() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [draftSettings, setDraftSettings] = useState<AppSettings>(defaultSettings);
  const [inventory, setInventory] = useState<InventorySnapshot | null>(null);
  const [skillLocks, setSkillLocks] = useState<Record<string, SkillLockEntry>>({});
  const [view, setView] = useState<View>("skills");
  const [skillWorkspace, setSkillWorkspace] = useState<SkillWorkspace>("global");
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [selectedProjectFolder, setSelectedProjectFolder] = useState<string | null>(null);
  const [discoveredProjects, setDiscoveredProjects] = useState<ProjectWorkspaceCandidate[]>([]);
  const [discoveryBasePath, setDiscoveryBasePath] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [skillUpdateChecks, setSkillUpdateChecks] = useState<Record<string, SkillUpdateCheck>>({});
  const [updatingSkillIds, setUpdatingSkillIds] = useState<Set<string>>(new Set());
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>("quick");
  const [busy, setBusy] = useState("启动中");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [previouslyScanned, setPreviouslyScanned] = useState(false);
  const bootStartedRef = useRef(false);
  const discoveryRunRef = useRef(0);

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    void boot();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const agents = useMemo(
    () =>
      [...(inventory?.agents ?? [])].sort((left, right) => {
        if (left.installed !== right.installed) return left.installed ? -1 : 1;
        return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
      }),
    [inventory?.agents]
  );
  const installedAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents]);
  const installedAgentIds = useMemo(() => new Set(installedAgents.map((agent) => agent.id)), [installedAgents]);
  const allSkills = inventory?.skills ?? [];
  const projectFolders = settings.projectFolders;

  useEffect(() => {
    setSelectedProjectFolder((current) => {
      if (current && projectFolders.includes(current)) return current;
      return projectFolders[0] ?? null;
    });
  }, [projectFolders]);

  useEffect(() => {
    if (agentFilter !== "all" && !installedAgentIds.has(agentFilter)) {
      setAgentFilter("all");
    }
  }, [agentFilter, installedAgentIds]);

  const globalSkills = useMemo(
    () => allSkills.filter((skill) => skill.installations.some((item) => item.scope === "global")),
    [allSkills]
  );

  const projectSkills = useMemo(
    () => projectSkillsForFolder(allSkills, selectedProjectFolder),
    [allSkills, selectedProjectFolder]
  );

  const visibleSourceSkills = skillWorkspace === "project" ? projectSkills : globalSkills;

  const filteredSkills = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return visibleSourceSkills.filter((skill) => {
      if (agentFilter !== "all" && !skill.installations.some((item) => item.agentId === agentFilter)) {
        return false;
      }

      if (!needle) return true;
      const haystack = [
        skill.displayName,
        skill.slug,
        skill.description ?? "",
        skill.installations.map((item) => item.agentLabel).join(" ")
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [agentFilter, query, visibleSourceSkills]);

  const selectedSkill = useMemo(
    () => selectedSkillId ? filteredSkills.find((skill) => skill.id === selectedSkillId) ?? null : null,
    [filteredSkills, selectedSkillId]
  );

  const queuedSkills = useMemo(
    () => allSkills.filter((skill) => selectedSkillIds.has(skill.id)),
    [allSkills, selectedSkillIds]
  );

  async function boot() {
    setBusy("读取上次扫描");
    setError(null);
    if (!isTauriRuntime()) {
      setSettings(defaultSettings);
      setDraftSettings(defaultSettings);
      setSkillLocks(demoSkillLocks);
      setInventory(demoInventory);
      const hadDemoData = (demoInventory?.agents?.length ?? 0) > 0 || (demoInventory?.skills?.length ?? 0) > 0;
      setHasScanned(hadDemoData);
      setPreviouslyScanned(hadDemoData);
      setSelectedSkillId(null);
      setBusy("");
      return;
    }
    try {
      const [loaded, locks, cachedInventory] = await Promise.all([
        invoke<AppSettings>("get_settings"),
        readSkillLocks(),
        readInventoryCache()
      ]);
      setSettings(loaded);
      setDraftSettings(loaded);
      setSkillLocks(locks);
      setInventory(cachedInventory);
      const hadData = (cachedInventory?.agents?.length ?? 0) > 0 || (cachedInventory?.skills?.length ?? 0) > 0;
      setHasScanned(hadData);
      setPreviouslyScanned(hadData);
      setSelectedSkillId((current) => {
        if (current && cachedInventory?.skills.some((skill) => skill.id === current)) return current;
        return null;
      });
      setSelectedSkillIds((current) => {
        if (!cachedInventory) return new Set();
        const valid = new Set(cachedInventory.skills.map((skill) => skill.id));
        return new Set([...current].filter((id) => valid.has(id)));
      });
      setBusy("");
    } catch (reason) {
      setError(String(reason));
      setBusy("");
    }
  }

  async function refreshInventory(silent = false) {
    if (!silent) {
      setBusy("扫描本机 Agent 与 Skills");
    }
    setError(null);
    if (!isTauriRuntime()) {
      setInventory(demoInventory);
      setSkillLocks(demoSkillLocks);
      setSkillUpdateChecks({});
      setHasScanned(true);
      setPreviouslyScanned(true);
      if (!silent) {
        setToast("重新扫描完成，已更新技能列表");
      }
      if (!silent) {
        setBusy("");
      }
      return;
    }
    try {
      const [locks, next] = await Promise.all([
        readSkillLocks(),
        invoke<InventorySnapshot>("scan_inventory", {
          options: { includeOrphaned: false }
        })
      ]);
      setSkillLocks(locks);
      setInventory(next);
      setSkillUpdateChecks({});
      setHasScanned(true);
      setPreviouslyScanned(true);
      setSelectedSkillId((current) => {
        if (current && next.skills.some((skill) => skill.id === current)) return current;
        return null;
      });
      setSelectedSkillIds((current) => {
        const valid = new Set(next.skills.map((skill) => skill.id));
        return new Set([...current].filter((id) => valid.has(id)));
      });
      if (!silent) {
        setToast("重新扫描完成，已更新技能列表");
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      if (!silent) {
        setBusy("");
      }
    }
  }

  async function refreshSkillLocks() {
    setSkillLocks(await readSkillLocks());
  }

  async function readSkillLocks() {
    if (!isTauriRuntime()) {
      return demoSkillLocks;
    }
    return invoke<Record<string, SkillLockEntry>>("read_skill_lock");
  }

  async function readInventoryCache() {
    if (!isTauriRuntime()) {
      return demoInventory;
    }
    return invoke<InventorySnapshot | null>("read_inventory_cache");
  }

  async function previewSkillsSync(skills = queuedSkills, targets: AgentTarget[] = []) {
    const sources = syncSourcesForSkills(skills);
    if (sources.length === 0) return;
    setBusy("生成同步预览");
    setError(null);
    setApplyResult(null);
    if (!isTauriRuntime()) {
      setSyncPlan(demoBatchPlan(skills, targets, "batch-sync"));
      setView("sync");
      setBusy("");
      return;
    }
    try {
      const plan = await invoke<SyncPlan>("preview_batch_sync", {
        sources,
        targets
      });
      setSyncPlan(plan);
      setView("sync");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy("");
    }
  }

  async function previewQuickMigration(skills = queuedSkills, method: QuickMigrationMethod, targets: AgentTarget[] = []) {
    const sources = quickMigrationSourcesForSkills(skills);
    if (sources.length === 0) return;
    setBusy("生成同步预览");
    setError(null);
    setApplyResult(null);
    if (!isTauriRuntime()) {
      setSyncPlan(demoBatchPlan(skills, targets, "batch-quick-migrate"));
      setView("sync");
      setBusy("");
      return;
    }
    try {
      const plan = await invoke<SyncPlan>("preview_batch_quick_migration", {
        sources,
        targets,
        method
      });
      setSyncPlan(plan);
      setView("sync");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy("");
    }
  }

  async function applyPlan() {
    if (!syncPlan) return;
    setBusy("执行同步计划");
    setError(null);
    if (!isTauriRuntime()) {
      setApplyResult({
        planId: syncPlan.planId,
        appliedOperations: syncPlan.operations.map((operation) => operation.id),
        skippedOperations: [],
        errors: [],
        inventoryRefreshRecommended: false
      });
      setBusy("");
      return;
    }
    try {
      const result = await invoke<ApplyResult>("apply_sync_plan", {
        planId: syncPlan.planId
      });
      setApplyResult(result);
      if (result.inventoryRefreshRecommended && result.errors.length === 0) {
        await refreshInventory();
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy("");
    }
  }

  async function toggleAgentSkill(
    skill: SkillRecord,
    agentId: string,
    active: boolean,
    sourcePath: string
  ) {
    // 1. 乐观更新本地 inventory 数据，使图标立刻发生亮起/置灰以实现零延迟极速显示
    setInventory((current) => {
      if (!current) return null;
      return {
        ...current,
        skills: current.skills.map((s) => {
          if (s.id !== skill.id) return s;
          let nextInstallations = [...s.installations];
          if (active) {
            if (!nextInstallations.some((inst) => inst.agentId === agentId)) {
              const agentLabel = agents.find((a) => a.id === agentId)?.label ?? agentId;
              nextInstallations.push({
                id: `${skill.id}-${agentId}`,
                agentId,
                agentLabel,
                scope: skillWorkspace,
                rootPath: "",
                entryPath: "",
                isSymlink: true,
                brokenSymlink: false,
                status: "active",
                issues: []
              });
            }
          } else {
            nextInstallations = nextInstallations.filter((inst) => inst.agentId !== agentId);
          }
          return {
            ...s,
            installations: nextInstallations
          };
        })
      };
    });

    // 2. 调用后台物理同步接口进行软链创建或移除
    try {
      await invoke("toggle_agent_skill", {
        skillId: skill.slug,
        agentId,
        scope: skillWorkspace,
        projectPath: selectedProjectFolder,
        active,
        sourcePath
      });
      // 3. 静默刷新同步最新的真实物理状态
      await refreshInventory(true);
    } catch (err) {
      // 4. 出错时触发静默扫描，自动回滚前端状态
      await refreshInventory(true);
      throw err;
    }
  }

  async function saveSettings() {
    setBusy("保存设置");
    setError(null);
    try {
      const saved = await invoke<AppSettings>("save_settings", { settings: draftSettings });
      setSettings(saved);
      setDraftSettings(saved);
      setSettingsOpen(false);
      await refreshInventory();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy("");
    }
  }

  async function saveProjectFolders(projectFolders: string[], busyLabel: string) {
    const nextSettings = {
      ...settings,
      projectFolders
    };
    setBusy(busyLabel);
    setError(null);
    try {
      if (isTauriRuntime()) {
        const saved = await invoke<AppSettings>("save_settings", { settings: nextSettings });
        setSettings(saved);
        setDraftSettings(saved);
      } else {
        setSettings(nextSettings);
        setDraftSettings(nextSettings);
      }
      await refreshInventory();
      return nextSettings;
    } catch (reason) {
      setError(String(reason));
      return null;
    } finally {
      setBusy("");
    }
  }

  async function addProjectPath(path: string) {
    const valid = await validateProjectWorkspacePath(path);
    if (!valid) {
      setToast("该项目没有 skills，暂时无法添加");
      return;
    }

    const projectFolders = Array.from(new Set([...settings.projectFolders, path]));
    const saved = await saveProjectFolders(projectFolders, "关联项目工作区");
    if (!saved) return;
    setSelectedProjectFolder(path);
    setSkillWorkspace("project");
    setView("skills");
    setDiscoveredProjects((current) =>
      current.map((candidate) => candidate.path === path ? { ...candidate, alreadyLinked: true } : candidate)
    );
  }

  async function validateProjectWorkspacePath(path: string) {
    if (settings.projectFolders.some((folder) => samePath(folder, path))) return true;
    if (!isTauriRuntime()) return true;

    setBusy("检查项目 Skills");
    setError(null);
    try {
      const candidates = await invoke<ProjectWorkspaceCandidate[]>("discover_project_workspaces", {
        basePath: path
      });
      return candidates.some((candidate) => samePath(candidate.path, path) && candidate.skillCount > 0);
    } catch (reason) {
      setError(String(reason));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function addProjectWorkspace() {
    const selected = await open({ directory: true, multiple: false, title: "关联项目工作区" });
    if (typeof selected !== "string") return;
    await addProjectPath(selected);
  }

  async function chooseSyncProject() {
    if (!isTauriRuntime()) {
      return "/Users/example/Projects/demo-project";
    }

    const selected = await open({ directory: true, multiple: false, title: "选择要同步的项目" });
    return typeof selected === "string" ? selected : null;
  }

  async function discoverProjectWorkspaces() {
    const selected = await open({ directory: true, multiple: false, title: "扫描发现项目工作区" });
    if (typeof selected !== "string") return;
    const runId = discoveryRunRef.current + 1;
    discoveryRunRef.current = runId;
    setBusy("扫描发现项目工作区");
    setError(null);
    setSkillWorkspace("project");
    setView("skills");
    setDiscoveryBasePath(selected);
    try {
      if (!isTauriRuntime()) {
        if (discoveryRunRef.current !== runId) return;
        setDiscoveredProjects([]);
        setDiscoveryBasePath(null);
        setToast("该项目没有 skills，暂时无法添加");
        return;
      }
      const candidates = await invoke<ProjectWorkspaceCandidate[]>("discover_project_workspaces", {
        basePath: selected
      });
      if (discoveryRunRef.current !== runId) return;
      if (candidates.length === 0) {
        setDiscoveredProjects([]);
        setDiscoveryBasePath(null);
        setToast("该项目没有 skills，暂时无法添加");
        return;
      }
      setDiscoveredProjects(candidates);
    } catch (reason) {
      if (discoveryRunRef.current === runId) {
        setError(String(reason));
      }
    } finally {
      if (discoveryRunRef.current === runId) {
        setBusy("");
      }
    }
  }

  function closeProjectDiscovery() {
    discoveryRunRef.current += 1;
    setDiscoveredProjects([]);
    setDiscoveryBasePath(null);
    setBusy((current) => current === "扫描发现项目工作区" ? "" : current);
  }

  async function removeProjectWorkspace(folder: string) {
    const nextProjectFolders = settings.projectFolders.filter((item) => item !== folder);
    const saved = await saveProjectFolders(nextProjectFolders, "移除项目工作区");
    if (!saved) return;
    if (selectedProjectFolder === folder) {
      setSelectedProjectFolder(saved.projectFolders[0] ?? null);
    }
    setDiscoveredProjects((current) =>
      current.map((candidate) => candidate.path === folder ? { ...candidate, alreadyLinked: false } : candidate)
    );
  }

  function toggleSkill(id: string) {
    setSelectedSkillIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openSelectedSkillsSync(mode: SyncMode) {
    if (selectedSkillIds.size === 0) return;
    setView("sync");
    setSyncMode(mode);
  }

  function clearSelectedSkills() {
    setSelectedSkillIds(new Set());
  }

  async function refreshSkillsShUpdateChecks(
    skills: SkillRecord[],
    locks: Record<string, SkillLockEntry>,
    force = false
  ) {
    if (!isTauriRuntime() || skills.length === 0) return;

    // 过滤出有更新源的技能
    const targetSkills = skills.filter(skill => skillsShUpdateSource(skill, locks) !== null);
    if (targetSkills.length === 0) return;

    // 批量预设状态为 checking，避免频繁重绘
    setSkillUpdateChecks((current) => {
      const next = { ...current };
      let changed = false;
      for (const skill of targetSkills) {
        if (force || !next[skill.id]) {
          next[skill.id] = { status: "checking" };
          changed = true;
        }
      }
      return changed ? next : current;
    });

    // 限制最大并发量为 3
    const limit = 3;
    let index = 0;

    // 状态批量缓存与节流提交逻辑，大幅减少 React 重渲染次数
    let pendingUpdates: Record<string, SkillUpdateCheck> = {};
    let throttleTimeout: number | null = null;

    const flushUpdates = () => {
      if (Object.keys(pendingUpdates).length === 0) return;
      const batch = { ...pendingUpdates };
      pendingUpdates = {};
      setSkillUpdateChecks((current) => ({
        ...current,
        ...batch
      }));
    };

    const queueUpdate = (skillId: string, result: SkillUpdateCheck) => {
      pendingUpdates[skillId] = result;
      if (!throttleTimeout) {
        throttleTimeout = window.setTimeout(() => {
          throttleTimeout = null;
          flushUpdates();
        }, 150);
      }
    };

    async function worker() {
      while (index < targetSkills.length) {
        const skill = targetSkills[index++];
        if (!skill) continue;
        const source = skillsShUpdateSource(skill, locks);
        if (!source) continue;

        try {
          const result = await invoke<SkillUpdateCheck>("check_skills_sh_update", {
            slug: skill.slug,
            entryPath: source.installation.entryPath,
            sourceUrl: source.sourceUrl,
            skillPath: source.lock.skillPath ?? null
          });
          queueUpdate(skill.id, result);
        } catch (reason) {
          queueUpdate(skill.id, failedUpdateCheck(reason));
        }
      }
    }

    // 启动 3 个 worker 并发消化队列
    const workers = Array.from({ length: Math.min(limit, targetSkills.length) }, worker);
    
    // 等待所有 worker 执行完毕后做一次最后的兜底更新，并清理可能还存在的定时器
    void Promise.all(workers).then(() => {
      if (throttleTimeout) {
        window.clearTimeout(throttleTimeout);
        throttleTimeout = null;
      }
      flushUpdates();
      setToast("技能更新检查完成");
    });
  }

  async function checkAllSkillsUpdates() {
    if (!inventory) return;
    void refreshSkillsShUpdateChecks(inventory.skills, skillLocks, true);
  }

  const checkingUpdates = Object.values(skillUpdateChecks).some((check) => check.status === "checking");

  async function updateSkillsShSkill(skill: SkillRecord) {
    const source = skillsShUpdateSource(skill, skillLocks);
    if (!source) return;
    setBusy(`更新 ${skill.displayName}`);
    setError(null);
    setUpdatingSkillIds((current) => new Set(current).add(skill.id));
    try {
      const result = await invoke<SkillUpdateCheck>("update_skills_sh_skill", {
        slug: skill.slug,
        entryPath: source.installation.entryPath,
        sourceUrl: source.sourceUrl,
        skillPath: source.lock.skillPath ?? null
      });
      setSkillUpdateChecks((current) => ({ ...current, [skill.id]: result }));
      await refreshInventory();
    } catch (reason) {
      setError(String(reason));
      setSkillUpdateChecks((current) => ({
        ...current,
        [skill.id]: failedUpdateCheck(reason)
      }));
    } finally {
      setUpdatingSkillIds((current) => {
        const next = new Set(current);
        next.delete(skill.id);
        return next;
      });
      setBusy("");
    }
  }

  async function updateAllAvailableSkills() {
    if (!inventory) return;
    const availableSkills = inventory.skills.filter(
      (skill) => skillUpdateChecks[skill.id]?.status === "available"
    );
    if (availableSkills.length === 0) return;

    setBusy(`正在更新 ${availableSkills.length} 个技能...`);
    setError(null);
    setUpdatingSkillIds((current) => {
      const next = new Set(current);
      for (const s of availableSkills) {
        next.add(s.id);
      }
      return next;
    });

    let successCount = 0;
    let failCount = 0;

    for (const skill of availableSkills) {
      const source = skillsShUpdateSource(skill, skillLocks);
      if (!source) continue;
      try {
        const result = await invoke<SkillUpdateCheck>("update_skills_sh_skill", {
          slug: skill.slug,
          entryPath: source.installation.entryPath,
          sourceUrl: source.sourceUrl,
          skillPath: source.lock.skillPath ?? null
        });
        setSkillUpdateChecks((current) => ({
          ...current,
          [skill.id]: result
        }));
        successCount++;
      } catch (err) {
        console.error(`更新技能 ${skill.displayName} 失败:`, err);
        failCount++;
      } finally {
        setUpdatingSkillIds((current) => {
          const next = new Set(current);
          next.delete(skill.id);
          return next;
        });
      }
    }

    await refreshInventory(true);
    setBusy("");

    if (failCount > 0) {
      alert(`更新完成。成功 ${successCount} 个，失败 ${failCount} 个。`);
    } else {
      setToast(`已成功更新 ${successCount} 个技能`);
    }
  }

  return (
    <main className="app-shell">
      <header className="top-nav">
        <div className="tab-bar" aria-label="主导航">
          <button
            className="nav-avatar"
            onClick={() => setSettingsOpen(true)}
            title="设置"
            type="button"
          >
            <img src={appLogo} alt="Manage My skills" />
          </button>
          <TabButton active={view === "skills"} onClick={() => setView("skills")}>
            发现 Skills
          </TabButton>
          <TabButton active={view === "sync"} onClick={() => setView("sync")}>
            同步 Skills
          </TabButton>
        </div>


      </header>

      {error && (
        <div className="banner error">
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      <section className="content-frame">
        {view === "skills" && !hasScanned ? (
          <div className="agents-page empty-state-page">
            <AgentDiscoveryEmptyState
              busy={busy}
              previouslyScanned={previouslyScanned}
              onScan={() => void refreshInventory()}
              onSkip={() => setHasScanned(true)}
            />
          </div>
        ) : view === "skills" ? (
          <SkillsView
            agents={installedAgents}
            skills={filteredSkills}
            allSkills={allSkills}
            sourceSkills={visibleSourceSkills}
            skillLocks={skillLocks}
            skillUpdateChecks={skillUpdateChecks}
            updatingSkillIds={updatingSkillIds}
            checkingUpdates={checkingUpdates}
            onCheckUpdates={checkAllSkillsUpdates}
            workspace={skillWorkspace}
            projectFolders={projectFolders}
            selectedProjectFolder={selectedProjectFolder}
            discoveredProjects={discoveredProjects}
            discoveryBasePath={discoveryBasePath}
            discovering={busy === "扫描发现项目工作区"}
            refreshing={busy === "扫描本机 Agent 与 Skills"}
            selectedSkill={selectedSkill}
            selectedSkillIds={selectedSkillIds}
            query={query}
            agentFilter={agentFilter}
            settings={settings}
            onQuery={setQuery}
            onAgentFilter={setAgentFilter}
            onWorkspace={(workspace) => {
              setSkillWorkspace(workspace);
              setSelectedSkillId(null);
              setQuery("");
              setAgentFilter("all");
            }}
            onSelectProject={(folder) => {
              setSelectedProjectFolder(folder);
              setSelectedSkillId(null);
              setQuery("");
              setAgentFilter("all");
            }}
            onSelectSkill={setSelectedSkillId}
            onToggleSkill={toggleSkill}
            onUpdateSkill={updateSkillsShSkill}
            onUpdateAllAvailable={updateAllAvailableSkills}
            onToggleAgentSkill={toggleAgentSkill}
            onAdoptSelected={() => openSelectedSkillsSync("managed")}
            onQuickSyncSelected={() => openSelectedSkillsSync("quick")}
            onClearSelection={clearSelectedSkills}
            onRefresh={(silent) => void refreshInventory(silent)}
            onAddProject={() => void addProjectWorkspace()}
            onDiscoverProjects={() => void discoverProjectWorkspaces()}
            onCloseDiscovery={closeProjectDiscovery}
            onLinkDiscoveredProject={(path) => void addProjectPath(path)}
            onRemoveProject={(folder) => void removeProjectWorkspace(folder)}
            onShowToast={setToast}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : null}

        {view === "sync" && (
          <SyncView
            agents={installedAgents.length ? installedAgents : agents}
            queuedSkills={queuedSkills}
            settings={settings}
            plan={syncPlan}
            applyResult={applyResult}
            busy={Boolean(busy)}
            syncMode={syncMode}
            onSyncModeChange={setSyncMode}
            onRemoveSkill={(id) => {
              setSelectedSkillIds((current) => {
                const next = new Set(current);
                next.delete(id);
                return next;
              });
            }}
            onPreviewGlobal={(targets) => void previewSkillsSync(queuedSkills, targets)}
            onPreviewProject={(targets) => void previewSkillsSync(queuedSkills, targets)}
            onPreviewQuick={(method, targets) => void previewQuickMigration(queuedSkills, method, targets)}
            onChooseProject={chooseSyncProject}
            onApply={() => void applyPlan()}
            onGoSkills={() => setView("skills")}
          />
        )}
      </section>

      {settingsOpen && (
        <SettingsSheet
          settings={draftSettings}
          inventory={inventory}
          agents={agents.filter((a) => a.installed || settings.customAgents?.some(ca => ca.id === a.id))}
          skills={allSkills}
          onChange={setDraftSettings}
          onClose={() => {
            setDraftSettings(settings);
            setSettingsOpen(false);
          }}
          onSave={() => void saveSettings()}
        />
      )}
    </main>
  );
}
