final result: passed

# Design QA

- Reference: Skills list sketch provided in the request.
- Prototype: http://127.0.0.1:1421/
- Viewport: 1280 x 720.

## Checks

- Top navigation matches the requested logo entry plus three compact tabs.
- Agent discovery first screen shows 19 target Agents and per-Agent Skills counts.
- Skills discovery uses the sketch structure: a capsule scope tab group on the left, Agent dropdown / refresh / search controls on the right, and no large page title above the list.
- The Skills toolbar now sits directly on the page background like the Agent module; only the list/detail board keeps the white panel treatment.
- Skills tab and board edges are aligned to the Agent module: measured left edge 24px and right edge 1256px at the 1280px viewport.
- Skills tab descriptions match the Agent module summary style and update for 全部 / 全局 / 项目.
- The Skills list no longer includes the 状态 column.
- Right-side toolbar order is 搜索, 刷新, Agent dropdown, with reduced sizing to sit at the same visual level as the tabs.
- Skill details are placed in a bottom inspector so SKILL.md, install locations, and sync actions remain visible without shrinking the list into a narrow middle pane.
- Sync page shows selected Skills, target scope controls, dry-run preview, and apply action.
- Browser verification found no page-level horizontal or vertical overflow at the tested viewport.
- Browser verification confirmed opening search closes the Agent menu, preventing overlapping controls.

## Notes

- The Vite browser preview uses demo inventory only outside Tauri because the real scanner requires the Tauri runtime.
- The Tauri desktop app continues to use the existing Rust scan, read, preview, and apply commands.
