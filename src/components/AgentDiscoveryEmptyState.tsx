import { Loader2 } from "lucide-react";
import { AgentEmptyVisual } from "./EmptyStateVisuals";

export function AgentDiscoveryEmptyState({
  busy,
  previouslyScanned = false,
  onScan,
  onSkip,
}: {
  busy: string;
  previouslyScanned?: boolean;
  onScan: () => void;
  onSkip?: () => void;
}) {
  const isFirstUse = !previouslyScanned;

  return (
    <section className="agent-empty-state" aria-label="发现 Skills 空状态">
      <AgentEmptyVisual />

      <div className="agent-empty-copy">
        {isFirstUse ? (
          <strong>先扫描这台电脑，看看有哪些 Skills 可用</strong>
        ) : (
          <span>本地可用 Skills 可能发生了变化，可以重新扫描或直接跳过</span>
        )}
      </div>

      {isFirstUse ? (
        <button
          className="agent-empty-button"
          disabled={Boolean(busy)}
          onClick={onScan}
          type="button"
        >
          {busy ? <Loader2 className="spin" size={16} /> : null}
          <span>开始扫描</span>
        </button>
      ) : (
        <div className="empty-actions">
          <button
            className="agent-empty-button"
            disabled={Boolean(busy)}
            onClick={onScan}
            type="button"
          >
            {busy ? <Loader2 className="spin" size={16} /> : null}
            <span>重新扫描</span>
          </button>
          {onSkip && (
            <button
              className="secondary-button"
              disabled={Boolean(busy)}
              onClick={onSkip}
              type="button"
            >
              直接跳过
            </button>
          )}
        </div>
      )}
    </section>
  );
}
