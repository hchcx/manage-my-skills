import { Home } from "lucide-react";
import type { CSSProperties } from "react";
import { agentIconAsset } from "../agentIconRegistry";

export const emptyStateAgentIds = [
  "codex",
  "claude-code",
  "cursor",
  "windsurf",
  "gemini-cli",
  "qwen_code",
  "opencode"
];

export function AgentEmptyVisual() {
  return (
    <div className="agent-empty-visual" aria-hidden="true">
      {emptyStateAgentIds.map((agentId, index) => {
        const icon = agentIconAsset(agentId);
        if (!icon) return null;
        const style = {
          "--slot-index": index,
          "--agent-icon-size": `${icon.size ?? 25}px`
        } as CSSProperties;

        return (
          <span className={`agent-empty-logo logo-${index + 1}`} key={agentId} style={style}>
            <img alt="" src={icon.src} />
          </span>
        );
      })}
    </div>
  );
}

export function ProjectEmptyVisual() {
  return (
    <div className="project-empty-visual" aria-hidden="true">
      <div className="project-empty-card card-back">
        <span className="project-empty-icon small"><Home size={18} /></span>
        <span className="project-empty-lines">
          <i />
          <i className="short" />
        </span>
      </div>
      <div className="project-empty-card card-front">
        <span className="project-empty-icon"><Home size={26} /></span>
        <span className="project-empty-lines">
          <i />
          <i className="short" />
        </span>
      </div>
      <div className="project-empty-card card-low">
        <span className="project-empty-icon small"><Home size={18} /></span>
        <span className="project-empty-lines">
          <i />
          <i className="short" />
        </span>
      </div>
    </div>
  );
}