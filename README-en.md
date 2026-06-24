<div align="center">
  <img src="agent-icons/m-my-skills-logo.png" alt="Manage My skills" width="120" />
  <h1>Manage My skills</h1>
  <p><b>Cross-platform desktop workbench to manage and safely sync AI Agent Skills</b></p>
  <p>Supports Windows & macOS ｜ Built for Claude Code, Cursor, Windsurf, Zed, Trae, Codex, and 20+ tools</p>
</div>

**Manage My skills** is a beautiful, cross-platform desktop workbench designed to discover, compare, adopt, and safely sync Agent Skills across major AI coding assistants including Claude Code, Cursor, Windsurf, Zed, Trae, Codex, and many others.

All filesystem mutations go through a strict **Preview → Confirm → Async Apply** flow. The core logic is powered by a high-performance Rust backend for maximum safety, speed, and responsiveness.

## 🖼️ Screenshots

<details>
<summary>💡 Click to expand and view all 9 screenshots</summary>

### 1. Skills Management & Workspaces
| Global Workspace | Project Workspace - Initial State |
| :---: | :---: |
| ![Global Workspace](src-tauri/icons/images/Snipaste_2026-06-24_20-49-59.png) | ![Project Workspace - Initial State](src-tauri/icons/images/Snipaste_2026-06-24_20-50-10.png) |

### 2. Discover Skill Store & Distribution Flow
| Online Skill Store | Distribution - Agent Selection |
| :---: | :---: |
| ![Online Skill Store](src-tauri/icons/images/Snipaste_2026-06-24_20-51-03.png) | ![Distribution - Agent Selection](src-tauri/icons/images/Snipaste_2026-06-24_20-51-14.png) |

| Distribution - Scope & Target Methods | Git Repository Source Manager |
| :---: | :---: |
| ![Distribution - Scope & Target Methods](src-tauri/icons/images/Snipaste_2026-06-24_20-51-20.png) | ![Git Repository Source Manager](src-tauri/icons/images/Snipaste_2026-06-24_20-51-33.png) |

### 3. System Configurations & Environment Check
| Data & Window Preferences | Custom Agent Registry |
| :---: | :---: |
| ![Data & Window Preferences](src-tauri/icons/images/Snipaste_2026-06-24_20-50-18.png) | ![Custom Agent Registry](src-tauri/icons/images/Snipaste_2026-06-24_20-50-26.png) |

| About & Environment Health Checkup |
| :---: |
| ![About & Environment Health Checkup](src-tauri/icons/images/Snipaste_2026-06-24_20-50-34.png) |

</details>

---

## 🌟 Features

* **Cross-Platform Native Styling & Window Behaviors**:
  - **macOS**: Beautiful frosted glass translucent window styling.
  - **Windows**: Deep integration with Windows 11/10 supporting native Mica and Acrylic effects with auto-adaptive window properties.
  - **System Tray & Window Controls**: Provides a polished system tray menu to toggle visibility via single left-click. Supports setting autostart, silent launching (tray-only backend start), and minimizing to tray instead of quitting on close.
* **Automatic Agent Discovery**: Automatically scans and lists all installed AI coding assistants and their global/project-level Skills directories.
* **Smart & Safe Sync Engine**:
  - Supports both **Global** and **Project** workspace scopes.
  - **Safety Backups**: If a physical folder conflicts with a symlink target during activation or deactivation, it automatically performs a timestamped backup (`[Folder].bak_YYYYMMDD_HHMMSS`) instead of throwing errors or destroying code.
  - **Windows Symlinks & Case Correction**: Deep support for Windows symlink configurations and two-step renaming hacks to avoid case-sensitivity issues and self-deletion bugs on Windows file systems.
* **High-Performance Git Caching & Updates**:
  - **Worker Queue Limiter**: Limits concurrent network requests to 3 to prevent CPU and connection spikes, keeping UI interactions (like switching tabs) smooth.
  - **Repo SHA-256 Hashing**: Repositories are persistently mapped and cached by Git URLs inside `app_data_dir/cache/repos/`.
  - **10-Second Deduplication Lock + Incremental Fetching**: Repetitive check requests within 10 seconds reuse cache. Beyond 10 seconds, it uses shallow `git fetch --depth 1` + hard reset, slashing check times from minutes down to **seconds**.
* **Precise Update Statuses**:
  - Inline tracking of remote repository versions (`checking` / `available` / `current` / `check-failed`).
  - **Detailed Error Cards**: If a Git check fails, detailed Rust/Git error logs are presented directly inline on a soft red warning card.
* **Troubleshooting & Fixes**: Detects orphaned directories, broken symlinks, mismatched frontmatter names, and missing metadata with one-click naming alignments.

---

## 🛠️ Supported AI Coding Assistants

* **Claude Code** (`.claude/skills/`)
* **Cursor** (`.cursor/skills/`)
* **Zed** (`.zed/skills/`)
* **Windsurf** (`.windsurf/skills/`)
* **Codex** (`.codex/skills/`)
* **Trae**, **Cline**, **Gemini CLI**, **GitHub Copilot**, **OpenCode**, **Warp**, **Qoder**, **Antigravity**, **Augment** and 20+ other tools.

---

## 🚀 Installation

### macOS
1. Download the latest `Manage My skills_*.dmg` from GitHub Releases.
2. Double-click and drag the application to your `Applications` folder.
3. On first launch, you might need to approve it under **System Settings → Privacy & Security**.

### Windows
1. Download the `.exe` installer or portable executable and run it.
2. *Note: Using Symlink syncing on Windows requires running the application as Administrator OR turning on "Developer Mode" in your Windows Settings.*

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
# Example: Bump to 0.1.2 and build
npm run release -- 0.1.2
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
* Runs TypeScript type checks, Vite production build, and Rust tests automatically on every PR or push to the `main` branch.
* Automates release compiles for Windows/macOS upon pushing tags, uploading release bundles straight to GitHub Releases.

---

## 💻 Tech Stack

* **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Radix UI
* **Desktop Runtime**: Tauri v2 (Rust)
* **Core Systems**: Rust (`walkdir`, `serde` serialization, `tokio` multi-threaded async pooling)
* **Design Language**: Quiet, high-density, native tool experience

---

## 📄 License

TBD (likely MIT / Apache-2.0).

---

**Manage My skills** — Stop letting your AI Agent Skills scatter across dozens of tools.
