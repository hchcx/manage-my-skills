import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Check, FolderOpen, Github, Globe, RefreshCw, Search, Settings, X, AlertTriangle, ChevronDown } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { AgentIcon } from "../components/shared";
import type { AgentRecord, Settings as AppSettings } from "../types";
import { isTauriRuntime } from "../lib/runtime";

interface RemoteSkillInfo {
  slug: string;
  displayName: string;
  description?: string;
  repoUrl: string;
  relativePath: string;
}

const mockRemoteSkills: RemoteSkillInfo[] = [
  {
    slug: "blog-writer",
    displayName: "Blog Writer",
    description: "按照作者独特的文风、语气和个人经验编写真实、对话式的高质量博客文章及长篇内容。",
    repoUrl: "https://github.com/ComposioHQ/awesome-claude-skills",
    relativePath: "skills/blog-writer"
  },
  {
    slug: "security-auditor",
    displayName: "Security Auditor",
    description: "审计代码中的安全漏洞，涵盖 OWASP Top 10 防范、CORS/CSP 配置、输入清理及越权测试。",
    repoUrl: "https://github.com/ComposioHQ/awesome-claude-skills",
    relativePath: "skills/security-auditor"
  },
  {
    slug: "threejs-animation",
    displayName: "Three.js Animation Helper",
    description: "辅助创建 3D 动画与炫酷交互场景，包括骨骼动画、着色器自定义编写、滤镜特效及性能调优。",
    repoUrl: "https://github.com/ComposioHQ/awesome-claude-skills",
    relativePath: "skills/threejs-animation"
  },
  {
    slug: "seo-content-writer",
    displayName: "SEO Content Writer",
    description: "自动撰写符合 SEO 搜索引擎排名的博客和文章，支持关键词合理密度布局与结构化排版设计。",
    repoUrl: "https://github.com/ComposioHQ/awesome-claude-skills",
    relativePath: "skills/seo-content-writer"
  },
  {
    slug: "backtest-expert",
    displayName: "Backtest Expert",
    description: "提供系统化量化交易策略回测指导，涵盖滑点模拟、过度拟合防范、夏普比率计算等方法学。",
    repoUrl: "https://github.com/ComposioHQ/awesome-claude-skills",
    relativePath: "skills/backtest-expert"
  }
];

export function DiscoveryView({
  settings,
  agents,
  onUpdateSettings,
  onShowToast,
  onRefreshInventory,
  remoteSkills,
  setRemoteSkills,
  remoteSkillsLoading: loading,
  setRemoteSkillsLoading: setLoading,
  remoteSkillsLoaded,
  setRemoteSkillsLoaded
}: {
  settings: AppSettings;
  agents: AgentRecord[];
  onUpdateSettings: (nextSettings: AppSettings) => Promise<void>;
  onShowToast: (msg: string) => void;
  onRefreshInventory: (silent?: boolean) => Promise<void>;
  remoteSkills: RemoteSkillInfo[];
  setRemoteSkills: (skills: RemoteSkillInfo[]) => void;
  remoteSkillsLoading: boolean;
  setRemoteSkillsLoading: (loading: boolean) => void;
  remoteSkillsLoaded: boolean;
  setRemoteSkillsLoaded: (loaded: boolean) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // 监听外部点击以关闭自定义下拉框
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".custom-dropdown-container")) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const initialRepo = useMemo(() => {
    const repos = settings.skillRepositories || [];
    return repos[0] || "https://github.com/ComposioHQ/awesome-claude-skills.git";
  }, [settings.skillRepositories]);

  const [repoFilter, setRepoFilter] = useState(initialRepo);

  // 仓库管理 Dialog 状态
  const [showRepoManager, setShowRepoManager] = useState(false);
  const [repoList, setRepoList] = useState<string[]>([]);
  const [newRepoUrl, setNewRepoUrl] = useState("");

  // 安装分发 Dialog 状态
  const [installSkill, setInstallSkill] = useState<RemoteSkillInfo | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [installScope, setInstallScope] = useState<"global" | "project">("global");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [installMethod, setInstallMethod] = useState<"symlink" | "copy" | "managed">("symlink");
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  // 初始化拉取远程技能
  useEffect(() => {
    if (!remoteSkillsLoaded) {
      void fetchSkills(initialRepo);
    }
  }, [remoteSkillsLoaded, initialRepo]);

  // 如果 settings 里的仓库列表变了，且当前选中的不在列表中，重置为第一个并重新拉取
  useEffect(() => {
    const repos = settings.skillRepositories || [];
    if (!repos.includes(repoFilter) && repoFilter !== "all") {
      setRepoFilter(initialRepo);
      setRemoteSkillsLoaded(false);
    }
  }, [settings.skillRepositories, initialRepo]);

  const activeRepos = useMemo(() => {
    return settings.skillRepositories || ["https://github.com/ComposioHQ/awesome-claude-skills"];
  }, [settings.skillRepositories]);

  async function fetchSkills(targetRepo?: string) {
    const url = targetRepo || repoFilter;
    setLoading(true);
    if (!isTauriRuntime()) {
      // 模拟加载延时
      await new Promise((resolve) => setTimeout(resolve, 800));
      setRemoteSkills(mockRemoteSkills);
      setLoading(false);
      setRemoteSkillsLoaded(true);
      return;
    }
    try {
      const list = await invoke<RemoteSkillInfo[]>("list_remote_skills", {
        repoUrl: url === "all" ? null : url
      });
      setRemoteSkills(list);
      setRemoteSkillsLoaded(true);
    } catch (err) {
      console.error(err);
      onShowToast(`获取远程技能失败: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  // 模糊检索与过滤
  const filteredRemoteSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return remoteSkills.filter((skill) => {
      const matchQuery =
        !q ||
        skill.displayName.toLowerCase().includes(q) ||
        skill.slug.toLowerCase().includes(q) ||
        (skill.description && skill.description.toLowerCase().includes(q));

      const matchRepo = repoFilter === "all" || skill.repoUrl === repoFilter;
      return matchQuery && matchRepo;
    });
  }, [remoteSkills, searchQuery, repoFilter]);

  const uniqueRepos = useMemo(() => {
    const set = new Set(remoteSkills.map((s) => s.repoUrl));
    return Array.from(set);
  }, [remoteSkills]);

  // 打开仓库配置
  const openRepoManager = () => {
    setRepoList(settings.skillRepositories || ["https://github.com/ComposioHQ/awesome-claude-skills"]);
    setNewRepoUrl("");
    setShowRepoManager(true);
  };

  // 添加仓库
  const handleAddRepo = () => {
    const url = newRepoUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.includes("git@")) {
      onShowToast("请输入合法的 Git 仓库链接");
      return;
    }
    if (repoList.includes(url)) {
      onShowToast("该仓库已在列表中");
      return;
    }
    setRepoList([...repoList, url]);
    setNewRepoUrl("");
  };

  // 移除仓库
  const handleRemoveRepo = (url: string) => {
    setRepoList(repoList.filter((item) => item !== url));
  };

  // 保存仓库配置到 Settings
  const handleSaveRepos = async () => {
    try {
      const nextSettings = {
        ...settings,
        skillRepositories: repoList
      };
      await onUpdateSettings(nextSettings);
      setShowRepoManager(false);
      onShowToast("仓库配置保存成功，正在拉取...");
    } catch (err) {
      onShowToast(`保存配置失败: ${String(err)}`);
    }
  };

  // 开始配置安装 Dialog 初始值
  const handleOpenInstall = (skill: RemoteSkillInfo) => {
    setInstallSkill(skill);
    // 默认勾选所有已启用的 Agent
    const activeAgents = agents.filter((a) => a.enabled).map((a) => a.id);
    setSelectedAgentIds(activeAgents);
    setInstallScope("global");
    setSelectedProject(settings.projectFolders[0] || "");
    setInstallMethod("symlink");
    setInstallError(null);
    setInstalling(false);
  };

  // 多选 Agent 勾选处理
  const handleToggleAgent = (agentId: string) => {
    setSelectedAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId]
    );
  };

  // 文件夹选择
  const handleBrowseProject = async () => {
    if (!isTauriRuntime()) return;
    const selected = await open({ directory: true, multiple: false, title: "选择要同步的项目路径" });
    if (typeof selected === "string") {
      const nextProjectFolders = Array.from(new Set([...settings.projectFolders, selected]));
      const nextSettings = {
        ...settings,
        projectFolders: nextProjectFolders
      };
      await onUpdateSettings(nextSettings);
      setSelectedProject(selected);
    }
  };

  // 执行远程安装
  const handleConfirmInstall = async () => {
    if (!installSkill) return;
    if (selectedAgentIds.length === 0) {
      setInstallError("请至少选择一个目标 Agent 予以分发安装");
      return;
    }
    if (installScope === "project" && !selectedProject) {
      setInstallError("请选择或关联一个项目工作区路径");
      return;
    }

    setInstalling(true);
    setInstallError(null);

    const args = {
      repoUrl: installSkill.repoUrl,
      relativePath: installSkill.relativePath,
      slug: installSkill.slug,
      agentIds: selectedAgentIds,
      scope: installScope,
      projectPath: installScope === "project" ? selectedProject : undefined,
      method: installMethod
    };

    if (!isTauriRuntime()) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setInstalling(false);
      setInstallSkill(null);
      onShowToast(`[网页预览] 成功将 ${installSkill.displayName} 模拟安装至 Agents`);
      return;
    }

    try {
      await invoke("install_remote_skill", { args });
      // 成功后，自动触发全局 Skills 重新扫描，刷新主界面的同步状态
      await onRefreshInventory(true);
      setInstalling(false);
      setInstallSkill(null);
      onShowToast(`已成功将 ${installSkill.displayName} 同步分发至 Agent`);
    } catch (err) {
      setInstalling(false);
      setInstallError(String(err));
    }
  };

  // 打开 GitHub 链接
  const handleOpenGitLink = (url: string) => {
    if (!isTauriRuntime()) {
      window.open(url, "_blank");
      return;
    }
    void invoke("open_url", { url });
  };

  return (
    <div className="market-container">
      {/* 头部控制栏 */}
      <div className="market-header">
        <div className="search-box-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="搜索在线技能商店..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="clear-search-btn">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="market-actions">
          {/* 自定义下拉筛选框 */}
          <div className="custom-dropdown-container">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="dropdown-trigger-btn"
              title="选择技能仓库"
              type="button"
            >
              <span className="dropdown-trigger-text">
                {repoFilter === "all"
                  ? "所有技能仓库源"
                  : repoFilter.replace("https://github.com/", "").replace(".git", "")}
              </span>
              <ChevronDown size={14} className={`chevron-icon ${dropdownOpen ? "open" : ""}`} />
            </button>

            <div className={`dropdown-menu-panel ${dropdownOpen ? "open" : ""}`}>
              <div
                onClick={() => {
                  setRepoFilter("all");
                  void fetchSkills("all");
                  setDropdownOpen(false);
                }}
                className={`dropdown-menu-item ${repoFilter === "all" ? "active" : ""}`}
              >
                <span>所有技能仓库源</span>
                {repoFilter === "all" && <Check size={14} className="active-check" />}
              </div>

              {activeRepos.map((url) => {
                const isActive = repoFilter === url;
                const shortName = url.replace("https://github.com/", "").replace(".git", "");
                return (
                  <div
                    key={url}
                    onClick={() => {
                      setRepoFilter(url);
                      void fetchSkills(url);
                      setDropdownOpen(false);
                    }}
                    className={`dropdown-menu-item ${isActive ? "active" : ""}`}
                    title={url}
                  >
                    <span className="item-text">{shortName}</span>
                    {isActive && <Check size={14} className="active-check" />}
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={openRepoManager} className="action-btn secondary-btn" title="配置技能 Git 仓库列表">
            <Settings size={16} />
            <span>配置仓库</span>
          </button>

          <button onClick={() => void fetchSkills()} disabled={loading} className="action-btn primary-btn">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span>{loading ? "正在刷新..." : "刷新商店"}</span>
          </button>
        </div>
      </div>

      {/* 远程技能网格卡片 */}
      {loading ? (
        <div className="market-loading">
          <RefreshCw size={36} className="animate-spin text-accent" />
          <p>正在获取/同步已配置的技能仓库源...</p>
        </div>
      ) : filteredRemoteSkills.length === 0 ? (
        <div className="market-empty">
          <Globe size={48} className="empty-icon" />
          <h3>未发现可用技能</h3>
          <p>没有找到与检索词匹配的技能卡片。建议检查您的“仓库配置”是否正常拉取，或者点击右上角刷新。</p>
        </div>
      ) : (
        <div className="market-grid">
          {filteredRemoteSkills.map((skill) => (
            <div className="market-card" key={`${skill.repoUrl}-${skill.relativePath}-${skill.slug}`}>
              <div className="card-header">
                <div className="title-section">
                  <h4>{skill.displayName}</h4>
                  <span className="slug-badge">{skill.slug}</span>
                </div>
                {skill.repoUrl.startsWith("https://github.com/") && (
                  <button
                    onClick={() => handleOpenGitLink(skill.repoUrl)}
                    className="git-link-btn"
                    title="在 GitHub 中查看"
                  >
                    <Github size={18} />
                  </button>
                )}
              </div>

              <p className="card-description">{skill.description || "暂无描述信息"}</p>

              <div className="card-footer">
                <div className="source-info">
                  <Globe size={13} />
                  <span>{skill.repoUrl.replace("https://github.com/", "").replace(".git", "")}</span>
                </div>
                <button onClick={() => handleOpenInstall(skill)} className="install-action-btn">
                  一键安装
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 仓库源管理 Modal */}
      {showRepoManager && (
        <div className="modal-backdrop">
          <div className="modal-content repo-manager-modal">
            <div className="modal-header">
              <h3>管理技能 Git 仓库源</h3>
              <button onClick={() => setShowRepoManager(false)} className="close-modal-btn">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p className="description-text">
                软件在点击“刷新”时，会自动拉取并更新这些 Git 仓库缓存，并从中扫描含有 <code>SKILL.md</code> 的技能子目录。
              </p>

              <div className="repo-list">
                {repoList.length === 0 ? (
                  <div className="repo-empty-text">当前暂未配置任何技能仓库源，列表为空。</div>
                ) : (
                  repoList.map((url) => (
                    <div className="repo-item" key={url}>
                      <span className="repo-url-text" title={url}>
                        {url}
                      </span>
                      <button onClick={() => handleRemoveRepo(url)} className="repo-remove-btn" title="删除">
                        <X size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="add-repo-form">
                <input
                  type="text"
                  placeholder="添加技能仓库 Git 链接 (如 https://github.com/...)"
                  value={newRepoUrl}
                  onChange={(e) => setNewRepoUrl(e.target.value)}
                  className="add-repo-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddRepo();
                  }}
                />
                <button onClick={handleAddRepo} className="add-repo-btn">
                  新增
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowRepoManager(false)} className="modal-btn secondary">
                取消
              </button>
              <button onClick={handleSaveRepos} className="modal-btn primary">
                保存并拉取
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 一键分发安装 Modal */}
      {installSkill && (
        <div className="modal-backdrop">
          <div className="modal-content install-modal">
            <div className="modal-header">
              <h3>一键安装并分发技能</h3>
              <button onClick={() => setInstallSkill(null)} className="close-modal-btn" disabled={installing}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="skill-preview-header">
                <strong>{installSkill.displayName}</strong>
                <span className="slug-badge">{installSkill.slug}</span>
              </div>

              {installError && (
                <div className="install-error-banner">
                  <AlertTriangle size={16} />
                  <span>{installError}</span>
                </div>
              )}

              {/* 1. 目标 Agent 选择 */}
              <div className="form-group">
                <label className="form-label">选择要安装到的 Agent 终端 (可多选)</label>
                <div className="agent-selection-grid">
                  {agents.length === 0 ? (
                    <div className="form-helper-text">未检测到任何本地已装的 Agents。</div>
                  ) : (
                    agents.map((agent) => {
                      const isSelected = selectedAgentIds.includes(agent.id);
                      return (
                        <div
                          key={agent.id}
                          className={`agent-select-card ${isSelected ? "selected" : ""}`}
                          onClick={() => handleToggleAgent(agent.id)}
                        >
                          <AgentIcon agent={agent} />
                          <div className="agent-info-text">
                            <strong>{agent.label}</strong>
                            <span>{agent.enabled ? "已启用" : "未启用"}</span>
                          </div>
                          {isSelected && <Check size={16} className="checked-indicator" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 2. 生效范围 */}
              <div className="form-group">
                <label className="form-label">分发生效范围</label>
                <div className="scope-selection-row">
                  <button
                    className={`scope-tab ${installScope === "global" ? "active" : ""}`}
                    onClick={() => setInstallScope("global")}
                  >
                    全局 (Global)
                  </button>
                  <button
                    className={`scope-tab ${installScope === "project" ? "active" : ""}`}
                    onClick={() => setInstallScope("project")}
                  >
                    项目工作区 (Project)
                  </button>
                </div>

                {installScope === "project" && (
                  <div className="project-folder-row">
                    <select
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      className="project-folder-select"
                    >
                      <option value="">-- 请选择或关联一个项目目录 --</option>
                      {settings.projectFolders.map((path) => (
                        <option key={path} value={path}>
                          {path}
                        </option>
                      ))}
                    </select>
                    <button onClick={handleBrowseProject} className="browse-folder-btn" title="浏览本地文件夹">
                      <FolderOpen size={16} />
                      <span>关联项目</span>
                    </button>
                  </div>
                )}
                <p className="form-helper-text text-muted">
                  {installScope === "global"
                    ? "全局范围：该技能对选定的 Agent 在全局指令交互时皆生效。"
                    : "项目工作区：该技能仅在您对应的特定项目文件夹工作空间中工作。"}
                </p>
              </div>

              {/* 3. 安装分发方式 */}
              <div className="form-group">
                <label className="form-label">选择分发方式</label>
                <div className="method-selection-column">
                  <label className={`method-option-card ${installMethod === "symlink" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="installMethod"
                      value="symlink"
                      checked={installMethod === "symlink"}
                      onChange={() => setInstallMethod("symlink")}
                    />
                    <div className="method-desc">
                      <strong>创建软链接 (推荐)</strong>
                      <span>直接将 Git 缓存中的技能目录通过软链接方式链接到 Agent 中。零空间占用且与 Git 自动同步更新。</span>
                    </div>
                  </label>

                  <label className={`method-option-card ${installMethod === "copy" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="installMethod"
                      value="copy"
                      checked={installMethod === "copy"}
                      onChange={() => setInstallMethod("copy")}
                    />
                    <div className="method-desc">
                      <strong>物理复制副本</strong>
                      <span>将技能目录中的文件以物理文件夹拷贝方式拷贝到 Agent 中。该副本可脱离源 Git 仓库，支持您在此基础上自行定制改写。</span>
                    </div>
                  </label>

                  <label className={`method-option-card ${installMethod === "managed" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="installMethod"
                      value="managed"
                      checked={installMethod === "managed"}
                      onChange={() => setInstallMethod("managed")}
                    />
                    <div className="method-desc">
                      <strong>导入中心库并同步</strong>
                      <span>将技能目录物理拷贝到您的中心库（Library）中，然后再从中心库向 Agent 建立软链接，由中心库统一纳管。</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setInstallSkill(null)} className="modal-btn secondary" disabled={installing}>
                取消
              </button>
              <button
                onClick={handleConfirmInstall}
                className="modal-btn primary"
                disabled={installing || selectedAgentIds.length === 0}
              >
                {installing ? "正在分发安装中..." : "确认安装"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
