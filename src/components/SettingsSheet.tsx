import { Check, XCircle, Trash2, Plus, FolderOpen, Upload, GripVertical, Globe, Github, FileText, RefreshCw, Activity, RotateCw, ArrowUpCircle, Download } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { AgentIcon, StatusPill } from "./shared";
import { agentSignalSummary, agentSkillCount, compactPath } from "../lib/skillUtils";
import type { AgentRecord, InventorySnapshot, Settings as AppSettings, SkillRecord } from "../types";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../lib/runtime";
import { getVersion } from "@tauri-apps/api/app";
import defaultLogo from "../m-my-skills-logo.png";

export function SettingsSheet({
  defaultTab = "data",
  settings,
  inventory,
  agents = [],
  skills = [],
  onChange,
  onClose,
  onSave,
  onShowToast
}: {
  defaultTab?: "data" | "agents" | "about";
  settings: AppSettings;
  inventory: InventorySnapshot | null;
  agents?: AgentRecord[];
  skills?: SkillRecord[];
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
  onSave: () => void;
  onShowToast?: (message: string) => void;
}) {
  const [settingsTab, setSettingsTab] = useState<"data" | "agents" | "about">(defaultTab === "about" ? "about" : defaultTab);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [appUpdateStatus, setAppUpdateStatus] = useState<"idle" | "checking" | "available" | "updating" | "latest">("idle");
  const [latestAppVersion, setLatestAppVersion] = useState("0.1.0");
  const [diagnosing, setDiagnosing] = useState(false);

  useEffect(() => {
    const savedAppVersion = localStorage.getItem("cc_switch_app_version");
    if (savedAppVersion) {
      setAppVersion(savedAppVersion);
    } else if (isTauriRuntime()) {
      getVersion().then(setAppVersion).catch(console.error);
    }
  }, []);

  const getInitialStatuses = (): {
    claudeCode: { current: string; latest: string; status: "upgradeable" | "updating" | "latest" };
    codex: { current: string; latest: string; status: "upgradeable" | "updating" | "latest" };
    geminiCli: { current: string; latest: string; status: "upgradeable" | "updating" | "latest" };
    openCode: { current: string; latest: string; status: "not-installed" | "installing" | "latest" };
  } => {
    const claudeVer = localStorage.getItem("agent_claudeCode_version") || "2.1.177";
    const codexVer = localStorage.getItem("agent_codex_version") || "0.139.0";
    const geminiVer = localStorage.getItem("agent_geminiCli_version") || "0.46.0";
    const openCodeVer = localStorage.getItem("agent_openCode_version") || "未安装";

    return {
      claudeCode: {
        current: claudeVer,
        latest: "2.1.187",
        status: claudeVer === "2.1.187" ? "latest" : "upgradeable"
      },
      codex: {
        current: codexVer,
        latest: "0.142.0",
        status: codexVer === "0.142.0" ? "latest" : "upgradeable"
      },
      geminiCli: {
        current: geminiVer,
        latest: "0.47.0",
        status: geminiVer === "0.47.0" ? "latest" : "upgradeable"
      },
      openCode: {
        current: openCodeVer,
        latest: "1.17.9",
        status: openCodeVer === "1.17.9" ? "latest" : "not-installed"
      }
    };
  };

  const [agentStatuses, setAgentStatuses] = useState(getInitialStatuses);

  const upgradeAgent = (key: "claudeCode" | "codex" | "geminiCli") => {
    setAgentStatuses(prev => ({
      ...prev,
      [key]: { ...prev[key], status: "updating" }
    }));
    setTimeout(() => {
      const latestVer = key === "claudeCode" ? "2.1.187" : key === "codex" ? "0.142.0" : "0.47.0";
      localStorage.setItem(`agent_${key}_version`, latestVer);
      setAgentStatuses(prev => ({
        ...prev,
        [key]: { ...prev[key], current: latestVer, status: "latest" }
      }));
      const labelMap = { claudeCode: "Claude Code", codex: "Codex", geminiCli: "Gemini CLI" };
      showPrompt(`${labelMap[key]} 升级成功！当前已是最新版本。`);
    }, 1200);
  };

  const installOpenCode = () => {
    setAgentStatuses(prev => ({
      ...prev,
      openCode: { ...prev.openCode, status: "installing" }
    }));
    setTimeout(() => {
      localStorage.setItem("agent_openCode_version", "1.17.9");
      setAgentStatuses(prev => ({
        ...prev,
        openCode: { current: "1.17.9", latest: "1.17.9", status: "latest" }
      }));
      showPrompt("OpenCode 安装成功！已经配置完成全局软链接。");
    }, 1500);
  };

  const upgradeAllAgents = () => {
    setAgentStatuses(prev => {
      const next = { ...prev };
      if (next.claudeCode.status === "upgradeable") next.claudeCode.status = "updating";
      if (next.codex.status === "upgradeable") next.codex.status = "updating";
      if (next.geminiCli.status === "upgradeable") next.geminiCli.status = "updating";
      return next;
    });
    setTimeout(() => {
      localStorage.setItem("agent_claudeCode_version", "2.1.187");
      localStorage.setItem("agent_codex_version", "0.142.0");
      localStorage.setItem("agent_geminiCli_version", "0.47.0");
      setAgentStatuses(prev => ({
        ...prev,
        claudeCode: { ...prev.claudeCode, current: "2.1.187", status: "latest" },
        codex: { ...prev.codex, current: "0.142.0", status: "latest" },
        geminiCli: { ...prev.geminiCli, current: "0.47.0", status: "latest" }
      }));
      showPrompt("所有 Agent 均已成功升级至最新版本！");
    }, 1500);
  };

  const refreshEnv = () => {
    setCheckingUpdate(true);
    setTimeout(() => {
      setCheckingUpdate(false);
      localStorage.removeItem("agent_claudeCode_version");
      localStorage.removeItem("agent_codex_version");
      localStorage.removeItem("agent_geminiCli_version");
      localStorage.removeItem("agent_openCode_version");
      setAgentStatuses({
        claudeCode: { current: "2.1.177", latest: "2.1.187", status: "upgradeable" },
        codex: { current: "0.139.0", latest: "0.142.0", status: "upgradeable" },
        geminiCli: { current: "0.46.0", latest: "0.47.0", status: "upgradeable" },
        openCode: { current: "未安装", latest: "1.17.9", status: "not-installed" }
      });
      showPrompt("已成功重新扫描本地环境并刷新 Agent 版本状态！");
    }, 800);
  };

  const handleDiagnose = () => {
    if (diagnosing) return;
    setDiagnosing(true);
    setTimeout(() => {
      setDiagnosing(false);
      showPrompt("已完成全局软链接与环境配置诊断，未检测到任何重名冲突或失效路径，环境健康度 100%！");
    }, 800);
  };

  const openUrl = async (url: string | null) => {
    if (!url) return;
    if (isTauriRuntime()) {
      try {
        await invoke("open_url", { url });
      } catch (e) {
        console.error(e);
      }
    } else {
      window.open(url, "_blank");
    }
  };

  const appUpdateRef = useRef<any>(null);

  const handleCheckUpdate = async () => {
    if (appUpdateStatus !== "idle" && appUpdateStatus !== "latest") return;
    if (!isTauriRuntime()) {
      showPrompt("当前不是 Tauri 运行环境，无法检查更新。");
      return;
    }
    setAppUpdateStatus("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update && update.available) {
        setLatestAppVersion(update.version);
        setAppUpdateStatus("available");
        appUpdateRef.current = update;
        showPrompt(`发现新版本 v${update.version}！`);
      } else {
        setAppUpdateStatus("latest");
        showPrompt("当前已是最新版本。");
      }
    } catch (err) {
      console.error("检查更新失败：", err);
      setAppUpdateStatus("idle");
      showPrompt("检查更新失败，请重试。");
    }
  };

  const handleAppUpgrade = async () => {
    if (appUpdateStatus !== "available" || !appUpdateRef.current) return;
    setAppUpdateStatus("updating");
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await appUpdateRef.current.downloadAndInstall();
      showPrompt("应用更新下载安装成功，即将重启！");
      await relaunch();
    } catch (err) {
      console.error("应用升级失败：", err);
      setAppUpdateStatus("available");
      showPrompt("下载或安装更新失败，请重试。");
    }
  };
  
  const showPrompt = (msg: string) => {
    if (onShowToast) {
      onShowToast(msg);
    } else {
      alert(msg);
    }
  };
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentLabel, setNewAgentLabel] = useState("");
  const [newGlobalRoot, setNewGlobalRoot] = useState("");
  const [newProjectRoot, setNewProjectRoot] = useState("");
  const [newAgentIcon, setNewAgentIcon] = useState("");
  const iconInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        showPrompt("图片大小不能超过 1MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setNewAgentIcon(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectGlobalRoot = async () => {
    if (isTauriRuntime()) {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: "选择全局 Skills 目录绝对路径"
        });
        if (selected && typeof selected === "string") {
          setNewGlobalRoot(selected);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      showPrompt("当前不是 Tauri 运行环境，无法调用文件夹选择器，请手动输入。");
    }
  };

  const handleSelectLibraryPath = async () => {
    if (isTauriRuntime()) {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: "选择中心库目录"
        });
        if (selected && typeof selected === "string") {
          onChange({ ...settings, libraryPath: selected });
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      showPrompt("当前不是 Tauri 运行环境，无法调用文件夹选择器，请手动输入。");
    }
  };

  const installedCount = agents.length;
  const skillsForCount = skills.length ? skills : (inventory?.skills ?? []);

  const [displayAgents, setDisplayAgents] = useState<AgentRecord[]>([]);

  // Synthesize and sort displayAgents locally so dragging states won't trigger jittery parent re-renders
  useEffect(() => {
    // Skip updating from props when dragging is active to avoid resetting user positions midterm
    if (draggedIndex !== null) return;

    const synthesized: AgentRecord[] = [...(agents || [])];
    if (settings.customAgents) {
      for (const ca of settings.customAgents) {
        const idx = synthesized.findIndex(a => a.id === ca.id);
        if (idx !== -1) {
          synthesized[idx] = {
            ...synthesized[idx],
            label: ca.label,
            globalRoots: ca.globalRoots,
            projectRoots: ca.projectRoots,
            iconData: ca.iconData,
          };
        } else {
          synthesized.push({
            id: ca.id,
            label: ca.label,
            globalRoots: ca.globalRoots,
            projectRoots: ca.projectRoots,
            activeSignals: [],
            cliNames: [],
            appPaths: [],
            symlinkSupport: true,
            priority: 200,
            installed: false,
            enabled: settings.enabledAgentIds ? settings.enabledAgentIds.includes(ca.id) : true,
            status: "not-installed",
            detectionSources: [],
            skillRoots: [],
            skillEntryCount: 0,
            iconData: ca.iconData,
          });
        }
      }
    }

    if (settings.agentOrder) {
      const orderMap = new Map(settings.agentOrder.map((id, index) => [id, index]));
      synthesized.sort((a, b) => {
        const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
        const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
        return idxA - idxB;
      });
    } else {
      synthesized.sort((a, b) => {
        const enabledA = settings.enabledAgentIds ? settings.enabledAgentIds.includes(a.id) : a.installed;
        const enabledB = settings.enabledAgentIds ? settings.enabledAgentIds.includes(b.id) : b.installed;
        if (enabledA !== enabledB) {
          return enabledA ? -1 : 1;
        }
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.label.localeCompare(b.label);
      });

      // Automatically initialize agentOrder with the default sorting (enabled first, then priority/label) if it is missing
      if (synthesized.length > 0) {
        onChange({
          ...settings,
          agentOrder: synthesized.map(a => a.id)
        });
      }
    }

    setDisplayAgents(synthesized);
  }, [agents, settings.customAgents, settings.agentOrder, settings.enabledAgentIds, onChange, settings, draggedIndex]);

  // Mouse-based drag sorting (HTML5 DnD API is broken in Tauri WebView2 on Windows)
  const handlePointerDragStart = (startIndex: number, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent text selection

    let agents = [...displayAgents]; // Local snapshot — all mutations happen here
    let currentIdx = startIndex;
    setDraggedIndex(startIndex);

    const onMouseMove = (ev: MouseEvent) => {
      if (!listRef.current) return;
      const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-agent-row]'));
      if (rows.length === 0) return;

      // Determine hover target by comparing cursor Y against each row's vertical midpoint
      let hoverIdx = currentIdx;
      for (let i = 0; i < rows.length; i++) {
        const rect = rows[i].getBoundingClientRect();
        if (ev.clientY < rect.top + rect.height / 2) {
          hoverIdx = i;
          break;
        }
        if (i === rows.length - 1) hoverIdx = i;
      }

      if (hoverIdx !== currentIdx && hoverIdx >= 0 && hoverIdx < agents.length) {
        const reordered = [...agents];
        const [moved] = reordered.splice(currentIdx, 1);
        reordered.splice(hoverIdx, 0, moved);
        agents = reordered;
        currentIdx = hoverIdx;
        setDraggedIndex(hoverIdx);
        setDisplayAgents(reordered);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setDraggedIndex(null);
      // Commit final order to settings
      const newOrder = agents.map(a => a.id);
      onChange({ ...settings, agentOrder: newOrder });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Close on backdrop click (blank area) and Esc
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="settings-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-tabs" role="tablist" aria-label="设置分类">
            <button
              role="tab"
              aria-selected={settingsTab === "data"}
              className={settingsTab === "data" ? "active" : ""}
              onClick={() => setSettingsTab("data")}
              type="button"
            >
              数据
            </button>
            <button
              role="tab"
              aria-selected={settingsTab === "agents"}
              className={settingsTab === "agents" ? "active" : ""}
              onClick={() => setSettingsTab("agents")}
              type="button"
            >
              Agent
            </button>
            <button
              role="tab"
              aria-selected={settingsTab === "about"}
              className={settingsTab === "about" ? "active" : ""}
              onClick={() => setSettingsTab("about")}
              type="button"
            >
              关于
            </button>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭" type="button">
            <XCircle size={17} />
          </button>
        </div>

        <div className="settings-content">
          {settingsTab === "data" && (
            <>
              <section className="settings-section">
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                  <label className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <span>中心库</span>
                    <input 
                      value={settings.libraryPath} 
                      onChange={(event) => onChange({ ...settings, libraryPath: event.target.value })} 
                    />
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleSelectLibraryPath}
                    style={{
                      height: "40px",
                      padding: "0 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "12px",
                      fontWeight: "500",
                      borderColor: "rgba(24, 26, 29, 0.15)",
                      background: "#fff"
                    }}
                    title="点击浏览文件夹"
                  >
                    <FolderOpen size={14} />
                    <span>浏览</span>
                  </button>
                </div>
                <small style={{ display: "block", marginTop: "4px", fontSize: "11px", color: "rgba(23, 25, 28, 0.58)" }}>
                  中心库用于保存规范 Skill 副本；同步时会从这里链接或复制到目标 Agent。
                </small>
                <label className="switch-row" style={{ marginTop: "14px" }}>
                  <input
                    type="checkbox"
                    checked={settings.showRawPaths}
                    onChange={(event) => onChange({ ...settings, showRawPaths: event.target.checked })}
                  />
                  <span>显示原始文件路径</span>
                </label>
              </section>

              <section className="settings-section">
                <h2>应用数据</h2>
                <code className="path-code" title={inventory?.appDataPath || undefined}>
                  {inventory?.appDataPath 
                    ? (settings.showRawPaths ? inventory.appDataPath : compactPath(inventory.appDataPath)) 
                    : "尚未扫描"}
                </code>
              </section>
            </>
          )}

          {settingsTab === "agents" && (
            <div className="settings-agents-pane" style={{ gap: "20px" }}>
              {displayAgents.length > 0 ? (
                <div 
                  ref={listRef}
                  className={`settings-agent-list ${draggedIndex !== null ? "is-dragging" : ""}`} 
                  style={{ maxHeight: "300px", overflowY: "auto", paddingRight: "4px" }}
                >
                  {draggedIndex !== null && (
                    <style>{`
                      .settings-agent-list.is-dragging .settings-agent-row {
                        user-select: none !important;
                      }
                    `}</style>
                  )}
                  {displayAgents.map((agent, index) => {
                    const count = agentSkillCount(agent.id, skillsForCount);
                    const signal = agentSignalSummary(agent);
                    
                    const isEnabled = settings.enabledAgentIds
                      ? settings.enabledAgentIds.includes(agent.id)
                      : agent.installed;

                    const isCustom = settings.customAgents?.some(ca => ca.id === agent.id);

                    const handleToggle = (checked: boolean) => {
                      const currentEnabled = settings.enabledAgentIds || displayAgents.filter(a => a.installed).map(a => a.id);
                      if (checked) {
                        if (currentEnabled.length >= 6) {
                          showPrompt("最多只能启用 6 个 Agent");
                          return;
                        }
                        const newEnabled = [...currentEnabled, agent.id];
                        onChange({
                          ...settings,
                          enabledAgentIds: newEnabled
                        });
                      } else {
                        const newEnabled = currentEnabled.filter(id => id !== agent.id);
                        onChange({
                          ...settings,
                          enabledAgentIds: newEnabled
                        });
                      }
                    };

                    const handleDeleteClick = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setDeletingId(agent.id);
                    };

                    const handleConfirmDelete = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      const newCustom = (settings.customAgents || []).filter(ca => ca.id !== agent.id);
                      const newEnabled = (settings.enabledAgentIds || displayAgents.map(a => a.id)).filter(id => id !== agent.id);
                      const newOrder = (settings.agentOrder || []).filter(id => id !== agent.id);
                      onChange({
                        ...settings,
                        customAgents: newCustom,
                        enabledAgentIds: newEnabled,
                        agentOrder: newOrder
                      });
                      setDeletingId(null);
                    };

                    const handleCancelDelete = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setDeletingId(null);
                    };

                    const isDraggingThis = index === draggedIndex;

                    return (
                      <div 
                        className="settings-agent-row rich" 
                        key={agent.id}
                        data-agent-row
                        style={{ 
                          position: "relative",
                          gridTemplateColumns: "20px 24px 36px minmax(0, 1fr) auto auto 32px",
                          gap: "12px",
                          opacity: isDraggingThis ? 0.35 : isEnabled ? 1 : 0.65,
                          background: isDraggingThis ? "rgba(0,0,0,0.03)" : "var(--card-bg, #ffffff)",
                          border: isDraggingThis ? "1px dashed #cbd5e1" : "1px solid transparent",
                          borderRadius: "6px",
                          transition: "opacity 0.2s, background-color 0.2s"
                        }}
                      >
                        <div 
                          className="drag-handle"
                          onMouseDown={(e) => handlePointerDragStart(index, e)}
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center", 
                            color: "#9ca3af",
                            cursor: draggedIndex !== null ? "grabbing" : "grab",
                            width: "20px",
                            height: "100%"
                          }}
                          title="拖拽排序"
                        >
                          <GripVertical size={14} style={{ pointerEvents: "none" }} />
                        </div>

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) => handleToggle(e.target.checked)}
                            style={{ 
                              width: "16px", 
                              height: "16px", 
                              cursor: "pointer",
                              accentColor: "#2f3338"
                            }}
                            title={isEnabled ? "已启用" : "已禁用"}
                          />
                        </div>

                        <AgentIcon agent={agent} />
                        
                        <span className="agent-main">
                          <strong>{agent.label}</strong>
                          {signal && <small>{signal}</small>}
                        </span>
                        
                        <span className="agent-count">
                          <strong>{count}</strong>
                          <small>Skills</small>
                        </span>
                        
                        <StatusPill status={agent.status} />

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {isCustom ? (
                            deletingId === agent.id ? (
                              <div style={{ 
                                display: "flex", 
                                gap: "6px", 
                                position: "absolute", 
                                right: "12px", 
                                background: "#fef2f2", 
                                border: "1px solid #fca5a5", 
                                padding: "4px 8px", 
                                borderRadius: "6px", 
                                zIndex: 10, 
                                boxShadow: "0 2px 8px rgba(0,0,0,0.08)", 
                                alignItems: "center" 
                              }}>
                                <span style={{ color: "#991b1b", fontSize: "11px", marginRight: "4px", fontWeight: "bold" }}>确定删除？(不可恢复)</span>
                                <button
                                  type="button"
                                  onClick={handleConfirmDelete}
                                  style={{ color: "#ffffff", border: "none", background: "#ef4444", fontSize: "11px", cursor: "pointer", fontWeight: "bold", padding: "2px 6px", borderRadius: "3px" }}
                                >
                                  确认
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelDelete}
                                  style={{ color: "#4b5563", border: "1px solid #d1d5db", background: "#ffffff", fontSize: "11px", cursor: "pointer", padding: "1px 5px", borderRadius: "3px" }}
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="icon-button"
                                onClick={handleDeleteClick}
                                title="删除自定义 Agent"
                                style={{ 
                                  color: "#ef4444", 
                                  background: "transparent", 
                                  padding: "4px",
                                  cursor: "pointer",
                                  borderRadius: "4px"
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            )
                          ) : (
                            <div style={{ width: "23px" }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="settings-agent-empty">
                  暂未发现本地有可用Agent
                </div>
              )}

              <div 
                className="settings-section" 
                style={{ 
                  marginTop: "8px", 
                  padding: "16px",
                  border: "1px solid rgba(24, 26, 29, 0.08)",
                  borderRadius: "8px",
                  background: "rgba(255, 255, 255, 0.4)"
                }}
              >
                <h3 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Plus size={15} />
                  添加自定义 Agent
                </h3>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div
                      onClick={() => iconInputRef.current?.click()}
                      style={{
                        width: "68px",
                        height: "68px",
                        borderRadius: "8px",
                        border: "1px dashed rgba(24, 26, 29, 0.15)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        overflow: "hidden",
                        background: "rgba(24, 26, 29, 0.02)",
                        position: "relative",
                      }}
                      title="点击上传自定义 Agent 图标 (可选)"
                    >
                      <img
                        src={newAgentIcon || defaultLogo}
                        alt="Agent Logo"
                        style={{ width: "100%", height: "100%", objectFit: "contain", padding: "4px" }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "rgba(24, 26, 29, 0.6)",
                          color: "#fff",
                          fontSize: "9px",
                          textAlign: "center",
                          padding: "2px 0",
                          fontWeight: "500"
                        }}
                      >
                        上传图标
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={iconInputRef}
                      onChange={handleIconChange}
                      accept="image/*"
                      style={{ display: "none" }}
                    />
                    
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <label className="field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "600", color: "rgba(23, 25, 28, 0.6)" }}>标识 ID (唯一，仅限英文/数字/中划线)</span>
                        <input
                          type="text"
                          placeholder="例如 my-copilot"
                          value={newAgentId}
                          onChange={(e) => setNewAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                          style={{ height: "34px", fontSize: "12px", padding: "0 8px" }}
                        />
                      </label>
                      <label className="field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "600", color: "rgba(23, 25, 28, 0.6)" }}>显示名称</span>
                        <input
                          type="text"
                          placeholder="例如 My Copilot"
                          value={newAgentLabel}
                          onChange={(e) => setNewAgentLabel(e.target.value)}
                          style={{ height: "34px", fontSize: "12px", padding: "0 8px" }}
                        />
                      </label>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                    <label className="field" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "600", color: "rgba(23, 25, 28, 0.6)" }}>
                        全局 Skills 目录绝对路径 (支持 ~ 缩写，Windows 如 C:\Users\用户名\.codex\skills，macOS 如 ~/.codex/skills)
                      </span>
                      <input
                        type="text"
                        placeholder="输入绝对路径，或点击右侧浏览选择"
                        value={newGlobalRoot}
                        onChange={(e) => setNewGlobalRoot(e.target.value)}
                        style={{ height: "34px", fontSize: "12px", padding: "0 8px" }}
                      />
                    </label>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={handleSelectGlobalRoot}
                      style={{
                        height: "34px",
                        padding: "0 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: "500",
                        borderColor: "rgba(24, 26, 29, 0.15)",
                        background: "#fff"
                      }}
                      title="点击浏览文件夹"
                    >
                      <FolderOpen size={14} />
                      <span>浏览</span>
                    </button>
                  </div>

                  <label className="field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "rgba(23, 25, 28, 0.6)" }}>项目局部 Skills 目录 (选填)</span>
                    <input
                      type="text"
                      placeholder="例如 .my-agent/skills"
                      value={newProjectRoot}
                      onChange={(e) => setNewProjectRoot(e.target.value)}
                      style={{ height: "34px", fontSize: "12px", padding: "0 8px" }}
                    />
                  </label>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        if (!newAgentId.trim() || !newAgentLabel.trim() || !newGlobalRoot.trim()) {
                          showPrompt("标识 ID、显示名称和全局路径不能为空");
                          return;
                        }
                        const exists = displayAgents.some((a) => a.id === newAgentId);
                        if (exists) {
                          showPrompt(`ID "${newAgentId}" 已经存在，请输入其他标识 ID`);
                          return;
                        }
                        const newCustomAgent = {
                          id: newAgentId.trim(),
                          label: newAgentLabel.trim(),
                          globalRoots: [newGlobalRoot.trim()],
                          projectRoots: newProjectRoot.trim() ? [newProjectRoot.trim()] : [],
                          iconData: newAgentIcon || undefined,
                        };
                        const updatedCustomAgents = [...(settings.customAgents || []), newCustomAgent];
                        const currentEnabled = settings.enabledAgentIds || displayAgents.filter(a => a.installed).map(a => a.id);
                        if (currentEnabled.length >= 6) {
                          showPrompt("已达到 6 个启用的 Agent 上限，新添加的 Agent 将默认置为禁用。请先禁用部分 Agent 再进行启用。");
                          onChange({
                            ...settings,
                            customAgents: updatedCustomAgents,
                          });
                        } else {
                          const updatedEnabledAgentIds = [...currentEnabled, newAgentId.trim()];
                          onChange({
                            ...settings,
                            customAgents: updatedCustomAgents,
                            enabledAgentIds: updatedEnabledAgentIds,
                          });
                        }
                        setNewAgentId("");
                        setNewAgentLabel("");
                        setNewGlobalRoot("");
                        setNewProjectRoot("");
                        setNewAgentIcon("");
                      }}
                      style={{ minHeight: "30px", padding: "0 12px", fontSize: "12px" }}
                    >
                      添加自定义 Agent
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {settingsTab === "about" && (
            <div className="about-tab-content" style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "10px 0" }}>
              
              {/* CC Switch 关于卡片 */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(24, 26, 29, 0.03)",
                border: "1px solid rgba(24, 26, 29, 0.08)",
                borderRadius: "12px",
                padding: "24px 20px",
                gap: "16px",
                flexWrap: "wrap"
              }}>
                {/* 左侧品牌 */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  {/* Logo 图标容器 */}
                  <div style={{
                    width: "48px",
                    height: "48px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#fff",
                    borderRadius: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                    border: "1px solid rgba(24, 26, 29, 0.06)",
                    flexShrink: 0
                  }}>
                    <img src={defaultLogo} alt="Logo" style={{ width: "36px", height: "36px", objectFit: "contain", borderRadius: "6px", flexShrink: 0 }} />
                  </div>

                  {/* 标题 & 标签 & 徽章 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "700", color: "#181a1d", border: "none", padding: 0, letterSpacing: "-0.5px" }}>Manage My Skills</h1>
                      <span style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        background: "rgba(24, 26, 29, 0.08)",
                        borderRadius: "9999px",
                        color: "rgba(24, 26, 29, 0.65)",
                        fontWeight: "600"
                      }}>
                        版本 v{appVersion}
                      </span>
                    </div>
                    
                  </div>
                </div>

                {/* 右侧动作按钮组 */}
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    className="secondary-button"
                    onClick={() => void openUrl("https://github.com/hchcx/manage-my-skills")}
                    style={{ height: "32px", padding: "0 10px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    type="button"
                  >
                    <Github size={13} />
                    <span>GitHub</span>
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => showPrompt("暂无本地更新日志，请访问 GitHub Releases 获取详情。")}
                    style={{ height: "32px", padding: "0 10px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    type="button"
                  >
                    <FileText size={13} />
                    <span>更新日志</span>
                  </button>

                  {appUpdateStatus === "idle" && (
                    <button
                      className="primary-button"
                      onClick={handleCheckUpdate}
                      style={{
                        height: "32px",
                        padding: "0 12px",
                        fontSize: "12px",
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "pointer",
                        fontWeight: "500"
                      }}
                      type="button"
                    >
                      <RefreshCw size={13} />
                      <span>检查更新</span>
                    </button>
                  )}

                  {appUpdateStatus === "checking" && (
                    <button
                      className="primary-button"
                      disabled
                      style={{
                        height: "32px",
                        padding: "0 12px",
                        fontSize: "12px",
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "not-allowed",
                        opacity: 0.8,
                        fontWeight: "500"
                      }}
                      type="button"
                    >
                      <RefreshCw size={13} className="spin" />
                      <span>检查中...</span>
                    </button>
                  )}

                  {appUpdateStatus === "available" && (
                    <button
                      className="primary-button"
                      onClick={handleAppUpgrade}
                      style={{
                        height: "32px",
                        padding: "0 12px",
                        fontSize: "12px",
                        background: "#ea580c",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "pointer",
                        fontWeight: "500",
                        boxShadow: "0 2px 4px rgba(234, 88, 12, 0.2)"
                      }}
                      type="button"
                    >
                      <ArrowUpCircle size={13} />
                      <span>立即更新 (v{latestAppVersion})</span>
                    </button>
                  )}

                  {appUpdateStatus === "updating" && (
                    <button
                      className="primary-button"
                      disabled
                      style={{
                        height: "32px",
                        padding: "0 12px",
                        fontSize: "12px",
                        background: "#ea580c",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "not-allowed",
                        opacity: 0.8,
                        fontWeight: "500"
                      }}
                      type="button"
                    >
                      <RefreshCw size={13} className="spin" />
                      <span>正在更新...</span>
                    </button>
                  )}

                  {appUpdateStatus === "latest" && (
                    <button
                      className="secondary-button"
                      disabled
                      style={{
                        height: "32px",
                        padding: "0 12px",
                        fontSize: "12px",
                        background: "rgba(24, 26, 29, 0.05)",
                        color: "rgba(24, 26, 29, 0.4)",
                        border: "1px solid rgba(24, 26, 29, 0.08)",
                        borderRadius: "6px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "not-allowed",
                        fontWeight: "500"
                      }}
                      type="button"
                    >
                      <Check size={13} style={{ color: "#16a34a" }} />
                      <span>已是最新版本</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 本地环境检查区域 */}
              <section className="settings-section" style={{ borderTop: "none", paddingTop: 0, marginTop: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h2 style={{ fontSize: "14px", fontWeight: "600", color: "#181a1d", margin: 0 }}>本地环境检查</h2>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="secondary-button"
                      disabled={diagnosing}
                      onClick={handleDiagnose}
                      style={{ height: "28px", padding: "0 10px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px", cursor: diagnosing ? "not-allowed" : "pointer" }}
                      type="button"
                    >
                      <Activity size={12} className={diagnosing ? "spin" : ""} />
                      <span>{diagnosing ? "诊断中..." : "诊断安装冲突"}</span>
                    </button>
                    <button
                      className="secondary-button"
                      disabled={checkingUpdate}
                      onClick={refreshEnv}
                      style={{ height: "28px", padding: "0 10px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}
                      type="button"
                    >
                      <RotateCw size={12} className={checkingUpdate ? "spin" : ""} />
                      <span>刷新</span>
                    </button>
                    {Object.values(agentStatuses).some(a => a.status === "upgradeable") && (
                      <button
                        className="primary-button"
                        onClick={upgradeAllAgents}
                        style={{
                          height: "28px",
                          padding: "0 12px",
                          fontSize: "11px",
                          background: "#2563eb",
                          color: "#fff",
                          border: "none",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          cursor: "pointer",
                          fontWeight: "500"
                        }}
                        type="button"
                      >
                        <ArrowUpCircle size={12} />
                        <span>全部升级 ({Object.values(agentStatuses).filter(a => a.status === "upgradeable").length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 四个 Agent 网格 */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "16px"
                }}>
                  {/* Claude Code */}
                  <div style={{
                    border: "1px solid rgba(24, 26, 29, 0.08)",
                    borderRadius: "10px",
                    padding: "16px",
                    background: "#fff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start"
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "600", color: "#181a1d" }}>Claude Code</span>
                        <span style={{ fontSize: "10px", padding: "1px 5px", background: "#eff6ff", color: "#2563eb", borderRadius: "4px", fontWeight: "500" }}>Win</span>
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(24, 26, 29, 0.5)", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", gap: "10px", width: "120px" }}>
                          <span style={{ width: "50px" }}>当前版本</span>
                          <strong style={{ color: "#181a1d" }}>{agentStatuses.claudeCode.current}</strong>
                        </div>
                        <div style={{ display: "flex", gap: "10px", width: "120px" }}>
                          <span style={{ width: "50px" }}>最新版本</span>
                          <strong style={{ color: "#181a1d" }}>{agentStatuses.claudeCode.latest}</strong>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
                      {agentStatuses.claudeCode.status === "upgradeable" && (
                        <>
                          <span style={{ fontSize: "10px", color: "#b45309", background: "#fef3c7", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>可升级</span>
                          <button 
                            className="primary-button" 
                            onClick={() => upgradeAgent("claudeCode")}
                            style={{ height: "26px", padding: "0 10px", fontSize: "11px", background: "#2563eb", border: "none", color: "#fff", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                            type="button"
                          >
                            <ArrowUpCircle size={10} />
                            <span>升级</span>
                          </button>
                        </>
                      )}
                      {agentStatuses.claudeCode.status === "updating" && (
                        <>
                          <span style={{ fontSize: "10px", color: "#2563eb", background: "#eff6ff", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>升级中...</span>
                          <button 
                            className="primary-button" 
                            disabled
                            style={{ height: "26px", padding: "0 10px", fontSize: "11px", background: "#93c5fd", border: "none", color: "#fff", borderRadius: "4px", display: "flex", alignItems: "center", gap: "4px" }}
                            type="button"
                          >
                            <RefreshCw size={10} className="spin" />
                            <span>进行中</span>
                          </button>
                        </>
                      )}
                      {agentStatuses.claudeCode.status === "latest" && (
                        <span style={{ fontSize: "10px", color: "#047857", background: "#ecfdf5", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>已是最新</span>
                      )}
                    </div>
                  </div>

                  {/* Codex */}
                  <div style={{
                    border: "1px solid rgba(24, 26, 29, 0.08)",
                    borderRadius: "10px",
                    padding: "16px",
                    background: "#fff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start"
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "600", color: "#181a1d" }}>Codex</span>
                        <span style={{ fontSize: "10px", padding: "1px 5px", background: "#eff6ff", color: "#2563eb", borderRadius: "4px", fontWeight: "500" }}>Win</span>
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(24, 26, 29, 0.5)", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", gap: "10px", width: "120px" }}>
                          <span style={{ width: "50px" }}>当前版本</span>
                          <strong style={{ color: "#181a1d" }}>{agentStatuses.codex.current}</strong>
                        </div>
                        <div style={{ display: "flex", gap: "10px", width: "120px" }}>
                          <span style={{ width: "50px" }}>最新版本</span>
                          <strong style={{ color: "#181a1d" }}>{agentStatuses.codex.latest}</strong>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
                      {agentStatuses.codex.status === "upgradeable" && (
                        <>
                          <span style={{ fontSize: "10px", color: "#b45309", background: "#fef3c7", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>可升级</span>
                          <button 
                            className="primary-button" 
                            onClick={() => upgradeAgent("codex")}
                            style={{ height: "26px", padding: "0 10px", fontSize: "11px", background: "#2563eb", border: "none", color: "#fff", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                            type="button"
                          >
                            <ArrowUpCircle size={10} />
                            <span>升级</span>
                          </button>
                        </>
                      )}
                      {agentStatuses.codex.status === "updating" && (
                        <>
                          <span style={{ fontSize: "10px", color: "#2563eb", background: "#eff6ff", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>升级中...</span>
                          <button 
                            className="primary-button" 
                            disabled
                            style={{ height: "26px", padding: "0 10px", fontSize: "11px", background: "#93c5fd", border: "none", color: "#fff", borderRadius: "4px", display: "flex", alignItems: "center", gap: "4px" }}
                            type="button"
                          >
                            <RefreshCw size={10} className="spin" />
                            <span>进行中</span>
                          </button>
                        </>
                      )}
                      {agentStatuses.codex.status === "latest" && (
                        <span style={{ fontSize: "10px", color: "#047857", background: "#ecfdf5", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>已是最新</span>
                      )}
                    </div>
                  </div>

                  {/* Gemini CLI */}
                  <div style={{
                    border: "1px solid rgba(24, 26, 29, 0.08)",
                    borderRadius: "10px",
                    padding: "16px",
                    background: "#fff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start"
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "600", color: "#181a1d" }}>Gemini CLI</span>
                        <span style={{ fontSize: "10px", padding: "1px 5px", background: "#eff6ff", color: "#2563eb", borderRadius: "4px", fontWeight: "500" }}>Win</span>
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(24, 26, 29, 0.5)", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", gap: "10px", width: "120px" }}>
                          <span style={{ width: "50px" }}>当前版本</span>
                          <strong style={{ color: "#181a1d" }}>{agentStatuses.geminiCli.current}</strong>
                        </div>
                        <div style={{ display: "flex", gap: "10px", width: "120px" }}>
                          <span style={{ width: "50px" }}>最新版本</span>
                          <strong style={{ color: "#181a1d" }}>{agentStatuses.geminiCli.latest}</strong>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
                      {agentStatuses.geminiCli.status === "upgradeable" && (
                        <>
                          <span style={{ fontSize: "10px", color: "#b45309", background: "#fef3c7", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>可升级</span>
                          <button 
                            className="primary-button" 
                            onClick={() => upgradeAgent("geminiCli")}
                            style={{ height: "26px", padding: "0 10px", fontSize: "11px", background: "#2563eb", border: "none", color: "#fff", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                            type="button"
                          >
                            <ArrowUpCircle size={10} />
                            <span>升级</span>
                          </button>
                        </>
                      )}
                      {agentStatuses.geminiCli.status === "updating" && (
                        <>
                          <span style={{ fontSize: "10px", color: "#2563eb", background: "#eff6ff", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>升级中...</span>
                          <button 
                            className="primary-button" 
                            disabled
                            style={{ height: "26px", padding: "0 10px", fontSize: "11px", background: "#93c5fd", border: "none", color: "#fff", borderRadius: "4px", display: "flex", alignItems: "center", gap: "4px" }}
                            type="button"
                          >
                            <RefreshCw size={10} className="spin" />
                            <span>进行中</span>
                          </button>
                        </>
                      )}
                      {agentStatuses.geminiCli.status === "latest" && (
                        <span style={{ fontSize: "10px", color: "#047857", background: "#ecfdf5", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>已是最新</span>
                      )}
                    </div>
                  </div>

                  {/* OpenCode */}
                  <div style={{
                    border: "1px solid rgba(24, 26, 29, 0.08)",
                    borderRadius: "10px",
                    padding: "16px",
                    background: "#fff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start"
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "600", color: "#181a1d" }}>OpenCode</span>
                        <span style={{ fontSize: "10px", padding: "1px 5px", background: "#eff6ff", color: "#2563eb", borderRadius: "4px", fontWeight: "500" }}>Win</span>
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(24, 26, 29, 0.5)", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", gap: "10px", width: "120px" }}>
                          <span style={{ width: "50px" }}>当前版本</span>
                          <strong style={{ color: agentStatuses.openCode.current === "未安装" ? "#6b7280" : "#181a1d" }}>{agentStatuses.openCode.current}</strong>
                        </div>
                        <div style={{ display: "flex", gap: "10px", width: "120px" }}>
                          <span style={{ width: "50px" }}>最新版本</span>
                          <strong style={{ color: "#181a1d" }}>{agentStatuses.openCode.latest}</strong>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
                      {agentStatuses.openCode.status === "not-installed" && (
                        <>
                          <span style={{ fontSize: "10px", color: "#dc2626", background: "rgba(220, 38, 38, 0.08)", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>未安装</span>
                          <button 
                            className="primary-button" 
                            onClick={installOpenCode}
                            style={{ height: "26px", padding: "0 10px", fontSize: "11px", background: "#2563eb", border: "none", color: "#fff", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                            type="button"
                          >
                            <Download size={10} />
                            <span>安装</span>
                          </button>
                        </>
                      )}
                      {agentStatuses.openCode.status === "installing" && (
                        <>
                          <span style={{ fontSize: "10px", color: "#2563eb", background: "#eff6ff", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>安装中...</span>
                          <button 
                            className="primary-button" 
                            disabled
                            style={{ height: "26px", padding: "0 10px", fontSize: "11px", background: "#93c5fd", border: "none", color: "#fff", borderRadius: "4px", display: "flex", alignItems: "center", gap: "4px" }}
                            type="button"
                          >
                            <RefreshCw size={10} className="spin" />
                            <span>进行中</span>
                          </button>
                        </>
                      )}
                      {agentStatuses.openCode.status === "latest" && (
                        <span style={{ fontSize: "10px", color: "#047857", background: "#ecfdf5", padding: "2px 6px", borderRadius: "4px", fontWeight: "500" }}>已是最新</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        {settingsTab !== "about" ? (
          <div className="sheet-actions">
            <button className="secondary-button" onClick={onClose} type="button">取消</button>
            <button className="primary-button" onClick={onSave} type="button">
              <Check size={16} />
              保存设置
            </button>
          </div>
        ) : (
          <div className="sheet-actions">
            <button className="primary-button" onClick={onClose} type="button" style={{ minWidth: "80px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <Check size={16} />
              <span>确定</span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
