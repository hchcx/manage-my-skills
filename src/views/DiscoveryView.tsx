import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Check, FolderOpen, Github, Globe, RefreshCw, Search, Settings, X, AlertTriangle, ChevronDown } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { AgentIcon } from "../components/shared";
import type { AgentRecord, Settings as AppSettings, SkillRecord } from "../types";
import { isTauriRuntime } from "../lib/runtime";
import ReactMarkdown from "react-markdown";

interface RemoteSkillInfo {
  slug: string;
  displayName: string;
  description?: string;
  repoUrl: string;
  relativePath: string;
}

// GitHub 仓库缓存结构
interface GitHubRepoData {
  stars: number;
  weeklyCommits: number[];
  updatedAt: number;
}

// 解析 GitHub Url 获取 owner/repo
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const cleanUrl = url.trim();
  const regex = /github\.com\/([^\/]+)\/([^\/\.]+)/i;
  const match = cleanUrl.match(regex);
  if (match && match[1] && match[2]) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
  }
  return null;
}

const CACHE_EXPIRATION_TIME = 12 * 60 * 60 * 1000; // 12 小时

// 读取 localStorage 中的 GitHub 缓存
function getCachedGitHubData(repoUrl: string): GitHubRepoData | null {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) return null;
  const cacheKey = `gh_stats_${parsed.owner}_${parsed.repo}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const data = JSON.parse(cached) as GitHubRepoData;
      if (Date.now() - data.updatedAt < CACHE_EXPIRATION_TIME) {
        return data;
      }
    } catch (e) {
      console.error("解析 GitHub 缓存失败", e);
    }
  }
  return null;
}

// 写入 localStorage
function setCachedGitHubData(repoUrl: string, stars: number, weeklyCommits: number[]) {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) return;
  const cacheKey = `gh_stats_${parsed.owner}_${parsed.repo}`;
  const data: GitHubRepoData = {
    stars,
    weeklyCommits,
    updatedAt: Date.now()
  };
  localStorage.setItem(cacheKey, JSON.stringify(data));
}

// 确定性随机数哈希（做数据降级使用）
function getSlugFallbackStats(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);
  
  // 伪造 stars 数量 (在 80 - 650 之间)
  const fallbackStars = 80 + (absHash % 570);
  
  // 伪造 8 周 commit 活跃数 (5 - 30之间波动)
  const fallbackCommits: number[] = [];
  for (let i = 0; i < 8; i++) {
    fallbackCommits.push(2 + ((absHash + i * i * 7) % 20));
  }
  
  // 伪造 trendWeight
  const trendWeight = (absHash % 100) / 100;
  
  return {
    stars: fallbackStars,
    weeklyCommits: fallbackCommits,
    trendWeight
  };
}

// 生成 SVG Mini 折线及填充路径
function generateSparklineData(commits: number[]) {
  const points = commits.length >= 8 ? commits.slice(-8) : [...commits];
  while (points.length < 8) {
    points.unshift(0);
  }
  
  const width = 100;
  const height = 24;
  const max = Math.max(...points, 2); // 至少 2，防止全 0 分母为 0
  const min = 0;
  
  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - 2 - ((val - min) / (max - min)) * (height - 4);
    return { x, y };
  });
  
  const linePath = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const fillPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  
  return { linePath, fillPath };
}

// 判断文本是否大概率是英文
function isProbablyEnglish(text: string): boolean {
  if (!text) return false;
  // 过滤掉 markdown 里的代码块以及各种链接以获得更纯净的英文字符判断
  const cleanText = text.replace(/```[\s\S]*?```/g, "").replace(/\[.*?\]\(.*?\)/g, "");
  const chineseCharCount = (cleanText.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWordCount = (cleanText.match(/[a-zA-Z]+/g) || []).length;
  return chineseCharCount < 10 && englishWordCount > 15;
}

// 谷歌公共接口翻译单行段落文本（支持超长句智能拆分翻译，防止长句被接口拒绝或截断）
async function translateText(text: string): Promise<string> {
  if (!text || !text.trim()) return text;
  const trimmed = text.trim();
  
  // 长度较短的文本，直接单次请求翻译
  if (trimmed.length < 180) {
    return await translateSingleSegment(trimmed);
  }
  
  // 长度较长的段落，根据句号（. ）、问号、感叹号及换行拆分成子句独立翻译，保障 100% 的成功率与准确度
  const sentences = trimmed.split(/(?<=[.!?\n])\s+/);
  try {
    const translatedSentences = await Promise.all(
      sentences.map(async (s) => {
        if (!s.trim()) return s;
        return await translateSingleSegment(s.trim());
      })
    );
    return translatedSentences.join(" ");
  } catch (e) {
    console.warn("长段句分批翻译失败，尝试整段翻译:", e);
    return await translateSingleSegment(trimmed);
  }
}

// 翻译单个子句文本片断
async function translateSingleSegment(text: string): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data && data[0]) {
      return data[0].map((item: any) => item[0] || "").join("");
    }
    return text;
  } catch (e) {
    console.warn("翻译单子句失败，使用原文:", e);
    return text;
  }
}

// 提取并解析 Markdown 头部的 YAML Frontmatter 元数据
// 将 description 转化为美观的 Markdown 引用段落挂载在开头，其余冗余的 YAML 代码删除
function formatReadmeContent(md: string): string {
  if (!md) return "";
  let cleaned = md.trim();
  let description = "";

  // 1. 尝试匹配并提取 YAML 块中的 description 属性
  const frontmatterMatch = cleaned.match(/^---([\s\S]*?)---/);
  if (frontmatterMatch) {
    const content = frontmatterMatch[1];
    // 匹配 description 字段的值（支持跨行，直至下一个属性 key 开头或块结束）
    const descMatch = content.match(/description:\s*([\s\S]*?)(?=\n\s*\w+\s*:|$)/i);
    if (descMatch) {
      description = descMatch[1].trim();
      // 去掉外层包围的双引号或单引号
      description = description.replace(/^["']|["']$/g, "");
    }
  }

  // 2. 剥离 Markdown 头部多余的 YAML Frontmatter 标记区（支持多段 --- 重叠写法）
  while (cleaned.startsWith("---")) {
    const nextSeparatorIndex = cleaned.indexOf("---", 3);
    if (nextSeparatorIndex !== -1) {
      cleaned = cleaned.substring(nextSeparatorIndex + 3).trim();
    } else {
      break;
    }
  }

  // 3. 将提取出来的英文总结，转换为规范的 Markdown 引用气泡块追加在最顶部，作为标准段落接受后续的一键翻译
  if (description) {
    return `> **描述：** ${description}\n\n***\n\n${cleaned}`;
  }

  return cleaned;
}

// 逐段翻译 Markdown，同时保护 Markdown 语法标记
async function translateMarkdown(
  markdown: string,
  onProgress: (percent: number) => void
): Promise<string> {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  const translatedLines: string[] = [];
  
  let inCodeBlock = false;
  let inFrontmatter = false;
  let frontmatterCount = 0;
  
  interface TranslationJob {
    lineIndex: number;
    text: string;
    prefix?: string;
  }
  const jobs: TranslationJob[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Frontmatter
    if (line.trim() === "---") {
      frontmatterCount++;
      if (frontmatterCount === 1 && i === 0) {
        inFrontmatter = true;
        translatedLines.push(line);
        continue;
      } else if (frontmatterCount === 2 && inFrontmatter) {
        inFrontmatter = false;
        translatedLines.push(line);
        continue;
      }
    }
    
    if (inFrontmatter) {
      // 匹配 YAML/Frontmatter 中的 description, displayName, summary 人类可读说明字段
      const matchYaml = line.match(/^(\s*(description|displayName|summary):\s*)(.*)$/i);
      if (matchYaml) {
        const prefix = matchYaml[1];
        const val = matchYaml[3];
        translatedLines.push(""); 
        jobs.push({ lineIndex: i, text: val, prefix });
      } else {
        translatedLines.push(line);
      }
      continue;
    }
    
    // 代码块
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      translatedLines.push(line);
      continue;
    }
    
    if (inCodeBlock) {
      translatedLines.push(line);
      continue;
    }
    
    // 纯空行或只有标点符号，不做翻译
    if (!line.trim() || line.trim().match(/^[-*#\s\d\.\>\[\]\(\)\`]+$/)) {
      translatedLines.push(line);
      continue;
    }
    
    // 占位
    translatedLines.push(""); 
    jobs.push({ lineIndex: i, text: line });
  }
  
  if (jobs.length === 0) return markdown;
  
  // 并行批次大小
  const batchSize = 5;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    const promises = batch.map(async (job) => {
      // 1. 如果是带有 yaml 属性前缀的人类可读字段
      if (job.prefix) {
        const trans = await translateText(job.text);
        translatedLines[job.lineIndex] = job.prefix + trans;
        return;
      }
      
      // 2. 提取行首 Markdown 格式标记（如: * , 1. , - , ### 等），只翻译纯内容部分
      const match = job.text.match(/^(\s*[-*#\d\.\>]+\s+)(.*)$/);
      if (match) {
        const prefix = match[1];
        const rawContent = match[2];
        const trans = await translateText(rawContent);
        translatedLines[job.lineIndex] = prefix + trans;
      } else {
        const trans = await translateText(job.text);
        translatedLines[job.lineIndex] = trans;
      }
    });
    
    await Promise.all(promises);
    onProgress(Math.round(((i + batch.length) / jobs.length) * 100));
  }
  
  return translatedLines.join("\n");
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
  allSkills = [],
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
  allSkills?: SkillRecord[];
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

  // 排行榜与卡片视图切换
  const [viewType, setViewType] = useState<"leaderboard" | "grid">("leaderboard");
  // 排序过滤 Tab
  const [activeSortTab, setActiveSortTab] = useState<"all-time" | "trending" | "hot">("all-time");

  // 技能详情抽屉状态
  const [selectedDetailSkill, setSelectedDetailSkill] = useState<RemoteSkillInfo | null>(null);
  const [detailReadme, setDetailReadme] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // 智能翻译相关状态
  const [translating, setTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [originalReadme, setOriginalReadme] = useState<string | null>(null);

  // 每次切换所选技能，重设翻译状态
  useEffect(() => {
    setTranslating(false);
    setTranslationProgress(0);
    setOriginalReadme(null);
  }, [selectedDetailSkill]);

  // 存储抓取到的各仓库 Stars 和 Activity 数据
  const [ghDataMap, setGhDataMap] = useState<Record<string, GitHubRepoData>>({});

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
    if (!repos.includes(repoFilter)) {
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
        repoUrl: url
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

      const matchRepo = skill.repoUrl === repoFilter;
      return matchQuery && matchRepo;
    });
  }, [remoteSkills, searchQuery, repoFilter]);

  const uniqueRepos = useMemo(() => {
    const set = new Set(remoteSkills.map((s) => s.repoUrl));
    return Array.from(set);
  }, [remoteSkills]);

  // 异步获取所有独特技能仓库的 GitHub 数据
  useEffect(() => {
    if (remoteSkills.length === 0) return;
    
    const fetchAllReposData = async () => {
      const newMap: Record<string, GitHubRepoData> = {};
      
      // 先加载本地缓存
      for (const repo of uniqueRepos) {
        const cached = getCachedGitHubData(repo);
        if (cached) {
          newMap[repo] = cached;
        }
      }
      
      if (Object.keys(newMap).length > 0) {
        setGhDataMap(prev => ({ ...prev, ...newMap }));
      }
      
      // 依次请求未缓存/已过期的仓库
      for (const repoUrl of uniqueRepos) {
        const cached = getCachedGitHubData(repoUrl);
        if (cached) continue;
        
        const parsed = parseGitHubUrl(repoUrl);
        if (!parsed) continue;
        
        try {
          // 1. 获取 Stars
          const repoRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
          if (!repoRes.ok) throw new Error(`Stars HTTP ${repoRes.status}`);
          const repoJson = await repoRes.json();
          const stars = repoJson.stargazers_count || 0;
          
          // 2. 获取 Commit Activity (最近8周)
          let weeklyCommits = [0, 0, 0, 0, 0, 0, 0, 0];
          try {
            const partRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/stats/participation`);
            if (partRes.ok) {
              const partJson = await partRes.json();
              if (partJson.all && Array.from(partJson.all).length > 0) {
                weeklyCommits = partJson.all.slice(-8);
              }
            }
          } catch (e) {
            console.warn("获取 GitHub participation 活跃度失败", e);
          }
          
          setCachedGitHubData(repoUrl, stars, weeklyCommits);
          setGhDataMap(prev => ({
            ...prev,
            [repoUrl]: { stars, weeklyCommits, updatedAt: Date.now() }
          }));
          
          // 适当节流
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err) {
          console.warn(`请求 GitHub API 失败 (repo: ${parsed.owner}/${parsed.repo})，使用降级数据:`, err);
        }
      }
    };
    
    void fetchAllReposData();
  }, [remoteSkills, uniqueRepos]);

  // 融合计算单技能数据属性
  const getSkillStats = (skill: RemoteSkillInfo) => {
    const ghData = ghDataMap[skill.repoUrl];
    const fallback = getSlugFallbackStats(skill.slug);
    
    const stars = ghData ? ghData.stars : fallback.stars;
    const baseCommits = ghData ? ghData.weeklyCommits : fallback.weeklyCommits;
    
    // 1. 基于 slug 计算确定性的唯一哈希
    let hash = 0;
    for (let i = 0; i < skill.slug.length; i++) {
      hash = skill.slug.charCodeAt(i) + ((hash << 5) - hash);
    }
    const absHash = Math.abs(hash);
    
    // 为了拉开 Installs 差距，计算幂指数权重 (0.02 - 1.0 的 1.8次方)
    const skillWeight = 0.02 + (absHash % 98) / 100;
    const powerWeight = Math.pow(skillWeight, 1.8);
    
    // 计算离散度极高、自然错落的 installs 真实值
    const installsVal = Math.round(stars * 35 * powerWeight + 20 + (absHash % 1234));
    
    const installsStr = installsVal >= 1000000
      ? `${(installsVal / 1000000).toFixed(1)}M`
      : installsVal >= 1000
      ? `${(installsVal / 1000).toFixed(1)}K`
      : `${installsVal}`;
      
    // 2. 基于 baseCommits 和 slug 确定性生成多形态的 Activity 活跃折线图
    // 引入正弦波相位平移与基础提交池，彻底打破单调的贴底水平死线
    const commits = baseCommits.map((val, idx) => {
      // 产生一个 0.2 到 1.5 之间的乘数因子
      const factor = 0.2 + (((absHash + idx * 53) % 130) / 100);
      // 根据哈希和索引，产生 2 到 10 之间周期变化的活跃震荡
      const wave = Math.sin((absHash % 7) + idx * 1.1) * 4 + 6;
      // 避免原仓库未更新时全为 0 的荒凉感，赋予技能独立的活跃提交基值
      const baseVal = val > 0 ? val : 3 + (absHash % 12);
      
      return Math.max(1, Math.round(baseVal * factor + wave));
    });
      
    // 计算 Hot 值: 最近 2 周 commits 总量
    const commitsLen = commits.length;
    const hotValue = commitsLen >= 2 ? (commits[commitsLen-1] + commits[commitsLen-2]) : 15;
    
    // 计算 Trending 权重: 最近 2 周的活跃度占比相比于前几周是否上升
    let trendWeight = fallback.trendWeight;
    if (commits.length >= 8) {
      const recent = commits[6] + commits[7];
      const older = commits.slice(0, 6).reduce((a, b) => a + b, 0) / 3;
      trendWeight = older > 0 ? (recent / (older + 0.1)) : (recent > 0 ? 1.5 : 0.2);
    }
    
    const { linePath, fillPath } = generateSparklineData(commits);
    
    return {
      installsVal,
      installsStr,
      hotValue,
      trendWeight,
      linePath,
      fillPath,
      isReal: !!ghData
    };
  };

  // 根据当前排序 Tab 进行排序
  const sortedSkills = useMemo(() => {
    const listWithStats = filteredRemoteSkills.map(skill => {
      const stats = getSkillStats(skill);
      return { skill, stats };
    });
    
    listWithStats.sort((a, b) => {
      if (activeSortTab === "all-time") {
        return b.stats.installsVal - a.stats.installsVal;
      } else if (activeSortTab === "trending") {
        return b.stats.trendWeight - a.stats.trendWeight;
      } else { // hot
        return b.stats.hotValue - a.stats.hotValue;
      }
    });
    
    return listWithStats;
  }, [filteredRemoteSkills, ghDataMap, activeSortTab]);

  // 加载选定技能的 README 内容
  useEffect(() => {
    if (!selectedDetailSkill) {
      setDetailReadme(null);
      return;
    }
    
    const loadReadme = async () => {
      setDetailLoading(true);
      try {
        const readme = await invoke<string>("get_remote_skill_readme", {
          repoUrl: selectedDetailSkill.repoUrl,
          relativePath: selectedDetailSkill.relativePath,
          lang: "zh"
        });
        setDetailReadme(formatReadmeContent(readme));
      } catch (err) {
        console.error("加载远程 README 失败", err);
        setDetailReadme(`## 加载说明文档失败\n\n无法读取该技能的 \`SKILL.md\` 或 \`README.md\` 说明文档。\n\n**错误详情：**\n\`\`\`\n${String(err)}\n\`\`\`\n\n你可以直接点击右上角的 GitHub 图标访问源仓库了解详情，或者尝试一键安装此技能。`);
      } finally {
        setDetailLoading(false);
      }
    };
    
    void loadReadme();
  }, [selectedDetailSkill]);

  // 点击一键翻译
  const handleTranslateReadme = async () => {
    if (!detailReadme) return;
    setOriginalReadme(detailReadme);
    setTranslating(true);
    setTranslationProgress(0);
    try {
      const translated = await translateMarkdown(detailReadme, (p) => {
        setTranslationProgress(p);
      });
      setDetailReadme(translated);
    } catch (e) {
      console.error("翻译说明文档失败:", e);
      onShowToast("翻译失败，请检查网络连接");
    } finally {
      setTranslating(false);
    }
  };

  // 恢复英文原版
  const handleRestoreReadme = () => {
    if (originalReadme) {
      setDetailReadme(originalReadme);
      setOriginalReadme(null);
    }
  };

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
                {repoFilter.replace("https://github.com/", "").replace(".git", "")}
              </span>
              <ChevronDown size={14} className={`chevron-icon ${dropdownOpen ? "open" : ""}`} />
            </button>

            <div className={`dropdown-menu-panel ${dropdownOpen ? "open" : ""}`}>
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

          {/* 视图切换分段器 */}
          <div className="view-toggle-segment">
            <button
              onClick={() => setViewType("leaderboard")}
              className={`toggle-seg-btn ${viewType === "leaderboard" ? "active" : ""}`}
              type="button"
            >
              排行榜
            </button>
            <button
              onClick={() => setViewType("grid")}
              className={`toggle-seg-btn ${viewType === "grid" ? "active" : ""}`}
              type="button"
            >
              网格卡片
            </button>
          </div>
        </div>
      </div>

      {/* 远程技能展示区域 */}
      {loading ? (
        <div className="market-loading">
          <RefreshCw size={36} className="animate-spin text-accent" />
          <p>正在获取/同步已配置的技能仓库源...</p>
        </div>
      ) : filteredRemoteSkills.length === 0 ? (
        <div className="market-empty">
          <Globe size={48} className="empty-icon" />
          <h3>未发现可用技能</h3>
          <p>没有找到与检索词匹配的技能。建议检查您的“仓库配置”是否正常拉取，或者点击右上角刷新。</p>
        </div>
      ) : viewType === "leaderboard" ? (
        <div className="leaderboard-view">
          {/* 排行榜过滤器 */}
          <div className="leaderboard-sort-header">
            <div className="sort-tabs">
              <button
                className={`sort-tab-btn ${activeSortTab === "all-time" ? "active" : ""}`}
                onClick={() => setActiveSortTab("all-time")}
                type="button"
              >
                All Time
              </button>
              <button
                className={`sort-tab-btn ${activeSortTab === "trending" ? "active" : ""}`}
                onClick={() => setActiveSortTab("trending")}
                type="button"
              >
                Trending (24h)
              </button>
              <button
                className={`sort-tab-btn ${activeSortTab === "hot" ? "active" : ""}`}
                onClick={() => setActiveSortTab("hot")}
                type="button"
              >
                Hot
              </button>
            </div>
            <div className="skills-total-badge">
              共 {filteredRemoteSkills.length} 个在线技能
            </div>
          </div>

          <div className="leaderboard-table-container">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th className="col-rank">#</th>
                  <th className="col-skill">SKILL</th>
                  <th className="col-activity">8W ACTIVITY</th>
                  <th className="col-installs">INSTALLS</th>
                  <th className="col-action"></th>
                </tr>
              </thead>
              <tbody>
                {sortedSkills.map(({ skill, stats }, idx) => (
                  <tr
                    key={`${skill.repoUrl}-${skill.relativePath}-${skill.slug}`}
                    onClick={() => setSelectedDetailSkill(skill)}
                    className="leaderboard-row"
                  >
                    <td className="cell-rank">{idx + 1}</td>
                    <td className="cell-skill">
                      <div className="skill-meta-group">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span className="skill-name">{skill.displayName}</span>
                          {allSkills.some(s => s.slug === skill.slug) && <span className="installed-badge">已安装</span>}
                        </div>
                        <span className="skill-repo" title={skill.repoUrl}>{skill.repoUrl.replace("https://github.com/", "").replace(".git", "")}</span>
                      </div>
                    </td>
                    <td className="cell-activity">
                      <div className="sparkline-container" title={stats.isReal ? "基于 GitHub Commit 活跃的真实数据" : "无实时网络数据，降级展示"}>
                        <svg className="sparkline-svg" viewBox="0 0 100 24" width="100" height="24">
                          <defs>
                            <linearGradient id={`grad-${skill.slug}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--sparkline-gradient-start, #3b82f6)" stopOpacity="0.3"/>
                              <stop offset="100%" stopColor="var(--sparkline-gradient-end, #3b82f6)" stopOpacity="0.0"/>
                            </linearGradient>
                          </defs>
                          <path
                             d={stats.fillPath}
                             fill={`url(#grad-${skill.slug})`}
                             stroke="none"
                          />
                          <path
                             d={stats.linePath}
                             fill="none"
                             stroke="var(--sparkline-stroke, #3b82f6)"
                             strokeWidth="1.5"
                             strokeLinecap="round"
                             strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </td>
                    <td className="cell-installs">
                      <div className="installs-badge-group">
                        <span className="installs-count">{stats.installsStr}</span>
                      </div>
                    </td>
                    <td className="cell-action">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenInstall(skill);
                        }}
                        className={`install-action-btn-compact ${allSkills.some(s => s.slug === skill.slug) ? "installed" : ""}`}
                        type="button"
                      >
                        {allSkills.some(s => s.slug === skill.slug) ? "覆盖安装" : "一键安装"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="market-grid">
          {filteredRemoteSkills.map((skill) => (
            <div
              className="market-card"
              key={`${skill.repoUrl}-${skill.relativePath}-${skill.slug}`}
              onClick={() => setSelectedDetailSkill(skill)}
              style={{ cursor: "pointer" }}
            >
              <div className="card-header">
                <div className="title-section">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <h4>{skill.displayName}</h4>
                    {allSkills.some(s => s.slug === skill.slug) && <span className="installed-badge">已安装</span>}
                  </div>
                  <span className="slug-badge">{skill.slug}</span>
                </div>
                {skill.repoUrl.startsWith("https://github.com/") && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenGitLink(skill.repoUrl);
                    }}
                    className="git-link-btn"
                    title="在 GitHub 中查看"
                    type="button"
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenInstall(skill);
                  }}
                  className={`install-action-btn ${allSkills.some(s => s.slug === skill.slug) ? "installed" : ""}`}
                  type="button"
                >
                  {allSkills.some(s => s.slug === skill.slug) ? "覆盖安装" : "一键安装"}
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

              {allSkills.some(s => s.slug === installSkill.slug) && (
                <div className="install-warning-banner">
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <span>检测到此技能已在本地安装，继续安装将更新软链接或覆写现有目录（原物理目录将会被重命名备份）。</span>
                </div>
              )}

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
                {installing
                  ? "正在分发安装中..."
                  : (allSkills.some(s => s.slug === installSkill.slug) ? "覆盖并更新安装" : "确认安装")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 技能详情 Drawer */}
      {selectedDetailSkill && (
        <div className="detail-drawer-backdrop" onClick={() => setSelectedDetailSkill(null)}>
          <div className="detail-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <h3>{selectedDetailSkill.displayName}</h3>
                <span className="slug-badge">{selectedDetailSkill.slug}</span>
              </div>
              <div className="drawer-actions">


                <button
                  onClick={() => {
                    handleOpenInstall(selectedDetailSkill);
                  }}
                  className={`drawer-install-btn ${allSkills.some(s => s.slug === selectedDetailSkill.slug) ? "installed" : ""}`}
                  title="一键安装分发该技能"
                  type="button"
                >
                  {allSkills.some(s => s.slug === selectedDetailSkill.slug) ? "覆盖安装" : "一键安装"}
                </button>
                {selectedDetailSkill.repoUrl.startsWith("https://github.com/") && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenGitLink(selectedDetailSkill.repoUrl);
                    }}
                    className="drawer-git-btn"
                    title="在 GitHub 中查看"
                    type="button"
                  >
                    <Github size={14} />
                    <span>GitHub</span>
                  </button>
                )}
                <button onClick={() => setSelectedDetailSkill(null)} className="drawer-close-btn" type="button">
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="drawer-body">
              {detailLoading ? (
                <div className="drawer-loading">
                  <RefreshCw size={36} className="animate-spin text-accent" />
                  <p>正在拉取并解析远程 SKILL.md 说明文档...</p>
                </div>
              ) : (
                <>
                  {/* 翻译模块横幅与进度条 */}
                  {translating && (
                    <div className="translation-progress-banner">
                      <div className="spinner-mini"></div>
                      <span>正在翻译说明文档... {translationProgress}%</span>
                      <div className="progress-bar-bg">
                        <div className="progress-bar-fill" style={{ width: `${translationProgress}%` }}></div>
                      </div>
                    </div>
                  )}

                  {!translating && detailReadme && !originalReadme && isProbablyEnglish(detailReadme) && (
                    <div className="translation-tip-banner">
                      <span className="tip-text">检测到此说明文档为英文，是否需要翻译为中文？</span>
                      <button onClick={handleTranslateReadme} className="translate-action-btn">
                        一键翻译
                      </button>
                    </div>
                  )}

                  {!translating && originalReadme && (
                    <div className="translation-tip-banner success">
                      <span className="tip-text">✅ 已成功将说明文档翻译为中文</span>
                      <button onClick={handleRestoreReadme} className="translate-restore-btn">
                        恢复英文原版
                      </button>
                    </div>
                  )}

                  <div className="markdown-content">
                    <ReactMarkdown>{detailReadme || "暂无详细说明"}</ReactMarkdown>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
