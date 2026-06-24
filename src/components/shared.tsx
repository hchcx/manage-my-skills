import { AlertTriangle } from "lucide-react";
import type { CSSProperties } from "react";
import { agentIconAsset } from "../agentIconRegistry";
import type { AgentRecord, SkillIssue, SkillRecord } from "../types";

export function AgentIcon({ agent }: { agent: AgentRecord }) {
  const icon = agentIconAsset(agent.id);
  const fallback = agent.label.slice(0, 2).toUpperCase();
  const iconStyle = icon?.size ? ({ "--agent-icon-size": `${icon.size}px` } as CSSProperties) : undefined;

  return (
    <span className={`agent-icon ${agent.installed ? "installed" : ""}`}>
      {icon ? (
        <img alt="" aria-hidden="true" src={icon.src} style={iconStyle} />
      ) : (
        <em>{fallback}</em>
      )}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const label = status === "installed" ? "已安装" : "未安装";
  return <span className={`status-pill ${status}`}>{label}</span>;
}

export function SkillState({ skill }: { skill: SkillRecord }) {
  if (skill.conflict) return <span className="status-pill residual">冲突</span>;
  if (skill.issues.length > 0) return <span className="status-pill residual">需检查</span>;
  if (skill.canonicalStatus === "imported") return <span className="status-pill installed">已导入</span>;
  return <span className="status-pill not-installed">外部</span>;
}

export function Coverage({ skill }: { skill: SkillRecord }) {
  const total = skill.installations.length + skill.missingAgents.length;
  const percent = total === 0 ? 0 : Math.round((skill.installations.length / total) * 100);
  return (
    <span className="coverage">
      <i style={{ width: `${percent}%` }} />
      <em>{skill.installations.length}/{total}</em>
    </span>
  );
}

export function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function AgentBadge({ label, status }: { label: string; status: string }) {
  return <span className={`agent-badge ${status}`}>{label}</span>;
}

export function IssueList({ 
  issues,
  onResolve
}: { 
  issues: SkillIssue[];
  onResolve?: (issue: SkillIssue) => void;
}) {
  return (
    <div className="issue-list">
      {issues.map((issue, index) => (
        <div className={`issue ${issue.severity}`} key={`${issue.code}-${index}`}>
          <AlertTriangle size={14} />
          <span style={{ flex: 1 }}>
            <strong>{issue.message}</strong>
            <small>{issueActionHint(issue)}</small>
          </span>
          {onResolve && issue.code === "name-mismatch" && (
            <button
              className="secondary-button compact"
              onClick={(e) => {
                e.stopPropagation();
                onResolve(issue);
              }}
              style={{ marginLeft: "12px", padding: "4px 10px", fontSize: "12px", height: "26px" }}
              type="button"
            >
              修复名称
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function issueActionHint(issue: SkillIssue) {
  if (issue.code === "broken-symlink") return "建议修复断开的软链接后再同步。";
  if (issue.code === "content-conflict") return "建议先选择一个规范来源，避免覆盖不同内容。";
  if (issue.code === "missing-skill-md") return "建议确认目录是否为有效 Skill。";
  if (issue.code === "name-mismatch") return "建议统一目录名和 frontmatter name。";
  return issue.path ? `位置：${issue.path}` : "建议先检查这个 Skill 的来源和安装状态。";
}
