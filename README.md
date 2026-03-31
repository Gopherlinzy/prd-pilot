# PRD Pilot

**PRD-to-code cross-analysis and coding plan generation for AI coding agents.**

PRD Pilot bridges the gap between product requirements and codebase reality. It detects conflicts, gaps, and implementation risks *before* coding begins — saving hours of rework.

📖 **Blog Post / 博客文章**: [AI 写代码之前，先让它读懂 PRD——PRD Pilot 的设计与思考](https://linzyblog.netlify.app/2026/03/28/prd-pilot-design-and-thoughts/)

[中文文档](#中文文档) | [English](#features)

---

## Features

- 🔍 **Conflict Detection** — Cross-analyze PRD requirements against actual code, not documentation
- 📋 **Coding Plan Generation** — Produce file-level, dependency-ordered task lists for AI agents
- 🔎 **Code Review** — Verify PR changes match the plan (scope compliance + coverage mapping)
- 📄 **Documentation Health Check** — Detect stale/inaccurate docs before relying on them
- 🗺️ **Auto Code Map** — Generate codebase understanding when docs are insufficient

## PRD Input Sources

PRD Pilot supports multiple input methods:

| Source | Method | Example |
|--------|--------|---------|
| **Local file** | Direct file path | `prd:audit ./docs/prd-v1.md` |
| **Feishu Doc** | Feishu MCP API (auto-detect URL) | `prd:audit https://xxx.feishu.cn/docx/xxx` |
| **Feishu Wiki** | Feishu Wiki API | `prd:audit https://xxx.feishu.cn/wiki/xxx` |

### Feishu Integration

PRD Pilot natively supports **Feishu (飞书)** documents as PRD input:

- **Auto-detection**: Paste a Feishu doc/wiki URL and PRD Pilot automatically extracts content via Feishu MCP API
- **Rich format support**: Tables, headings, lists, and inline styles are preserved during extraction
- **No manual export**: No need to copy-paste or download — read directly from Feishu
- **Works with**: `feishu_doc` (read action) and `feishu_wiki` (get action) APIs

```
# Read PRD from Feishu doc
prd:audit https://your-org.feishu.cn/docx/xxxxxx

# Read PRD from Feishu wiki
prd:audit https://your-org.feishu.cn/wiki/xxxxxx
```

## How It Works

PRD Pilot operates in three phases:

### Phase 1: Conflict Detection (`prd:audit`)

```
PRD Document → Requirement Extraction → Code Search → Cross Analysis → Audit Report
```

1. Extracts structured requirements from your PRD (with search keywords)
2. Scans your codebase using `rg/grep/find` — never relies on LLM memory
3. Classifies each requirement: **CONFLICT** / **WARNING** / **PASS** / **GAP** / **UNKNOWN**
4. Every finding includes code evidence (file path, line numbers, snippets)

### Phase 2: Coding Plan (`prd:plan`)

```
Audit Report → WARNING Decisions → Task Generation → Dependency Sort → Plan File
```

- Generates file-level tasks (not function-level — AI agents decide implementation details)
- Topologically sorted by dependency
- Commit-hash stamped for freshness
- Two human checkpoints: WARNING decisions + plan authorization

### Phase 3: Code Review (`prd:review`)

```
Plan + Git Diff → Scope Check → Coverage Mapping → Review Report
```

- 🔴 **Out-of-scope detection**: changed files not in the plan
- 🟡 **Missing implementation**: planned files not changed
- 🟢 **Coverage mapping**: requirement → task → file traceability

## Installation

### As an OpenClaw Skill

```bash
# Copy to your OpenClaw skills directory
cp -r prd-pilot ~/.openclaw/skills/

# Or clone this repo
git clone https://github.com/Gopherlinzy/prd-pilot.git ~/.openclaw/skills/prd-pilot
```

### As a Claude Code Skill

```bash
# Copy to your Claude Code skills directory
cp -r prd-pilot ~/.claude/skills/
```

## Usage

### Trigger Words

| Command | Action |
|---------|--------|
| `prd:audit` | Run conflict detection |
| `prd:plan` | Generate coding plan |
| `prd:review` | Review PR against plan |
| `审 PRD` | Run conflict detection (Chinese) |
| `需求冲突检测` | Run conflict detection (Chinese) |
| `生成 coding plan` | Generate coding plan (Chinese) |

### Quick Start

```
# 1. Audit your PRD against the codebase
prd:audit ./docs/requirements.md

# 2. Review warnings and generate a coding plan
prd:plan

# 3. After implementation, review the PR
prd:review
```

### Output Files

All outputs are saved to `{project_dir}/.prd-pilot/`:

```
.prd-pilot/
├── audit-2026-03-28.md       # Conflict detection report
├── plan-2026-03-28.md        # Coding plan
├── review-2026-03-28.md      # Code review report
└── code-map-2026-03-28.md    # Auto-generated code map (when docs insufficient)
```

## Integration

### With OpenClaw Taskforce

PRD Pilot integrates with the OpenClaw taskforce macro system:

1. Run `prd:audit` before `执行:` to validate requirements
2. Audit findings feed into Neko's spec generation
3. `prd:review` runs as part of Sigma's verification suite

### With CI/CD (Future)

```yaml
- name: PRD Review
  run: npx prd-pilot review --base main --plan .prd-pilot/plan-*.md
```

## Limitations

- Cannot trace through highly dynamic dispatch (eval, reflection, complex DI)
- May miss implementations behind 3+ levels of abstraction
- Non-functional requirements (performance, scalability) cannot be verified by static analysis
- Best for: API contracts, data models, feature flags, UI routes, config schemas

## License

MIT

---

# 中文文档

## PRD Pilot — PRD 与代码交叉分析工具

**在编码之前，检测 PRD 需求与代码库之间的冲突、差距和实现风险。**

## 功能特性

- 🔍 **冲突检测** — 将 PRD 需求与实际代码交叉分析（不依赖文档）
- 📋 **Coding Plan 生成** — 按依赖排序的文件级任务清单
- 🔎 **代码审查** — 验证 PR 变更是否符合计划（范围合规+覆盖率）
- 📄 **文档健康检查** — 检测过期/不准确的项目文档
- 🗺️ **自动代码地图** — 当文档不足时自动生成代码库理解

## PRD 输入来源

| 来源 | 方式 | 示例 |
|------|------|------|
| **本地文件** | 直接文件路径 | `prd:audit ./docs/prd-v1.md` |
| **飞书文档** | 飞书 MCP API（自动识别 URL）| `prd:audit https://xxx.feishu.cn/docx/xxx` |
| **飞书知识库** | 飞书 Wiki API | `prd:audit https://xxx.feishu.cn/wiki/xxx` |

### 飞书集成

PRD Pilot 原生支持**飞书文档**作为 PRD 输入：

- **自动识别**：粘贴飞书链接，自动通过飞书 MCP API 提取内容
- **富格式保留**：表格、标题、列表、行内样式在提取时完整保留
- **无需手动导出**：无需复制粘贴或下载，直接从飞书读取
- **支持接口**：`feishu_doc`（read）和 `feishu_wiki`（get）

## 工作流程

### 第一阶段：冲突检测 (`prd:audit`)

1. 从 PRD 提取结构化需求列表（含搜索关键词）
2. 使用 `rg/grep/find` 扫描代码库 — 不依赖 LLM 记忆
3. 对每个需求分类：**冲突** / **警告** / **通过** / **差距** / **未知**
4. 每个发现都附带代码证据（文件路径、行号、代码片段）

### 第二阶段：编码计划 (`prd:plan`)

- 生成文件级任务（不是函数级 — AI Agent 自行决定实现细节）
- 按依赖关系拓扑排序
- 带 commit hash 时间戳（确保新鲜度）
- 两个人工检查点：WARNING 决策 + 计划授权

### 第三阶段：代码审查 (`prd:review`)

- 🔴 **越界检测**：变更了计划之外的文件
- 🟡 **遗漏检测**：计划中的文件未被修改
- 🟢 **覆盖率映射**：需求 → 任务 → 文件 可追溯

## 安装

```bash
# OpenClaw 用户
git clone https://github.com/Gopherlinzy/prd-pilot.git ~/.openclaw/skills/prd-pilot

# Claude Code 用户
git clone https://github.com/Gopherlinzy/prd-pilot.git ~/.claude/skills/prd-pilot
```

## 使用方法

| 命令 | 动作 |
|------|------|
| `prd:audit` / `审 PRD` | 运行冲突检测 |
| `prd:plan` / `生成 coding plan` | 生成编码计划 |
| `prd:review` / `审查 PR` | 审查代码变更 |

## 许可证

MIT
