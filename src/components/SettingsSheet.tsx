import { Check, XCircle, Trash2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AgentIcon, StatusPill } from "./shared";
import { agentSignalSummary, agentSkillCount } from "../lib/skillUtils";
import type { AgentRecord, InventorySnapshot, Settings as AppSettings, SkillRecord } from "../types";

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

  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentLabel, setNewAgentLabel] = useState("");
  const [newGlobalRoot, setNewGlobalRoot] = useState("");
  const [newProjectRoot, setNewProjectRoot] = useState("");

  const installedCount = agents.length;
  const skillsForCount = skills.length ? skills : (inventory?.skills ?? []);

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
              {agents.length > 0 ? (
                <div className="settings-agent-list" style={{ maxHeight: "300px", overflowY: "auto", paddingRight: "4px" }}>
                  {agents.map((agent) => {
                    const count = agentSkillCount(agent.id, skillsForCount);
                    const signal = agentSignalSummary(agent);
                    
                    const isEnabled = settings.enabledAgentIds
                      ? settings.enabledAgentIds.includes(agent.id)
                      : agent.installed;

                    const isCustom = settings.customAgents?.some(ca => ca.id === agent.id);

                    const handleToggle = (checked: boolean) => {
                      const currentEnabled = settings.enabledAgentIds || agents.map(a => a.id);
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
                      if (confirm(`确定要删除自定义 Agent "${agent.label}" 吗？`)) {
                        const newCustom = (settings.customAgents || []).filter(ca => ca.id !== agent.id);
                        const newEnabled = (settings.enabledAgentIds || agents.map(a => a.id)).filter(id => id !== agent.id);
                        onChange({
                          ...settings,
                          customAgents: newCustom,
                          enabledAgentIds: newEnabled
                        });
                      }
                    };

                    return (
                      <div 
                        className="settings-agent-row rich" 
                        key={agent.id}
                        style={{ 
                          gridTemplateColumns: "24px 36px minmax(0, 1fr) auto auto 32px",
                          gap: "12px",
                          opacity: isEnabled ? 1 : 0.65,
                          transition: "opacity 0.2s"
                        }}
                      >
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
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
                  <label className="field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "rgba(23, 25, 28, 0.6)" }}>全局 Skills 目录绝对路径</span>
                    <input
                      type="text"
                      placeholder="例如 E:\A_project\my-copilot\skills"
                      value={newGlobalRoot}
                      onChange={(e) => setNewGlobalRoot(e.target.value)}
                      style={{ height: "34px", fontSize: "12px", padding: "0 8px" }}
                    />
                  </label>
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
                        const exists = agents.some((a) => a.id === newAgentId);
                        if (exists) {
                          alert(`ID "${newAgentId}" 已经存在，请输入其他标识 ID`);
                          return;
                        }
                        const newCustomAgent = {
                          id: newAgentId.trim(),
                          label: newAgentLabel.trim(),
                          globalRoots: [newGlobalRoot.trim()],
                          projectRoots: newProjectRoot.trim() ? [newProjectRoot.trim()] : [],
                        };
                        const updatedCustomAgents = [...(settings.customAgents || []), newCustomAgent];
                        const updatedEnabledAgentIds = [...(settings.enabledAgentIds || agents.map(a => a.id)), newAgentId.trim()];
                        onChange({
                          ...settings,
                          customAgents: updatedCustomAgents,
                          enabledAgentIds: updatedEnabledAgentIds,
                        });
                        setNewAgentId("");
                        setNewAgentLabel("");
                        setNewGlobalRoot("");
                        setNewProjectRoot("");
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
