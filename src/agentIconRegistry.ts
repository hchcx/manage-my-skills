export type AgentIconAsset = {
  src: string;
  size?: number;
};

const iconFiles: Record<string, AgentIconAsset> = {
  amp: { src: new URL("../agent-icons/amp-color.svg", import.meta.url).href },
  antigravity: { src: new URL("../agent-icons/antigravity-color.svg", import.meta.url).href },
  augment: { src: new URL("../agent-icons/augment.svg", import.meta.url).href },
  "claude-code": { src: new URL("../agent-icons/claudecode-color.svg", import.meta.url).href },
  cline: { src: new URL("../agent-icons/cline.svg", import.meta.url).href },
  codebuddy: { src: new URL("../agent-icons/codebuddy-color.svg", import.meta.url).href, size: 26 },
  codex: { src: new URL("../agent-icons/codex-color.svg", import.meta.url).href, size: 26 },
  cursor: { src: new URL("../agent-icons/cursor.svg", import.meta.url).href },
  "gemini-cli": { src: new URL("../agent-icons/geminicli-color.svg", import.meta.url).href, size: 26 },
  "github-copilot": { src: new URL("../agent-icons/githubcopilot.svg", import.meta.url).href },
  "grok-cli": { src: new URL("../agent-icons/grok.svg", import.meta.url).href },
  hermes: { src: new URL("../agent-icons/hermesagent.svg", import.meta.url).href },
  junie: { src: new URL("../agent-icons/junie-color.svg", import.meta.url).href },
  "kilo-code": { src: new URL("../agent-icons/kilocode.svg", import.meta.url).href, size: 26 },
  kimi: { src: new URL("../agent-icons/kimi-color.svg", import.meta.url).href },
  kiro: { src: new URL("../agent-icons/kiro-color.svg", import.meta.url).href, size: 26 },
  openclaw: { src: new URL("../agent-icons/openclaw-color.svg", import.meta.url).href },
  opencode: { src: new URL("../agent-icons/opencode.svg", import.meta.url).href },
  pi: { src: new URL("../agent-icons/pi-logo.svg", import.meta.url).href, size: 26 },
  qoder: { src: new URL("../agent-icons/qoder-color.svg", import.meta.url).href },
  qwen_code: { src: new URL("../agent-icons/qwen-color.svg", import.meta.url).href },
  roocode: { src: new URL("../agent-icons/roocode.svg", import.meta.url).href },
  trae: { src: new URL("../agent-icons/trae-color.svg", import.meta.url).href },
  trae_cn: { src: new URL("../agent-icons/trae-color.svg", import.meta.url).href },
  warp: { src: new URL("../agent-icons/warp-logo-dark.svg", import.meta.url).href, size: 26 },
  windsurf: { src: new URL("../agent-icons/windsurf.svg", import.meta.url).href },
  workbuddy: { src: new URL("../agent-icons/wodebuddy.svg", import.meta.url).href },
  zed: { src: new URL("../agent-icons/zed-logo.svg", import.meta.url).href }
};

export function agentIconAsset(agentId: string): AgentIconAsset | null {
  return iconFiles[agentId] ?? null;
}
