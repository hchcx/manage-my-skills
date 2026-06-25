<div align="center">
  <img src="agent-icons/m-my-skills-logo.png" alt="Manage My skills" width="120" />
  <h1>Manage My skills</h1>
  <p><b>Cross-platform desktop workbench to manage and safely sync AI Agent Skills</b></p>
  <p>Supports Windows & macOS ｜ Built for Claude Code, Cursor, Windsurf, Zed, Trae, Codex, and 20+ tools</p>
</div>

**Manage My skills** is a beautiful, cross-platform desktop workbench designed to discover, compare, adopt, and safely sync Agent Skills across major AI coding assistants including Claude Code, Cursor, Windsurf, Zed, Trae, Codex, and many others.

All filesystem mutations go through a strict **Preview → Confirm → Async Apply** flow. The core logic is powered by a high-performance Rust backend for maximum safety, speed, and responsiveness.

## 🖼️ Screenshots

<details open>
<summary>💡 Click to expand and view all 11 screenshots</summary>

### 1. Skills Management & Workspaces

|                                             Global Workspace                                             |                                             Project Workspace - Initial State                                             |
| :------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------: |
| ![Global Workspace](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-49-59.png) | ![Project Workspace - Initial State](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-50-10.png) |

### 2. Discover Skill Store & Distribution Flow

|                                             Online Skill Store - Leaderboard View (Rank)                                             |                                             Skill Details & Chinese Translation (Detail)                                             |
| :----------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------: |
| ![Skill Store Leaderboard](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/rank.png) | ![Skill Translation Details](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/skills-detail.png) |

|                                             Online Skill Store - Grid View (Store)                                             |                                             Distribution - Agent Selection                                             |
| :--------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------: |
| ![Online Skill Store](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-51-03.png) | ![Distribution - Agent Selection](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-51-14.png) |

|                                             Distribution - Scope & Target Methods                                             |                                             Git Repository Source Manager                                             |
| :---------------------------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------------------: |
| ![Distribution - Scope & Target Methods](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-51-20.png) | ![Git Repository Source Manager](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-51-33.png) |

### 3. System Configurations & Environment Check

|                                             Data & Window Preferences                                             |                                             Custom Agent Registry                                             |
| :---------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------: |
| ![Data & Window Preferences](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-50-18.png) | ![Custom Agent Registry](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-50-26.png) |

|                                             About & Environment Health Checkup                                             |
| :------------------------------------------------------------------------------------------------------------------------: |
| ![About & Environment Health Checkup](https://anta.obs.cn-south-1.myhuaweicloud.com/icon/Snipaste_2026-06-24_20-50-34.png) |

</details>

---

## 🌟 Features

- **Cross-Platform Native Styling & Window Behaviors**:
  - **macOS**: Beautiful frosted glass translucent window styling.
  - **Windows**: Deep integration with Windows 11/10. Uses highly compatible solid-color elegant light grey backgrounds to completely avoid "completely transparent/hollow window" rendering bugs on low-end or customized OS graphics configurations.
  - **System Tray & Window Controls**: Provides a polished system tray menu to toggle visibility via single left-click. Supports setting autostart, silent launching (tray-only backend start), and minimizing to tray instead of quitting on close.
- **Automatic Agent Discovery**: Automatically scans and lists all installed AI coding assistants and their global/project-level Skills directories.
- **Smart & Safe Sync Engine**:
  - Supports both **Global** and **Project** workspace scopes.
  - **Safety Backups**: If a physical folder conflicts with a symlink target during activation or deactivation, it automatically performs a timestamped backup (`[Folder].bak_YYYYMMDD_HHMMSS`) instead of throwing errors or destroying code.
  - **Windows Symlinks & Case Correction**: Deep support for Windows symlink configurations and two-step renaming hacks to avoid case-sensitivity issues and self-deletion bugs on Windows file systems.
- **High-Performance Git Caching & Updates**:
  - **Worker Queue Limiter**: Limits concurrent network requests to 3 to prevent CPU and connection spikes, keeping UI interactions (like switching tabs) smooth.
  - **Repo SHA-256 Hashing**: Repositories are persistently mapped and cached by Git URLs inside `app_data_dir/cache/repos/`.
  - **10-Second Deduplication Lock + Incremental Fetching**: Repetitive check requests within 10 seconds reuse cache. Beyond 10 seconds, it uses shallow `git fetch --depth 1` + hard reset, slashing check times from minutes down to **seconds**.
- **Skill Leaderboards & Document Translation**:
  - **Multi-Dimensional Rankings**: Supports toggling between "Leaderboard" and "Grid Card" views. Under the leaderboard view, online skills are ranked by All Time, Trending (24h), and Hot categories, showing 8-week activity trends sparklines and download statistics.
  - **Inline Translation**: Built-in document translator in the detail panel to translate English skill READMEs to Chinese with one click, supporting seamless reversion to English.
- **Precise Update Statuses**:
  - Inline tracking of remote repository versions (`checking` / `available` / `current` / `check-failed`).
  - **Detailed Error Cards**: If a Git check fails, detailed Rust/Git error logs are presented directly inline on a soft red warning card.
- **Troubleshooting & Fixes**: Detects orphaned directories, broken symlinks, mismatched frontmatter names, and missing metadata with one-click naming alignments.

---

## 🛠️ Supported AI Coding Assistants

- **Claude Code** (`.claude/skills/`)
- **Cursor** (`.cursor/skills/`)
- **Zed** (`.zed/skills/`)
- **Windsurf** (`.windsurf/skills/`)
- **Codex** (`.codex/skills/`)
- **Trae**, **Cline**, **Gemini CLI**, **GitHub Copilot**, **OpenCode**, **Warp**, **Qoder**, **Antigravity**, **Augment** and 20+ other tools.

---

## 🚀 Installation

### macOS

1. Download the latest `Manage My skills_*.dmg` from GitHub Releases.
2. Double-click and drag the application to your `Applications` folder.
3. On first launch, you might need to approve it under **System Settings → Privacy & Security**.

### Windows

1. Download the `.exe` installer or portable executable and run it.
2. _Note: Using Symlink syncing on Windows requires running the application as Administrator OR turning on "Developer Mode" in your Windows Settings._

---

## 🏗️ Build & Development

### Prerequisites

- **Node.js** ≥ 18
- **Rust** (installed via rustup)

### Getting Started

```bash
git clone https://github.com/your-username/manage-my-skills.git
cd manage-my-skills
npm install

# Start development build with frontend HMR and Rust hot reload
npm run tauri:dev
```

### Running Tests

```bash
# Frontend only
npm run dev

# Run Rust unit tests
npm run test:rust

# Full smoke test (build validation + runs all test suites)
npm run smoke
```

### Compiling Production Binaries

To build installers for your current platform:

```bash
npm run tauri:build
```

Build files will be generated under `src-tauri/target/release/bundle/`.

#### One-Click Version Bumping & Compiling (Automation Script)

We provide an automated, error-tolerant publishing script that synchronizes the version string across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, then triggers compilation:

```bash
# Example: Bump to 0.2.3 and build
npm run release -- 0.2.3
```

**💡 Encryption & Signing Keys Setup:**

- **To generate signed updater artifacts**: Create a `.env` file at the project root (automatically ignored by `.gitignore`), then configure your signing credentials:
  ```env
  TAURI_SIGNING_PRIVATE_KEY="YOUR_PRIVATE_KEY_CONTENT"
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="YOUR_PASSWORD"
  ```
- **Local Unsigned Build Mode**: If no private key is detected, the script will temporarily disable `createUpdaterArtifacts` in a clone profile and compiled unsigned executables successfully without crashing. It then restores your configuration back automatically.

---

## 📡 CI/CD Pipeline

The project features integration with GitHub Actions via `.github/workflows/ci.yml`:

- Runs TypeScript type checks, Vite production build, and Rust tests automatically on every PR or push to the `main` branch.
- Automates release compiles for Windows/macOS upon pushing tags, uploading release bundles straight to GitHub Releases.

---

## 💻 Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Radix UI
- **Desktop Runtime**: Tauri v2 (Rust)
- **Core Systems**: Rust (`walkdir`, `serde` serialization, `tokio` multi-threaded async pooling)
- **Design Language**: Quiet, high-density, native tool experience

---

## 📅 Changelog

### v0.2.3 (2026-06-25)

- **⚡ Launch Experience & Jitter Elimination**:
  - Implemented an `app_ready` IPC feedback channel. The app window is shown only when the static Webview layout is fully painted, eliminating the launch flash-of-white.
  - Added a high-fidelity shimmer effect Skeleton Loading screen covering the async state window, resolving layout leaps between caching phases.
- **⚙️ UI Cleanups**:
  - Removed translation toggles, unifying the primary UI to standard simplified Chinese.
  - Trimmed the "All Repositories" selection dropdown from the Discovery tab to simplify user flows.
- **🔧 Development & Stability**:
  - Fine-tuned Tauri configs to native hot module replacement (HMR) during `tauri dev`.
  - Strengthened adoption conflict protections for existing folders.

### v0.2.2 (2026-06-24)

- **🌐 Community & Docs**:
  - Integrated official QQ Community Chat Group quick-links and Sponsorship banners.
  - Added the LINUX DO community appreciation section.
  - Replaced all local screenshot relative assets in READMEs with high-speed OBS cloud links, setting image previews to default-expanded.
- **🐛 Bug Fixes**:
  - Fixed edge-case Windows path string parsing issues.

### v0.2.1 (2026-06-24)

- **🖥️ CLI Console Window Suppressed**:
  - Completely resolved the Windows issue where launching external processes (e.g., Node/Git) or clicking Preference buttons would briefly flash terminal console command boxes.
- **🎨 Layouts & Diagnostic Tools**:
  - Redesigned setting panels layouts and responsive margins.
  - Added collision diagnostics for duplicated custom Agent scopes; allowed clearing designated trash bins.

### v0.1.1 (2026-06-23)

- **🔔 System Tray & Autostart**:
  - Introduced desktop autostart, silent launching (starting as tray minimized icon), and minimize-to-tray-on-close controls.
  - Integrated Tauri v2 official auto-updater mechanisms.
- **⚙️ CI/CD & Bumping Scripts**:
  - Suppressed debug console windows in release packages.
  - Authored release bumping helper scripts and GitHub Actions pipeline workflows to compile Windows (NSIS) and macOS installers.

### v0.1.0 (2026-06-23)

- **🎉 Initial Release**:
  - Core features ready: agent scanners, multi-scope skill management, symlink sync hooks, and timestamped directory backups (`.bak`).
  - **🔬 WebView Drag & Drop Fix**: Solved the notorious drag-and-drop interruption bugs inside Windows WebView2 by introducing local React list states and pointer-events-none handle bypasses.
  - **💬 Custom Bubble Confirms**: Bypassed WebView blockades on native confirm popups by implementing sleek inline bubble confirmations.

---

## 💬 Community & Support

You are welcome to join the AI Community Group (QQ Group: 1091305103, Click link to join group chat: https://qm.qq.com/q/z5iGv1PUoU) to submit issues, share feedback, or suggest new features.

If **Manage My Skills** has been helpful to you, feel free to buy me a coffee or show some support to keep the maintenance going:

| <img src="https://anta.obs.cn-south-1.myhuaweicloud.com/icon/wechat111.jpg" width="200" alt="WeChat Pay" /> | <img src="https://anta.obs.cn-south-1.myhuaweicloud.com/icon/zhifubao.jpg" width="200" alt="Alipay" /> |

---

## 🔗 Community Links

This open-source project is linked with and recognized by the LINUX DO community:

- **LINUX DO**: https://linux.do/

---

**Manage My skills** — Stop letting your AI Agent Skills scatter across dozens of tools.
