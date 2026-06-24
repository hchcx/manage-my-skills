import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown, ChevronLeft, ChevronRight, FolderOpen, FolderPlus, Github, RefreshCw, Search, XCircle, ArrowUpCircle, Trash2, Undo, X, Settings } from "lucide-react";
import { Fragment, useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { agentIconAsset } from "../agentIconRegistry";
import { AgentEmptyVisual, ProjectEmptyVisual } from "../components/EmptyStateVisuals";
import { AgentBadge, AgentIcon, Coverage, IssueList, SkillState } from "../components/shared";
import { demoAgent } from "../lib/demoData";
import { isTauriRuntime } from "../lib/runtime";
import { agentSkillCount, compactPath, firstValidInstallation, projectName, projectStats, skillListStatus, skillSourceSummary, skillsShUpdateSource } from "../lib/skillUtils";
import type { AgentRecord, ProjectWorkspaceCandidate, Settings as AppSettings, SkillLockEntry, SkillRecord, SkillUpdateCheck } from "../types";
import type { SkillWorkspace } from "../uiTypes";

export function SkillsView({
  agents,
  skills,
  allSkills,
  sourceSkills,
  skillLocks,
  skillUpdateChecks,
  updatingSkillIds,
  checkingUpdates,
  workspace,
  projectFolders,
  selectedProjectFolder,
  discoveredProjects,
  discoveryBasePath,
  discovering,
  refreshing,
  selectedSkill,
  selectedSkillIds,
  query,
  agentFilter,
  settings,
  onQuery,
  onAgentFilter,
  onWorkspace,
  onSelectProject,
  onSelectSkill,
  onToggleSkill,
  onUpdateSkill,
  onUpdateAllAvailable,
  onToggleAgentSkill,
  onAdoptSelected,
  onQuickSyncSelected,
  onClearSelection,
  onRefresh,
  onCheckUpdates,
  onAddProject,
  onDiscoverProjects,
  onCloseDiscovery,
  onLinkDiscoveredProject,
  onRemoveProject,
  onShowToast,
  onOpenSettings
}: {
  agents: AgentRecord[];
  skills: SkillRecord[];
  allSkills: SkillRecord[];
  sourceSkills: SkillRecord[];
  skillLocks: Record<string, SkillLockEntry>;
  skillUpdateChecks: Record<string, SkillUpdateCheck>;
  updatingSkillIds: Set<string>;
  checkingUpdates: boolean;
  workspace: SkillWorkspace;
  projectFolders: string[];
  selectedProjectFolder: string | null;
  discoveredProjects: ProjectWorkspaceCandidate[];
  discoveryBasePath: string | null;
  discovering: boolean;
  refreshing: boolean;
  selectedSkill: SkillRecord | null;
  selectedSkillIds: Set<string>;
  query: string;
  agentFilter: string;
  settings: AppSettings;
  onQuery: (value: string) => void;
  onAgentFilter: (value: string) => void;
  onWorkspace: (value: SkillWorkspace) => void;
  onSelectProject: (folder: string) => void;
  onSelectSkill: (id: string | null) => void;
  onToggleSkill: (id: string) => void;
  onUpdateSkill: (skill: SkillRecord) => void;
  onUpdateAllAvailable: () => void;
  onToggleAgentSkill: (skill: SkillRecord, agentId: string, active: boolean, sourcePath: string) => Promise<void>;
  onAdoptSelected: () => void;
  onQuickSyncSelected: () => void;
  onClearSelection: () => void;
  onRefresh: (silent?: boolean) => void;
  onCheckUpdates: () => void;
  onAddProject: () => void;
  onDiscoverProjects: () => void;
  onCloseDiscovery: () => void;
  onLinkDiscoveredProject: (path: string) => void;
  onRemoveProject: (folder: string) => void;
  onShowToast?: (message: string) => void;
  onOpenSettings?: () => void;
}) {
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [projectScrollState, setProjectScrollState] = useState({ left: false, right: false });
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const projectBarRef = useRef<HTMLDivElement>(null);

  const [toggleBusy, setToggleBusy] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);

  const [optimisticDeletedPaths, setOptimisticDeletedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOptimisticDeletedPaths(new Set());
  }, [skills]);

  const [trashOpen, setTrashOpen] = useState(false);
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(false);

  const loadTrash = async () => {
    if (!isTauriRuntime()) return;
    setLoadingTrash(true);
    try {
      const items: any[] = await invoke("get_trash_items");
      setTrashItems(items);
    } catch (e) {
      console.error("Failed to load trash items:", e);
    } finally {
      setLoadingTrash(false);
    }
  };

  useEffect(() => {
    void loadTrash();
  }, []);

  useEffect(() => {
    if (trashOpen) {
      void loadTrash();
    }
  }, [trashOpen]);

  const handleRestoreSkill = async (id: string) => {
    // 乐观更新回收站列表
    setTrashItems((prev) => prev.filter((item) => item.id !== id));

    try {
      await invoke("restore_skill", { id });
      if (onShowToast) onShowToast("技能已成功恢复！");
      await loadTrash();
      onRefresh(true);
    } catch (err) {
      await loadTrash();
      alert(`恢复失败: ${err}`);
    }
  };

  const performDeleteSkill = async (localPath: string, displayName: string, associatedPaths: string[], beforeDelete: () => void) => {
    if (!window.confirm(`确定要将技能 "${displayName}" 移入回收站吗？\n删除后您可以在 30 天内随时恢复。`)) {
      return;
    }

    // 1. 乐观更新：本地直接剔除主体路径和关联路径
    setOptimisticDeletedPaths((prev) => {
      const next = new Set(prev);
      next.add(localPath);
      associatedPaths.forEach(p => next.add(p));
      return next;
    });
    // 2. 收起列表卡片或返回
    beforeDelete();

    try {
      await invoke("delete_skill", { path: localPath, associatedPaths });
      if (onShowToast) onShowToast("技能已成功移入回收站！");
      onRefresh(true);
    } catch (err) {
      // 失败时回退乐观删除
      setOptimisticDeletedPaths((prev) => {
        const next = new Set(prev);
        next.delete(localPath);
        associatedPaths.forEach(p => next.delete(p));
        return next;
      });
      alert(`删除失败: ${err}`);
    }
  };

  const handleDeleteTrashItemPermanently = async (id: string, name: string) => {
    if (!window.confirm(`确定要彻底删除 "${name}" 吗？\n此操作不可逆，它的所有物理文件将被永久删除！`)) {
      return;
    }
    try {
      await invoke("delete_trash_item_permanently", { id });
      if (onShowToast) onShowToast("已彻底物理删除技能！");
      await loadTrash();
    } catch (err) {
      alert(`彻底删除失败: ${err}`);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm("确定要清空回收站吗？\n所有已删除的 Skill 将被彻底物理删除，且不可恢复！")) {
      return;
    }
    try {
      await invoke("empty_trash");
      if (onShowToast) onShowToast("已清空回收站！");
      await loadTrash();
    } catch (err) {
      alert(`清空回收站失败: ${err}`);
    }
  };

  const getRemainingDays = (deletedAtStr: string) => {
    try {
      const deletedAt = new Date(deletedAtStr);
      const elapsedMs = Date.now() - deletedAt.getTime();
      const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
      const remaining = Math.max(0, Math.ceil(30 - elapsedDays));
      return remaining;
    } catch (e) {
      return 30;
    }
  };

  // 聚合去重，将相同 slug 的 Skills 合并为单行展示
  const mergedSkills = useMemo(() => {
    const map = new Map<string, SkillRecord>();
    for (const skill of skills) {
      const path = skill.canonicalPath ?? firstValidInstallation(skill)?.entryPath;
      if (path && optimisticDeletedPaths.has(path)) {
        continue;
      }
      const existing = map.get(skill.slug);
      if (existing) {
        const combinedInstalls = [...existing.installations];
        for (const inst of skill.installations) {
          if (!combinedInstalls.some(i => i.agentId === inst.agentId && i.scope === inst.scope && i.entryPath === inst.entryPath)) {
            combinedInstalls.push(inst);
          }
        }
        const combinedMissing = Array.from(new Set([...existing.missingAgents, ...skill.missingAgents]));
        const combinedIssues = [...existing.issues];
        for (const issue of skill.issues) {
          if (!combinedIssues.some(iss => iss.code === issue.code && iss.message === issue.message && iss.path === issue.path)) {
            combinedIssues.push(issue);
          }
        }

        const canonicalPath = existing.canonicalPath || skill.canonicalPath;
        const canonicalHash = existing.canonicalHash || skill.canonicalHash;
        const canonicalStatus = (existing.canonicalStatus === "imported" || skill.canonicalStatus === "imported") ? "imported" : "not-imported";

        map.set(skill.slug, {
          ...existing,
          installations: combinedInstalls,
          missingAgents: combinedMissing,
          issues: combinedIssues,
          canonicalPath,
          canonicalHash,
          canonicalStatus,
          conflict: existing.conflict || skill.conflict
        });
      } else {
        map.set(skill.slug, { ...skill });
      }
    }
    return Array.from(map.values());
  }, [skills, optimisticDeletedPaths]);

  const availableUpdatesCount = useMemo(() => {
    return skills.filter((s) => skillUpdateChecks[s.id]?.status === "available").length;
  }, [skills, skillUpdateChecks]);

  // 找出所有存在 name-mismatch 问题的 installations
  const nameMismatchedInstallations = useMemo(() => {
    const list: { entryPath: string; expectedName: string; skillName: string }[] = [];
    for (const skill of skills) {
      for (const issue of skill.issues) {
        if (issue.code === "name-mismatch" && issue.path) {
          const inst = skill.installations.find(i => i.entryPath === issue.path);
          const expectedName = inst?.frontmatter?.name || skill.displayName;
          if (expectedName) {
            list.push({
              entryPath: issue.path,
              expectedName,
              skillName: skill.displayName
            });
          }
        }
      }
    }
    return list;
  }, [skills]);

  const handleAgentToggle = async (
    event: React.MouseEvent,
    skill: SkillRecord,
    agentId: string,
    active: boolean
  ) => {
    event.stopPropagation();
    if (toggleBusy) return;

    let sourcePath = "";
    if (active) {
      if (skill.canonicalPath) {
        sourcePath = skill.canonicalPath;
      } else {
        const physical = skill.installations.find(i => !i.isSymlink && i.entryPath);
        sourcePath = physical?.entryPath || skill.installations[0]?.entryPath || "";
      }

      if (!sourcePath) {
        alert("无法同步：未找到该 Skill 的有效物理源路径，请先将其导入中心库或确保至少有一个非链接的本地副本。");
        return;
      }
    }

    setToggleBusy(`${skill.slug}-${agentId}`);
    try {
      await onToggleAgentSkill(skill, agentId, active, sourcePath);
    } catch (err) {
      alert(`快捷同步操作失败:\n${err}`);
    } finally {
      setToggleBusy(null);
    }
  };

  const handleFixFolderName = async (entryPath: string, skill: SkillRecord) => {
    if (!entryPath) return;
    const inst = skill.installations.find(i => i.entryPath === entryPath);
    const expectedName = inst?.frontmatter?.name || skill.displayName;
    if (!expectedName) {
      alert("无法修复：未找到期望的目标文件夹名称。");
      return;
    }

    try {
      await invoke("fix_skill_folder_name", {
        entryPath,
        expectedName
      });
      onRefresh(true);
    } catch (err) {
      alert(`修复名称失败:\n${err}`);
    }
  };

  const handleCreateSkillMd = async (entryPath: string, skill: SkillRecord) => {
    if (!entryPath) return;
    try {
      await invoke("create_skill_md", {
        entryPath,
        slug: skill.slug
      });
      onRefresh(true);
    } catch (err) {
      alert(`创建 SKILL.md 失败:\n${err}`);
    }
  };

  const handleFixAllNames = async () => {
    if (nameMismatchedInstallations.length === 0) return;
    if (fixingAll) return;
    if (!confirm(`确定要自动修复这 ${nameMismatchedInstallations.length} 个 Skills 的文件夹名称，使其与 Frontmatter 一致吗？`)) {
      return;
    }

    setFixingAll(true);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const item of nameMismatchedInstallations) {
      try {
        await invoke("fix_skill_folder_name", {
          entryPath: item.entryPath,
          expectedName: item.expectedName
        });
        successCount++;
      } catch (err) {
        failCount++;
        errors.push(`${item.skillName}: ${err}`);
      }
    }

    setFixingAll(false);
    onRefresh(true);

    if (failCount > 0) {
      alert(`一键修复完成。\n成功: ${successCount} 个\n失败: ${failCount} 个\n\n失败详情:\n${errors.join("\n")}`);
    } else {
      alert(`成功修复了 ${successCount} 个 Skills 的文件夹名称冲突！`);
    }
  };

  useEffect(() => {
    if (!agentMenuOpen) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) {
        setAgentMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAgentMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [agentMenuOpen]);

  const updateProjectScrollState = () => {
    const element = projectBarRef.current;
    if (!element) {
      setProjectScrollState({ left: false, right: false });
      return;
    }

    const maxScroll = element.scrollWidth - element.clientWidth;
    setProjectScrollState({
      left: element.scrollLeft > 2,
      right: element.scrollLeft < maxScroll - 2
    });
  };

  useEffect(() => {
    window.requestAnimationFrame(updateProjectScrollState);
  }, [projectFolders, selectedProjectFolder, workspace]);

  useEffect(() => {
    window.addEventListener("resize", updateProjectScrollState);
    return () => window.removeEventListener("resize", updateProjectScrollState);
  }, []);

  function scrollProjectBar(direction: "left" | "right") {
    const element = projectBarRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction === "left" ? -340 : 340,
      behavior: "smooth"
    });
    window.setTimeout(updateProjectScrollState, 260);
  }

  const selectedAgentLabel = agentFilter === "all"
    ? "全部 Agent"
    : agents.find((agent) => agent.id === agentFilter)?.label ?? "全部 Agent";
  const isProjectWorkspace = workspace === "project";
  const tabSummary = isProjectWorkspace
    ? selectedProjectFolder
      ? `管理 ${projectName(selectedProjectFolder)} 内生效的 Agent Skills，已发现 ${sourceSkills.length} 个。`
      : "关联一个项目工作区后，可以管理该项目内各 Agent 生效的 Skills。"
    : `管理这台机器上各 Agent 的全局 Skills，已发现 ${sourceSkills.length} 个。`;
  const hasProjectWorkspaces = projectFolders.length > 0;
  const isProjectNoWorkspace = isProjectWorkspace && !hasProjectWorkspaces;
  const isFiltered = Boolean(query.trim()) || agentFilter !== "all";
  const emptyTitle = isFiltered
    ? "没有找到匹配的 Skills"
    : isProjectWorkspace
      ? hasProjectWorkspaces
        ? "这个项目还没有项目级 Skills"
        : "尚未关联项目工作区"
      : "还没有全局 Skills";
  const emptyBody = isFiltered
    ? "换个关键词试试"
    : isProjectWorkspace
      ? hasProjectWorkspaces
        ? "可以从中心库同步到当前项目，或创建某个 Agent 的项目 skills 目录。"
        : "选择一个项目根目录后，Manage My skills 会自动检测该项目下各 Agent 的项目级 Skills。"
      : "重新扫描或从中心库同步到某个 Agent 后，这里会显示机器级生效的 Skills。";
  const selectedSkills = selectedSkillsInOrder(selectedSkillIds, allSkills);
  const selectedCount = selectedSkills.length;
  const recentSelectedSkills = selectedSkills.slice(-2);
  const extraSelectedCount = Math.max(0, selectedCount - recentSelectedSkills.length);

  return (
    <div className="skills-page">
      <section className="skills-workbench">
        <div className="skills-toolbar">
          <div className="scope-tabs workspace-tabs" role="tablist" aria-label="Skills 工作区">
            {(["global", "project"] as SkillWorkspace[]).map((scope) => (
              <button
                className={workspace === scope ? "active" : ""}
                key={scope}
                onClick={() => onWorkspace(scope)}
                role="tab"
                type="button"
                aria-selected={workspace === scope}
              >
                {scope === "global" ? "全局工作区" : "项目工作区"}
              </button>
            ))}
          </div>

          <div className="skills-toolbar-actions">
            {searchOpen && (
              <div className="searchbox compact">
                <Search size={16} />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => onQuery(event.target.value)}
                  placeholder="搜索 Skill、简介或 Agent"
                />
                {query && (
                  <button
                    className="clear-search-button"
                    onClick={() => onQuery("")}
                    title="清空"
                    type="button"
                  >
                    <XCircle size={14} />
                  </button>
                )}
              </div>
            )}
            <button
              className={`icon-button plain ${searchOpen ? "active" : ""}`}
              onClick={() => {
                setAgentMenuOpen(false);
                setSearchOpen((open) => !open);
              }}
              title="搜索"
              type="button"
            >
              <Search size={18} />
            </button>
            {nameMismatchedInstallations.length > 0 && (
              <button
                className="secondary-button compact"
                disabled={fixingAll}
                onClick={handleFixAllNames}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderColor: "rgba(206, 132, 39, 0.4)",
                  background: "rgba(206, 132, 39, 0.08)",
                  color: "#8a4b00",
                  height: "28px"
                }}
                title="一键将物理文件夹名称修正为 Frontmatter 中声明的真实名称"
                type="button"
              >
                {fixingAll ? (
                  <>
                    <RefreshCw className="spin" size={13} style={{ marginRight: '6px' }} />
                    正在修复...
                  </>
                ) : (
                  `一键修复名称冲突 (${nameMismatchedInstallations.length})`
                )}
              </button>
            )}
            {availableUpdatesCount > 0 && (
              <button
                className="secondary-button compact"
                disabled={refreshing || checkingUpdates || Array.from(updatingSkillIds).length > 0}
                onClick={onUpdateAllAvailable}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderColor: "rgba(249, 115, 22, 0.4)",
                  background: "rgba(249, 115, 22, 0.08)",
                  color: "#ea580c",
                  height: "28px"
                }}
                title="一键更新所有检测到有新版本的技能"
                type="button"
              >
                {Array.from(updatingSkillIds).length > 0 ? (
                  <>
                    <RefreshCw className="spin" size={13} style={{ marginRight: '6px' }} />
                    正在更新...
                  </>
                ) : (
                  <>
                    <ArrowUpCircle size={13} style={{ marginRight: '6px' }} />
                    一键更新可用 ({availableUpdatesCount})
                  </>
                )}
              </button>
            )}
            <button
              className="icon-button plain"
              disabled={checkingUpdates || refreshing}
              onClick={onCheckUpdates}
              title="检查 Skill 更新"
              type="button"
            >
              <ArrowUpCircle className={checkingUpdates ? "spin" : ""} size={17} />
            </button>
            <button className="icon-button plain" disabled={refreshing || checkingUpdates} onClick={() => onRefresh()} title="重新扫描" type="button">
              <RefreshCw className={refreshing ? "spin" : ""} size={17} />
            </button>
            <button
              className="icon-button plain"
              style={{ position: 'relative' }}
              onClick={() => setTrashOpen(true)}
              title="回收站"
              type="button"
            >
              <Trash2 size={17} />
              {trashItems.length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  background: '#dc2626',
                  color: 'white',
                  borderRadius: '50%',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  minWidth: '14px',
                  height: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 2px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                }}>
                  {trashItems.length}
                </span>
              )}
            </button>
            {onOpenSettings && (
              <button
                className="icon-button plain"
                onClick={onOpenSettings}
                title="设置"
                type="button"
              >
                <Settings size={17} />
              </button>
            )}

            {trashOpen && (
              <div className="trash-modal-overlay" onClick={() => setTrashOpen(false)}>
                <div className="trash-modal-card" onClick={(e) => e.stopPropagation()}>
                  <div className="trash-modal-header">
                    <div>
                      <h2>回收站</h2>
                      <p>被删除的 Skill 将会在这里暂存 30 天，超时后将彻底物理删除</p>
                    </div>
                    <button className="trash-close-x" onClick={() => setTrashOpen(false)} type="button">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="trash-modal-body">
                    {loadingTrash ? (
                      <div className="trash-empty-state">
                        <RefreshCw className="spin" size={24} style={{ color: "rgba(23, 25, 28, 0.44)" }} />
                        <p style={{ marginTop: "12px" }}>正在加载回收站...</p>
                      </div>
                    ) : trashItems.length === 0 ? (
                      <div className="trash-empty-state">
                        <Trash2 size={32} style={{ color: "rgba(23, 25, 28, 0.3)" }} />
                        <p>回收站是空的</p>
                      </div>
                    ) : (
                      <div className="trash-list">
                        {trashItems.map((item) => (
                          <div className="trash-row" key={item.id}>
                            <div className="trash-item-info">
                              <span className="trash-item-title">{item.name}</span>
                              <span className="trash-item-path" title={item.original_path}>{item.original_path}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <span className="trash-item-expiry">剩余 {getRemainingDays(item.deleted_at)} 天</span>
                              <div className="trash-item-actions">
                                <button
                                  className="trash-row-btn restore"
                                  onClick={() => handleRestoreSkill(item.id)}
                                  title="恢复此 Skill"
                                  type="button"
                                >
                                  <Undo size={14} />
                                </button>
                                <button
                                  className="trash-row-btn delete"
                                  onClick={() => handleDeleteTrashItemPermanently(item.id, item.name)}
                                  title="彻底删除"
                                  type="button"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="trash-modal-footer">
                    {trashItems.length > 0 ? (
                      <button
                        className="secondary-button"
                        onClick={handleEmptyTrash}
                        style={{
                          borderColor: "rgba(220, 38, 38, 0.4)",
                          background: "rgba(220, 38, 38, 0.04)",
                          color: "#dc2626",
                          height: "32px",
                          fontSize: "12px"
                        }}
                        type="button"
                      >
                        清空回收站
                      </button>
                    ) : <div />}
                    <button
                      className="primary-button"
                      onClick={() => setTrashOpen(false)}
                      style={{ height: "32px", fontSize: "12px" }}
                      type="button"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="agent-menu-wrap" ref={agentMenuRef}>
              <button
                className={`agent-menu-trigger ${agentMenuOpen ? "open" : ""}`}
                onClick={() => {
                  setSearchOpen(false);
                  setAgentMenuOpen((open) => !open);
                }}
                type="button"
              >
                <span>{selectedAgentLabel}</span>
                <ChevronDown size={14} />
              </button>
              {agentMenuOpen && (
                <div className="agent-menu" role="menu">
                  <button
                    className={agentFilter === "all" ? "active" : ""}
                    onClick={() => {
                      onAgentFilter("all");
                      setAgentMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span className="check-col">{agentFilter === "all" && <Check size={13} />}</span>
                    <span className="menu-label">全部 Agent</span>
                    <strong>{sourceSkills.length}</strong>
                  </button>
                  {agents.map((agent) => (
                    <button
                      className={agentFilter === agent.id ? "active" : ""}
                      key={agent.id}
                      onClick={() => {
                        onAgentFilter(agent.id);
                        setAgentMenuOpen(false);
                      }}
                      type="button"
                    >
                      <span className="check-col">{agentFilter === agent.id && <Check size={13} />}</span>
                      <span className="menu-label">{agent.label}</span>
                      <strong>{agentSkillCount(agent.id, sourceSkills)}</strong>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {!isProjectNoWorkspace && (
          <div className="skills-summary">
            <span className="skills-summary-text">{tabSummary}</span>
            {isProjectWorkspace && (
              <div className="button-pair compact">
                <button className="secondary-button" onClick={onAddProject} type="button">
                  <FolderPlus size={16} />
                  关联项目
                </button>
                <button className="secondary-button" onClick={onDiscoverProjects} type="button">
                  <Search size={16} />
                  扫描发现
                </button>
              </div>
            )}
          </div>
        )}

        {isProjectWorkspace && (discovering || discoveryBasePath || discoveredProjects.length > 0) && (
          <section className="discovery-panel">
            <div className="discovery-heading">
              <span>
                <strong>扫描发现</strong>
                {discoveryBasePath && <small>{discoveryBasePath}</small>}
              </span>
              <button className="icon-button plain" onClick={onCloseDiscovery} title="关闭扫描发现" type="button">
                <XCircle size={18} />
              </button>
            </div>
            <div className="discovery-list">
              {discoveredProjects.map((candidate) => (
                <article className="discovery-card" key={candidate.path}>
                  <span>
                    <strong>{candidate.name}</strong>
                    <code>{candidate.path}</code>
                  </span>
                  <div className="discovery-agents">
                    {candidate.agentRoots.map((root) => (
                      <AgentBadge label={`${root.agentLabel} · ${root.skillCount}`} status="linked" key={`${candidate.path}-${root.agentId}`} />
                    ))}
                  </div>
                  <button
                    className="secondary-button"
                    disabled={candidate.alreadyLinked}
                    onClick={() => onLinkDiscoveredProject(candidate.path)}
                    type="button"
                  >
                    <Check size={16} />
                    {candidate.alreadyLinked ? "已关联" : "关联"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {isProjectWorkspace && hasProjectWorkspaces && (
          <div className="project-workspace-shell">
            {projectScrollState.left && (
              <button
                className="project-scroll-button left"
                onClick={() => scrollProjectBar("left")}
                title="向左滑动"
                type="button"
              >
                <ChevronLeft size={17} />
              </button>
            )}
            <div
              className="project-workspace-bar"
              aria-label="已关联项目工作区"
              onScroll={updateProjectScrollState}
              ref={projectBarRef}
            >
              {projectFolders.map((folder) => {
                const stats = projectStats(folder, allSkills);
                const active = selectedProjectFolder === folder;
                return (
                  <button
                    className={`project-chip ${active ? "active" : ""}`}
                    key={folder}
                    onClick={() => onSelectProject(folder)}
                    type="button"
                  >
                    <span>
                      <strong>{projectName(folder)}</strong>
                      <small>{folder}</small>
                    </span>
                    <em>{stats.skillCount} Skills</em>
                    <XCircle
                      size={15}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveProject(folder);
                      }}
                    />
                  </button>
                );
              })}
            </div>
            {projectScrollState.right && (
              <button
                className="project-scroll-button right"
                onClick={() => scrollProjectBar("right")}
                title="向右滑动"
                type="button"
              >
                <ChevronRight size={17} />
              </button>
            )}
          </div>
        )}

        {!isProjectNoWorkspace && (
          <div className="skill-list-board">
            <div className="skill-table-head">
              <span />
              <span>Skill</span>
              <span>Agent 覆盖</span>
              <span>状态</span>
            </div>

            <div className="skill-list">
              {mergedSkills.map((skill: SkillRecord) => {
                const expanded = selectedSkill?.slug === skill.slug;
                return (
                  <Fragment key={skill.id}>
                    <SkillRow
                      skill={skill}
                      agents={agents}
                      skillLocks={skillLocks}
                      active={expanded}
                      checked={selectedSkillIds.has(skill.id)}
                      updateCheck={skillUpdateChecks[skill.id]}
                      updating={updatingSkillIds.has(skill.id)}
                      toggleBusy={toggleBusy}
                      onToggleSync={(event, agentId, active) => handleAgentToggle(event, skill, agentId, active)}
                      onSelect={() => onSelectSkill(expanded ? null : skill.id)}
                      onToggle={() => onToggleSkill(skill.id)}
                      onUpdate={() => onUpdateSkill(skill)}
                      onDeleteSkill={performDeleteSkill}
                    />
                    {expanded && (
                      <SkillDetail
                        skill={skill}
                        settings={settings}
                        skillLocks={skillLocks}
                        updateCheck={skillUpdateChecks[skill.id]}
                        updating={updatingSkillIds.has(skill.id)}
                        onUpdate={() => onUpdateSkill(skill)}
                        onResolveIssue={async (issue) => {
                          if (issue.code === "name-mismatch") {
                            await handleFixFolderName(issue.path || "", skill);
                          } else if (issue.code === "missing-skill-md") {
                            await handleCreateSkillMd(issue.path || "", skill);
                          }
                        }}
                        onSelectSkill={onSelectSkill}
                        onDeleteSkill={performDeleteSkill}
                      />
                    )}
                  </Fragment>
                );
              })}
              {mergedSkills.length === 0 && (
                <SkillsListEmptyState
                  title={emptyTitle}
                  body={emptyBody}
                  workspace={workspace}
                  isFiltered={isFiltered}
                  onClearFilters={() => {
                    onQuery("");
                    onAgentFilter("all");
                  }}
                />
              )}
            </div>
          </div>
        )}

        {isProjectNoWorkspace && !(discovering || discoveryBasePath || discoveredProjects.length > 0) && (
          <ProjectWorkspaceEmptyState onAddProject={onAddProject} onDiscoverProjects={onDiscoverProjects} />
        )}
      </section>

      {selectedCount > 0 && (
        <div className="selection-action-bar" role="region" aria-label="已选 Skills 操作">
          <div className="selection-summary">
            <div className="selection-names">
              {recentSelectedSkills.map((skill) => (
                <span className="selection-name-chip" key={skill.id} title={skill.displayName}>
                  {skill.displayName}
                </span>
              ))}
              {extraSelectedCount > 0 && <span className="selection-extra">+{extraSelectedCount}</span>}
            </div>
            <button className="selection-clear" onClick={onClearSelection} type="button">
              取消全选
            </button>
          </div>
          <div className="selection-actions">
            <button className="secondary-button large" onClick={onAdoptSelected} type="button">
              导入中心库 {selectedCount} 个
            </button>
            <button className="primary-button large" onClick={onQuickSyncSelected} type="button">
              快速同步 {selectedCount} 个
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SkillsListEmptyState({
  title,
  body,
  workspace,
  isFiltered,
  onClearFilters
}: {
  title: string;
  body: string;
  workspace: SkillWorkspace;
  isFiltered: boolean;
  onClearFilters: () => void;
}) {
  return (
    <section className="agent-empty-state" aria-label="Skills 列表空状态">
      {isFiltered || workspace === "project" ? <ProjectEmptyVisual /> : <AgentEmptyVisual />}
      <div className="agent-empty-copy">
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
      {isFiltered && (
        <button className="secondary-button" onClick={onClearFilters} type="button">
          清空搜索条件
        </button>
      )}
    </section>
  );
}

function ProjectWorkspaceEmptyState({
  onAddProject,
  onDiscoverProjects
}: {
  onAddProject: () => void;
  onDiscoverProjects: () => void;
}) {
  return (
    <section className="project-empty-state" aria-label="项目工作区空状态">
      <ProjectEmptyVisual />

      <div className="agent-empty-copy project-empty-copy">
        <strong>尚未关联项目工作区</strong>
        <span>关联项目根目录后，这里会显示该项目内各 Agent 生效的 Skills。</span>
      </div>

      <div className="empty-actions project-empty-actions">
        <button
          className="agent-empty-button"
          onClick={onAddProject}
          title="手动选择一个包含 Skills 的项目目录"
          type="button"
        >
          <span>关联项目</span>
        </button>
        <button
          className="secondary-button"
          onClick={onDiscoverProjects}
          title="从上级目录自动查找一个或多个包含 Skills 的项目"
          type="button"
        >
          扫描发现
        </button>
      </div>
    </section>
  );
}

function selectedSkillsInOrder(selectedSkillIds: Set<string>, skills: SkillRecord[]) {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  return [...selectedSkillIds].map((id) => byId.get(id)).filter((skill): skill is SkillRecord => Boolean(skill));
}

function InteractiveAgentIcon({
  agent,
  active,
  loading,
  onClick
}: {
  agent: AgentRecord;
  active: boolean;
  loading: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const icon = agentIconAsset(agent.id);
  const fallback = agent.label.slice(0, 2).toUpperCase();
  const iconStyle = icon?.size ? ({ "--agent-icon-size": `${icon.size}px` } as React.CSSProperties) : undefined;

  return (
    <button
      className={`agent-icon clickable ${active ? "active" : "inactive"} ${loading ? "loading-pulsate" : ""}`}
      onClick={(e) => {
        if (loading) {
          e.stopPropagation();
          return;
        }
        onClick(e);
      }}
      style={{
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.5 : active ? 1 : 0.22,
        filter: loading ? "none" : active ? "none" : "grayscale(100%)",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        border: "none",
        background: "none",
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transform: loading ? "scale(0.9)" : "none"
      }}
      title={loading ? "处理中..." : active ? `从 ${agent.label} 解除同步` : `同步到 ${agent.label}`}
      type="button"
    >
      {icon ? (
        <img alt="" aria-hidden="true" src={icon.src} style={iconStyle} />
      ) : (
        <em>{fallback}</em>
      )}
    </button>
  );
}

function SkillAgentStack({
  skill,
  agents,
  toggleBusy,
  onToggleSync
}: {
  skill: SkillRecord;
  agents: AgentRecord[];
  toggleBusy: string | null;
  onToggleSync: (event: React.MouseEvent, agentId: string, active: boolean) => void;
}) {
  const installedAgents = agents.filter((a) => a.enabled);
  const displayAgents = installedAgents.slice(0, 6);

  return (
    <div className="skill-agent-stack" aria-label="已安装 Agent" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      {displayAgents.map((agent) => {
        const active = skill.installations.some((inst) => inst.agentId === agent.id);
        const isCurrentlyBusy = toggleBusy === `${skill.slug}-${agent.id}`;
        return (
          <InteractiveAgentIcon
            agent={agent}
            active={active}
            loading={isCurrentlyBusy}
            key={agent.id}
            onClick={(event) => onToggleSync(event, agent.id, !active)}
          />
        );
      })}
      {installedAgents.length === 0 && <span className="muted">未安装</span>}
    </div>
  );
}

function SkillRow({
  skill,
  agents,
  skillLocks,
  active,
  checked,
  updateCheck,
  updating,
  toggleBusy,
  onToggleSync,
  onSelect,
  onToggle,
  onUpdate,
  onDeleteSkill
}: {
  skill: SkillRecord;
  agents: AgentRecord[];
  skillLocks: Record<string, SkillLockEntry>;
  active: boolean;
  checked: boolean;
  updateCheck?: SkillUpdateCheck;
  updating: boolean;
  toggleBusy: string | null;
  onToggleSync: (event: React.MouseEvent, agentId: string, active: boolean) => void;
  onSelect: () => void;
  onToggle: () => void;
  onUpdate: () => void;
  onDeleteSkill: (localPath: string, displayName: string, associatedPaths: string[], beforeDelete: () => void) => Promise<void>;
}) {
  return (
    <article className={`skill-row ${active ? "active" : ""}`} onClick={onSelect}>
      <label
        className={`select-checkbox ${checked ? "checked" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
        }}
        title="选择同步"
      >
        <input
          aria-label={`选择同步 ${skill.displayName}`}
          checked={checked}
          onChange={onToggle}
          type="checkbox"
        />
        <span>{checked && <Check size={14} />}</span>
      </label>
      <button className="skill-row-main" onClick={onSelect} type="button">
        <strong>
          <span className="skill-name-text">{skill.displayName}</span>
          <SourceOwnerTag skill={skill} skillLocks={skillLocks} />
          {active ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </strong>
        <span className="skill-row-description">{skill.description || skill.slug}</span>
      </button>
      <SkillAgentStack
        skill={skill}
        agents={agents}
        toggleBusy={toggleBusy}
        onToggleSync={onToggleSync}
      />
      <SkillStatusCell
        skill={skill}
        skillLocks={skillLocks}
        updateCheck={updateCheck}
        updating={updating}
        onUpdate={onUpdate}
      />
      <button
        className="skill-row-delete-btn"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onClick={async (event) => {
          event.stopPropagation();
          event.preventDefault();
          const localPath = skill.canonicalPath ?? firstValidInstallation(skill)?.entryPath;
          if (!localPath) {
            alert("找不到该技能的本地路径，无法删除。");
            return;
          }
          const associatedPaths = skill.installations
            .map(inst => inst.entryPath)
            .filter(p => p !== localPath);
          await onDeleteSkill(localPath, skill.displayName || skill.slug, associatedPaths, onSelect);
        }}
        title="移入回收站"
        type="button"
      >
        <Trash2 size={15} />
      </button>
    </article>
  );
}

function SkillStatusCell({
  skill,
  skillLocks,
  updateCheck,
  updating,
  onUpdate
}: {
  skill: SkillRecord;
  skillLocks: Record<string, SkillLockEntry>;
  updateCheck?: SkillUpdateCheck;
  updating: boolean;
  onUpdate: () => void;
}) {
  const status = skillListStatus(skill, skillLocks, updateCheck);
  const title = updateCheck?.message ?? status.title;

  if (status.kind === "update") {
    return (
      <button
        className={`skill-status-badge ${status.kind}`}
        disabled={updating}
        onClick={(event) => {
          event.stopPropagation();
          onUpdate();
        }}
        title={title}
        type="button"
      >
        {updating ? "更新中" : status.label}
      </button>
    );
  }

  return (
    <span className={`skill-status-badge ${status.kind}`} title={title}>
      {status.label}
    </span>
  );
}

function SourceOwnerTag({ skill, skillLocks }: { skill: SkillRecord; skillLocks: Record<string, SkillLockEntry> }) {
  const source = skillSourceSummary(skill, skillLocks);
  if (!source.owner) return null;
  return <em title={source.detail}>{source.owner}</em>;
}

function SkillDetail({
  skill,
  settings,
  skillLocks,
  updateCheck,
  updating,
  onUpdate,
  onResolveIssue,
  onSelectSkill,
  onDeleteSkill
}: {
  skill: SkillRecord;
  settings: AppSettings;
  skillLocks: Record<string, SkillLockEntry>;
  updateCheck?: SkillUpdateCheck;
  updating: boolean;
  onUpdate: () => void;
  onResolveIssue: (issue: any) => void;
  onSelectSkill: (id: string | null) => void;
  onDeleteSkill: (localPath: string, displayName: string, associatedPaths: string[], beforeDelete: () => void) => Promise<void>;
}) {
  const source = skillSourceSummary(skill, skillLocks);
  const sourceInstallation = firstValidInstallation(skill);
  const localPath = skill.canonicalPath ?? sourceInstallation?.entryPath ?? "";
  const updateSource = skillsShUpdateSource(skill, skillLocks);

  return (
    <div className="skill-detail">
      {localPath && (
        <DetailField label="本地路径">
          <code title={localPath}>{settings.showRawPaths ? localPath : compactPath(localPath)}</code>
          <button
            className="meta-icon-button"
            onClick={(event) => {
              event.stopPropagation();
              void openPath(localPath);
            }}
            title="打开本地路径"
            type="button"
          >
            <FolderOpen size={15} />
          </button>
        </DetailField>
      )}

      <DetailField label="描述">
        <p>{skill.description || skill.slug}</p>
      </DetailField>

      {source.githubUrl && (
        <DetailField label="来源">
          <code title={source.githubUrl}>{source.detail}</code>
          <button
            className="meta-icon-button"
            onClick={(event) => {
              event.stopPropagation();
              void openUrl(source.githubUrl);
            }}
            title="打开 GitHub 仓库"
            type="button"
          >
            <Github size={15} />
          </button>
        </DetailField>
      )}

      {updateSource && (
        <DetailField label="更新状态">
          {updateCheck?.status === "checking" ? (
            <span className="skill-update-status checking" style={{ color: "#2563eb", display: "inline-flex", alignItems: "center" }}>
              <RefreshCw className="spin" size={13} style={{ marginRight: '6px' }} />
              正在检查更新...
            </span>
          ) : updateCheck?.status === "available" ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="skill-update-status available" style={{ color: "#d97706", fontWeight: "bold" }}>
                有新版本可用
              </span>
              <button
                className="secondary-button compact"
                disabled={updating}
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdate();
                }}
                style={{
                  height: "22px",
                  padding: "0 8px",
                  fontSize: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  borderColor: "rgba(217, 119, 6, 0.4)",
                  background: "rgba(217, 119, 6, 0.08)",
                  color: "#b45309"
                }}
                type="button"
              >
                {updating ? "更新中..." : "立即更新"}
              </button>
            </div>
          ) : updateCheck?.status === "current" ? (
            <span className="skill-update-status current" style={{ color: "#16a34a" }}>
              已是最新
            </span>
          ) : updateCheck?.status === "check-failed" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "100%" }}>
              <span className="skill-update-status failed" style={{ color: "#dc2626", fontWeight: "bold" }}>
                检查失败
              </span>
              <div style={{
                fontSize: "12px",
                color: "#dc2626",
                wordBreak: "break-all",
                background: "rgba(220, 38, 38, 0.04)",
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px dashed rgba(220, 38, 38, 0.15)",
                lineHeight: "1.4"
              }}>
                原因: {updateCheck.message || "未知错误"}
              </div>
            </div>
          ) : (
            <span className="skill-update-status unknown" style={{ color: "#6b7280" }}>
              未检查 (可点击右上角检查更新)
            </span>
          )}
        </DetailField>
      )}

      {skill.issues.length > 0 && (
        <DetailField label="问题">
          <IssueList issues={skill.issues} onResolve={onResolveIssue} />
        </DetailField>
      )}

      {localPath && (
        <div style={{ marginTop: "16px", borderTop: "1px solid rgba(24, 26, 29, 0.08)", paddingTop: "12px", display: "flex", justifyContent: "flex-end" }}>
          <button
            className="secondary-button"
            onClick={async (event) => {
              event.stopPropagation();
              const associatedPaths = skill.installations
                .map(inst => inst.entryPath)
                .filter(p => p !== localPath);
              await onDeleteSkill(localPath, skill.displayName || skill.slug, associatedPaths, () => onSelectSkill(null));
            }}
            style={{
              borderColor: "rgba(220, 38, 38, 0.4)",
              background: "rgba(220, 38, 38, 0.04)",
              color: "#dc2626",
              height: "28px",
              fontSize: "12px",
              padding: "0 10px",
              display: "inline-flex",
              alignItems: "center",
              cursor: "pointer"
            }}
            type="button"
          >
            <Trash2 size={13} style={{ marginRight: "6px" }} />
            删除此 Skill
          </button>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

async function openPath(path: string) {
  if (!isTauriRuntime()) return;
  await invoke("open_path", { path });
}

async function openUrl(url: string | null) {
  if (!url || !isTauriRuntime()) return;
  await invoke("open_url", { url });
}
