import { Check, XCircle, Trash2, Plus, FolderOpen, Upload, GripVertical } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { AgentIcon, StatusPill } from "./shared";
import { agentSignalSummary, agentSkillCount } from "../lib/skillUtils";
import type { AgentRecord, InventorySnapshot, Settings as AppSettings, SkillRecord } from "../types";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauriRuntime } from "../lib/runtime";
import defaultLogo from "../m-my-skills-logo.png";

export function SettingsSheet({
  settings,
  inventory,
  agents = [],
  skills = [],
  onChange,
  onClose,
  onSave
}: {
  settings: AppSettings;
  inventory: InventorySnapshot | null;
  agents?: AgentRecord[];
  skills?: SkillRecord[];
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [settingsTab, setSettingsTab] = useState<"data" | "agents">("data");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentLabel, setNewAgentLabel] = useState("");
  const [newGlobalRoot, setNewGlobalRoot] = useState("");
  const [newProjectRoot, setNewProjectRoot] = useState("");
  const [newAgentIcon, setNewAgentIcon] = useState("");
  const iconInputRef = useRef<HTMLInputElement>(null);

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert("图片大小不能超过 1MB");
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
      alert("当前不是 Tauri 运行环境，无法调用文件夹选择器，请手动输入。");
    }
  };

  const installedCount = agents.length;
  const skillsForCount = skills.length ? skills : (inventory?.skills ?? []);

  // Synthesize displayAgents so newly added custom agents show up in settings list immediately
  const displayAgents: AgentRecord[] = [...(agents || [])];
  if (settings.customAgents) {
    for (const ca of settings.customAgents) {
      const idx = displayAgents.findIndex(a => a.id === ca.id);
      if (idx !== -1) {
        displayAgents[idx] = {
          ...displayAgents[idx],
          label: ca.label,
          globalRoots: ca.globalRoots,
          projectRoots: ca.projectRoots,
          iconData: ca.iconData,
        };
      } else {
        displayAgents.push({
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

  // Sort based on settings.agentOrder, otherwise default to showing enabled ones first
  if (settings.agentOrder) {
    const orderMap = new Map(settings.agentOrder.map((id, index) => [id, index]));
    displayAgents.sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return idxA - idxB;
    });
  } else {
    displayAgents.sort((a, b) => {
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
  }

  // Automatically initialize agentOrder with the default sorting (enabled first, then priority/label) if it is missing
  useEffect(() => {
    if (!settings.agentOrder && displayAgents.length > 0) {
      const defaultSorted = [...displayAgents].sort((a, b) => {
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
      onChange({
        ...settings,
        agentOrder: defaultSorted.map(a => a.id)
      });
    }
  }, [settings.agentOrder, displayAgents.length, onChange]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", String(index));
    } catch (_) {
      // IE fallback if any
    }
  };

  const handleDragOver = (e: React.DragEvent, hoverIndex: number) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch (_) {}
    if (draggedIndex === null || draggedIndex === hoverIndex) return;

    const reordered = [...displayAgents];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(hoverIndex, 0, removed);

    setDraggedIndex(hoverIndex);

    const newOrder = reordered.map(a => a.id);
    onChange({
      ...settings,
      agentOrder: newOrder
    });
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
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
          </div>
          <button className="icon-button" onClick={onClose} title="关闭" type="button">
            <XCircle size={17} />
          </button>
        </div>

        <div className="settings-content">
          {settingsTab === "data" && (
            <>
              <section className="settings-section">
                <label className="field">
                  <span>中心库</span>
                  <input value={settings.libraryPath} onChange={(event) => onChange({ ...settings, libraryPath: event.target.value })} />
                  <small>中心库用于保存规范 Skill 副本；同步时会从这里链接或复制到目标 Agent。</small>
                </label>
                <label className="switch-row">
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
                <code className="path-code" title={inventory?.appDataPath || undefined}>{inventory?.appDataPath || "尚未扫描"}</code>
              </section>
            </>
          )}

          {settingsTab === "agents" && (
            <div className="settings-agents-pane" style={{ gap: "20px" }}>
              {displayAgents.length > 0 ? (
                <div 
                  className={`settings-agent-list ${draggedIndex !== null ? "is-dragging" : ""}`} 
                  style={{ maxHeight: "300px", overflowY: "auto", paddingRight: "4px" }}
                  onDragOver={(e) => e.preventDefault()}
                >
                  {draggedIndex !== null && (
                    <style>{`
                      .settings-agent-list.is-dragging .settings-agent-row > * {
                        pointer-events: none !important;
                      }
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
                      const currentEnabled = settings.enabledAgentIds || displayAgents.map(a => a.id);
                      let newEnabled: string[];
                      if (checked) {
                        newEnabled = [...currentEnabled, agent.id];
                      } else {
                        newEnabled = currentEnabled.filter(id => id !== agent.id);
                      }
                      onChange({
                        ...settings,
                        enabledAgentIds: newEnabled
                      });
                    };

                    const handleDelete = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (confirm(`确定要删除自定义 Agent "${agent.label}" 吗？删除后将不可恢复。`)) {
                        const newCustom = (settings.customAgents || []).filter(ca => ca.id !== agent.id);
                        const newEnabled = (settings.enabledAgentIds || displayAgents.map(a => a.id)).filter(id => id !== agent.id);
                        const newOrder = (settings.agentOrder || []).filter(id => id !== agent.id);
                        onChange({
                          ...settings,
                          customAgents: newCustom,
                          enabledAgentIds: newEnabled,
                          agentOrder: newOrder
                        });
                      }
                    };

                    const isDraggingThis = index === draggedIndex;

                    return (
                      <div 
                        className="settings-agent-row rich" 
                        key={agent.id}
                        onDragOver={(e) => handleDragOver(e, index)}
                        style={{ 
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
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragEnd={handleDragEnd}
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center", 
                            color: "#9ca3af",
                            cursor: "grab",
                            width: "20px",
                            height: "100%"
                          }}
                          title="拖拽排序"
                        >
                          <GripVertical size={14} />
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
                            <button
                              type="button"
                              className="icon-button"
                              onClick={handleDelete}
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
                          alert("标识 ID、显示名称和全局路径不能为空");
                          return;
                        }
                        const exists = displayAgents.some((a) => a.id === newAgentId);
                        if (exists) {
                          alert(`ID "${newAgentId}" 已经存在，请输入其他标识 ID`);
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
                        const updatedEnabledAgentIds = [...(settings.enabledAgentIds || displayAgents.map(a => a.id)), newAgentId.trim()];
                        onChange({
                          ...settings,
                          customAgents: updatedCustomAgents,
                          enabledAgentIds: updatedEnabledAgentIds,
                        });
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
        </div>

        <div className="sheet-actions">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button className="primary-button" onClick={onSave} type="button">
            <Check size={16} />
            保存设置
          </button>
        </div>
      </aside>
    </div>
  );
}
