<div align="center">
  <img src="agent-icons/m-my-skills-logo.png" alt="Manage My skills" width="120" />
  <h1>Manage My skills</h1>
  <p><b>跨平台的 AI Agent Skills 统一管理与安全同步工作台</b></p>
  <p>支持 Windows & macOS ｜ 适用于 Claude Code, Cursor, Windsurf, Zed, Trae, Codex 等 20+ 编码助理</p>
</div>

**Manage My skills** 是一个极具设计感、跨平台的本地 Agent Skills 统一管理工具，帮助你在 Claude Code、Cursor、Windsurf、Zed、Codex、Trae 等多个 AI 编码工具之间，一键发现、比对、安全同步和健康诊断你的 Skills，避免优质技能散落各处。

所有文件与链接的变更都经过「预览 → 确认 → 异步执行」流程，由高性能的 Rust 后端负责底层的磁盘与进程操作，安全可控、极速响应。

## 🖼️ 界面预览 (Screenshots)

<details open>
<summary>💡 点击展开查看全部 9 张功能截图</summary>

### 1. Skills 管理 & 工作区

|                                        全局工作区 (Global)                                         |                                        项目工作区 - 初始状态 (Project)                                        |
| :------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------: |
| ![全局工作区](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-49-59.png) | ![项目工作区 - 初始状态](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-50-10.png) |

### 2. 发现技能商店 & 分发流程

|                                         技能商店 (Store)                                         |                                     技能分发 - Agent 选择 (Distribution)                                      |
| :----------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------: |
| ![技能商店](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-51-03.png) | ![技能分发 - Agent 选择](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-51-14.png) |

|                                             技能分发 - 生效范围与方式                                             |                                             Git 仓库源配置                                             |
| :---------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------: |
| ![技能分发 - 生效范围与方式](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-51-20.png) | ![Git 仓库源配置](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-51-33.png) |

### 3. 系统配置 & 环境健康度

|                                       数据与窗口设置 (Settings)                                        |                                             自定义 Agent 注册                                             |
| :----------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------: |
| ![数据与窗口设置](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-50-18.png) | ![自定义 Agent 注册](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-50-26.png) |

|                                             关于我们 & 环境健康检查                                             |
| :-------------------------------------------------------------------------------------------------------------: |
| ![关于我们 & 环境健康检查](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-50-34.png) |

</details>

---

## 🌟 特性

- **多平台原生体验与窗口行为**：
  - **macOS**：完美的毛玻璃半透明窗口设计。
  - **Windows**：深度适配 Windows 11/10，支持 Mica (云母) 与 Acrylic (亚克力) 原生磨砂特效，完全自适应系统效果。
  - **系统级托盘与窗口行为**：提供精美的系统级托盘菜单，支持通过左键点击一键呼出；支持设置开机自启、静默启动（仅托盘运行）以及关闭时最小化到托盘以常驻后台。
- **Agent 图标与状态自动发现**：开机自动扫描并盘点本机所有已安装的 AI 编码工具及其内置/外置的 Skills 目录。
- **智能、无感、安全的同步引擎**：
  - 支持 **全局 (Global)** 和 **项目级 (Project)** 作用域同步。
  - 核心功能在启用/停用同步时自动识别同名物理目录，若内容不一致则采用**时间戳重命名安全备份机制**（`[目录名].bak_YYYYMMDD_HHMMSS`），确保你的开发源码 100% 安全。
  - 深度支持 **Windows 符号链接 (Symlink)** 机制，且自动兼容 Windows 大小写不敏感文件系统中的大小写纠错与两步重命名，消除自删除 Bug。
- **极速 Git 持久缓存与更新检查**：
  - **并发限制队列**：前端采用 Worker 并发数限制为 3 的工作队列机制，有效消除网络和主渲染线程的拥堵，页面操作（如 Tab 切换）如丝般顺滑。
  - **后端哈希缓存**：每个唯一的远程 Git URL 统一哈希并独立缓存在本地 `app_data_dir/cache/repos/` 中。
  - **10秒防冲突锁 + 增量 fetch**：10 秒内的重复请求直接读取本地缓存，超过 10 秒则仅拉取 `git fetch --depth 1` 并重置，将更新检查从原本的数分钟瞬间优化到 **秒级** 响应。
- **精细的更新状态与一键升级**：
  - 详情页内联展示技能的最新版本状态（`checking` / `available` / `current` / `check-failed`）。
  - **直观的报错卡片**：如果 Git 检查更新失败，将在详情中直接呈现淡红色的详细日志卡片，不用再悬浮看 Tooltip。
  - 手动强刷按钮与重新扫描、Toast 完成提示一应俱全。
- **问题诊断**：自动检测孤儿目录、损坏的软链接、重名命名冲突、SKILL.md 元数据缺失等，提供一键重命名修复。

---

## 🛠️ 支持的 Agent 编码助理

- **Claude Code** (`.claude/skills/`)
- **Cursor** (`.cursor/skills/`)
- **Zed** (`.zed/skills/`)
- **Windsurf** (`.windsurf/skills/`)
- **Codex** (`.codex/skills/`)
- **Trae**, **Cline**, **Gemini CLI**, **GitHub Copilot**, **OpenCode**, **Warp**, **Qoder**, **Antigravity**, **Augment** 等 20+ 工具。

---

## 🚀 安装

### macOS

1. 从 GitHub Releases 下载最新的 `Manage My skills_*.dmg`。
2. 双击打开并拖入「应用程序」文件夹。
3. 首次启动可能需要在「系统设置 → 隐私与安全性」中手动允许。

### Windows

1. 下载打包好的安装包或便携版 `.exe` 运行即可。
2. _注意：在 Windows 上使用软链接（Symlink）同步时，请以管理员身份运行应用，或在 Windows 系统中开启「开发人员模式」（Developer Mode）。_

---

## 🏗️ 从源码构建与开发

### 前置要求

- **Node.js** ≥ 18
- **Rust**（推荐通过 rustup 安装）

### 启动开发环境

```bash
git clone https://github.com/你的用户名/manage-my-skills.git
cd manage-my-skills
npm install

# 启动开发服务器（包含前端 HMR 和 Rust 热重载）
npm run tauri:dev
```

### 运行测试

```bash
# 仅前端
npm run dev

# 运行 Rust 单元测试
npm run test:rust

# 完整冒烟测试（执行打包构建校验 + 运行全部测试用例）
npm run smoke
```

### 本地编译打包

编译生产环境安装包（会自动生成符合当前系统平台的文件）：

```bash
npm run tauri:build
```

打包输出路径位于 `src-tauri/target/release/bundle/` 下的对应平台目录。

#### 一键升级版本号并打包（自动化脚本）

我们提供了一个高度容错的自动化打包脚本，会自动完成 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 中版本号的同步更新并拉起打包：

```bash
# 以 x.x.x 版本为例进行一键更新与构建
npm run release -- 0.2.2
```

**💡 密钥配置说明：**

- **若需要发布签名更新包**：请在项目根目录下创建 `.env` 文件（已被 `.gitignore` 保护拦截），写入您的私钥和解密密码：
  ```env
  TAURI_SIGNING_PRIVATE_KEY="您的私钥内容"
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="您的私钥密码"
  ```
- **无密钥本地构建模式**：如果本地没有检测到签名私钥，脚本会自动以「无签名更新包」的本地开发模式进行打包并自动还原配置，绝对不会发生因缺少签名密钥而编译报错中断的情况。

---

## 📡 自动化 CI 部署

项目在 `.github/workflows/ci.yml` 中集成了 GitHub Actions：

- 每次提交代码或提交 PR 到 `main` 分支时，自动运行 TypeScript 类型校验、前端静态构建与 Rust 测试。
- 后续配合发布 Tag 标签即可自动构建 Windows / macOS 双端 Release 发布包，并将产物自动上传到 GitHub Releases 中，方便用户开箱即用。

---

## 💻 技术栈

- **前端 (Frontend)**：React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Radix UI
- **客户端 (Client)**：Tauri v2 (Rust)
- **核心逻辑 (Core)**：Rust (`walkdir`, `serde` 序列化映射, `tokio` 异步执行与多线程底层分流)
- **设计原则 (Design)**：Quiet & Native 桌面级效率工具风格

---

## 💬 交流与支持

欢迎加入 AI 交流群（QQ群：1091305103），点击链接加入群聊【AI交流群】：https://qm.qq.com/q/z5iGv1PUoU，反馈问题、交流使用体验或提出新功能建议。

如果 **Manage My Skills** 帮到了你，可以请我喝杯咖啡，或者随手赞赏支持一下继续维护：

| <img src="https://anta.obs.cn-south-1.myhuaweicloud.com/icon/wechat111.jpg" width="200" alt="微信赞赏" /> | <img src="https://anta.obs.cn-south-1.myhuaweicloud.com/icon/zhifubao.jpg" width="200" alt="支付宝赞赏" /> |

---

## 🔗 社区关联与致谢 (Community Links)

该开源项目与 LINUX DO 社区相关联并获得其认可：

- **LINUX DO**：https://linux.do/

---

**Manage My skills** — 让你的 AI 编码技能融会贯通，不再散落各处。
