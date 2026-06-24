import { Check, XCircle } from "lucide-react";
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
            <div className="settings-agents-pane">
              {installedCount > 0 ? (
                <div className="settings-agent-list">
                  {agents.map((agent) => {
                    const count = agentSkillCount(agent.id, skillsForCount);
                    const signal = agentSignalSummary(agent);
                    return (
                      <div className="settings-agent-row rich" key={agent.id}>
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
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="settings-agent-empty">
                  暂未发现本地有可用Agent
                </div>
              )}
              <p className="settings-agent-hint">
                已发现 {installedCount} 个已安装 Agent。
              </p>
            </div>
          )}
        </div>

        <div className="sheet-actions">
          {settingsTab === "data" ? (
            <>
              <button className="secondary-button" onClick={onClose} type="button">取消</button>
              <button className="primary-button" onClick={onSave} type="button">
                <Check size={16} />
                保存
              </button>
            </>
          ) : (
            <button className="primary-button" onClick={onClose} type="button">关闭</button>
          )}
        </div>
      </aside>
    </div>
  );
}
