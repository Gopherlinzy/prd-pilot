---
name: prd-pilot
description: >
  PRD-to-code cross-analysis and coding plan generation.
  Activate when: (1) user asks to audit/check/validate a PRD against code, (2) user says "prd:audit",
  "prd:plan", "审 PRD", "需求冲突检测", "PRD 审查", "生成 coding plan", "执行计划", "怎么改",
  (3) user provides a PRD document and asks if it conflicts with current implementation,
  (4) before Spec Coding to validate requirements feasibility.
  NOT for: generating code, writing PRDs, or simple document formatting/linting.
---

# PRD Pilot — Code-Requirement Cross Analyzer

Analyze a PRD document against a project codebase to detect conflicts, gaps, and implementation risks
before coding begins. Output a structured audit report with evidence-backed findings.

## Inputs

Two required inputs:
1. **PRD document**: Local markdown file path (e.g., `./docs/prd-v1.md`) or Feishu doc URL
2. **Project directory**: Local codebase root (defaults to current working directory)

If user provides a Feishu doc URL, follow this confirmation protocol before extracting content:

1. Call `mcp__feishu__docx_v1_document_rawContent` with the document ID extracted from the URL,
   but **only read the first ~200 characters** to obtain the document title / opening line.
2. Use AskUserQuestion:
   - Question: "检测到飞书文档「{document_title}」，确认是该文档吗？"
   - Options: ["确认，继续执行", "URL 有误，我来重新提供"]
3. Wait for user's selection before proceeding.
4. Only after confirmation: extract full content, save to a temp file, and proceed.

## Phase 1: Conflict Detection (PRD vs Code)

Execute these stages sequentially. Do not skip stages.

### Stage 1 — Requirement Extraction

Read the PRD document. Extract a structured requirement list:

```
For each requirement, extract:
- req_id: Sequential identifier (R1, R2, R3...)
- summary: One-line description
- keywords: 3-8 search terms for locating related code
- type: FEATURE_NEW | FEATURE_MODIFY | FEATURE_REMOVE | CONSTRAINT | NON_FUNCTIONAL
```

For keyword extraction guidance, read `references/requirement-taxonomy.md` if it exists.

After outputting the table, use AskUserQuestion:
- Question: "以上共 {n} 条需求，确认后进入 Stage 2，或告知需要调整的条目。"
- Options: ["确认，全部正确", "有条目需要调整（请在 Other 中说明）"]
Wait for user's response before proceeding.

### Stage 2 — Project Reconnaissance

**Command Timeout Convention:**
All external commands (`rg`, `find`, `grep`) use `timeout {T}` where T adapts to project scale:
- Small project (<30 files): T=30s
- Medium project (30-200 files): T=60s
- Large project (200+ files): T=120s
Estimate file count early via `find <dir> -maxdepth 2 -type f | wc -l` and set T accordingly.

**Path Safety Check (execute first):**
- Resolve `<dir>` to an absolute path
- Verify it is NOT a system root (`/`, `/etc`, `/usr`, `C:\`, `C:\Windows`, etc.)
- If validation fails → abort with: `❌ 项目目录路径异常：{path}。请提供项目根目录的绝对路径。`

1. Read top-level structure: `timeout {T} find <dir> -maxdepth 3 -type f | head -80`
2. Read key metadata files (if they exist): README.md, package.json, pyproject.toml, go.mod, etc.
3. Read source folder tree: `timeout {T} find <src> -maxdepth 4 -type f | head -120`

Produce a ≤300-word **Project Profile** (language, framework, main dirs, DB, API layer).

### Stage 2.5 — Documentation Health Check (Best-Effort)

> ⚠️ This stage is best-effort. Results inform but do not gate subsequent stages.

**Scale-Adaptive Skip:**
Estimate project size: `timeout {T} find <src_dir> -type f \( -name "*.go" -o -name "*.ts" -o -name "*.py" -o -name "*.java" \) | wc -l`
- If < 30 files (small project): **Skip Stage 2.5 and 2.8 entirely.** Jump to Stage 2.9.
  Output: "📦 小型项目（<30 文件），跳过文档健康检查和代码地图生成。"
- If >= 30 files: Continue with Stage 2.5 → 2.8 → 2.9.

**Existence check:**
- `timeout {T} find <project_dir> -maxdepth 2 -name "*.md" -not -path "*/node_modules/*" | head -20`
- If no documentation found → flag `⚠️ DOC_MISSING`

**Freshness check:**
- If last modified > 90 days ago → flag `⚠️ DOC_STALE: {filename} last updated {date}`

**Accuracy verification (best-effort):**
Spot-check a few key claims in docs against actual code (paths exist? imports match?).
Record: ✅ VERIFIED / ❌ CONTRADICTED / ⚠️ UNVERIFIABLE

**Output: Documentation Trust Score**
```
📋 Documentation Health
- Trust Level: HIGH (>80% verified) / MEDIUM (50-80%) / LOW (<50%) / NONE (no docs)
```

**Impact on subsequent stages:**
- Trust HIGH → Stage 3 can use doc-suggested paths as primary search targets
- Trust MEDIUM/LOW/NONE → Stage 3 treats docs as low-confidence hints, relies on `rg/find` discovery

### Stage 2.8 — Auto-Generate Code Map (when docs insufficient)

**Trigger**: Documentation Trust Level is MEDIUM, LOW, or NONE. Skip if HIGH or if small project (<30 files).

Generate a structured code map by reading the actual codebase:

```bash
# Find entry points, routers, handlers
timeout {T} rg -l "func main\b|app\.listen|router\.|@Controller|func.*Handler" <project> -t code | head -30
# Find model/entity definitions
timeout {T} rg -l "type.*struct|class.*Model|@Entity|schema\.|CREATE TABLE" <project> -t code | head -30
# Find API route definitions
timeout {T} rg -n "GET\|POST\|PUT\|DELETE\|@Get\|@Post\|router\.\|HandleFunc" <project> -t code | head -50
```

Write to `{project_dir}/.prd-pilot/code-map-{date}.md`. Mark uncertain entries with `(?)`.
This code map becomes the primary reference for Stage 3 and Stage 4.

### Stage 2.9 — Scan Budget Preview

Estimate scan cost and confirm with user:

```bash
timeout {T} find <src_dir> -type f \( -name "*.go" -o -name "*.ts" -o -name "*.py" -o -name "*.java" -o -name "*.js" \) | xargs wc -l 2>/dev/null | tail -1
```

Use AskUserQuestion:
- Question: "预计扫描 {N} 个文件、{LOC}k 行，共 {R} 条需求，继续执行 Stage 3？"
- Options: ["继续，使用默认上限", "调整上限（请在 Other 中填写数字）"]

### Stage 3 — Targeted Code Search

For each requirement from Stage 1:

1. `timeout {T} rg -l "<keyword>" <project_dir> --type-add 'code:*.{ts,tsx,js,jsx,py,go,rs,java,rb,vue,svelte}' -t code`
2. If 0 matching files → mark as `UNLOCATED`
3. For located requirements, read relevant sections: `timeout {T} rg -n -C 5 "<keyword>" <file>`
4. Cap at **2000 lines of code context per requirement** (adjust per `references/infrastructure.md` context management)

This stage is tool-driven (rg/grep/find). Do not rely on LLM memory of the codebase.

### Stage 4 — Cross Analysis

For each requirement, classify into:

| Verdict | Meaning | Action Required |
|---------|---------|-----------------|
| **CONFLICT** | PRD demands X, code does Y | Must resolve before coding |
| **WARNING** | Possible mismatch, could be indirect implementation | Human review needed |
| **PASS** | Requirement satisfied or compatible | No action |
| **GAP** | No existing code found (new feature needed) | Expected for new features |
| **UNKNOWN** | Cannot determine | Human review needed |

**Evidence rules:**
- Every CONFLICT and WARNING must include: `prd_excerpt`, `code_file`, `code_lines`, `reasoning`
- If you cannot cite specific code evidence → classify as UNKNOWN, never as CONFLICT
- Err on the side of WARNING over CONFLICT when uncertain

**False positive prevention:**
- Before marking CONFLICT, ask: "Could a developer reasonably handle this without code changes?"
- HTTP status codes can convey success/failure → front-end maps codes to text
- Missing explicit string literals ≠ "cannot display"
- Standard framework conventions count as implementation
- "Different approach, same outcome" → PASS with note, not CONFLICT

**Classification Decision Tree (boundary examples):**

| Scenario | Verdict | Reasoning |
|----------|---------|-----------|
| PRD: "显示成功提示", code returns `{code: 200}` without message | PASS | Frontend maps status codes to display text |
| PRD: "限制每人每天3次", no rate limiting code found | CONFLICT | Core constraint with no implementation evidence |
| PRD: "支持 Excel 导出", code has CSV export only | WARNING | Similar but not identical — context-dependent |
| PRD: "使用 Redis 缓存", code uses in-memory cache | WARNING | Different approach, may be intentional |
| PRD: "删除用户时同步删除关联数据", code soft-deletes only | CONFLICT | Data integrity requirement not met |

### Stage 5 — Report Assembly

**First-time write permission check:**
Before writing to `{project_dir}/.prd-pilot/` for the first time in a session, use AskUserQuestion:
- Question: "需要在项目目录创建 .prd-pilot/ 文件夹存放审计报告，是否允许？"
- Options: ["允许", "不允许，输出到终端即可"]
If user declines → print report to conversation only; do not create files.

Read `references/audit-output-format.md` if it exists; otherwise use inline format:

```
## PRD Audit Report — {YYYY-MM-DD}
**PRD**: {source} | **Project**: {name} | **Commit**: {hash}
**Summary**: CONFLICT: {n} | WARNING: {n} | GAP: {n} | PASS: {n} | UNKNOWN: {n}
---
### Findings
#### [{VERDICT}] {req_id} — {summary}
- **PRD Excerpt**: "{text}"
- **Code**: `{file}:{lines}`
- **Reasoning**: {2-3 sentences}
```

Write to: `{project_dir}/.prd-pilot/audit-{YYYY-MM-DD}.md`
If within taskforce, also copy to `blackboard/active/{task_id}_prd_audit.md`

If `.prd-pilot/` is not in `.gitignore`, display (do NOT auto-modify):
`💡 建议将 .prd-pilot/ 加入 .gitignore 以避免提交审计报告和缓存文件。`

## Integration with Taskforce

When used as a pre-step before `taskforce_act`:
1. PRD Pilot writes audit report to `blackboard/active/{task_id}_prd_audit.md`
2. In subsequent `taskforce_plan`, Neko reads this file to inform Spec generation
3. CONFLICTs become explicit resolution items; GAPs become new implementation items
4. PRD Pilot does NOT generate specs or code — it only detects and reports

## Limitations

- Cannot trace through highly dynamic dispatch (eval, reflection, complex DI containers)
- May miss implementations behind 3+ levels of indirection
- Non-functional requirements cannot be verified by static analysis
- Best suited for: API contracts, data models, feature flags, UI routes, config schemas
- Least suited for: cross-service interactions, runtime behavior, timing constraints

## Phase 2: Coding Plan Generation (prd:plan)

Generate a structured, file-level coding plan based on the audit report.

### Trigger

Trigger words: "生成 coding plan", "prd:plan", "执行计划", "怎么改"
Prerequisite: A `prd:audit` report must exist at `{project_dir}/.prd-pilot/audit-*.md`

### Process

#### Plan Step 1 — Load Audit Report

```bash
ls {project_dir}/.prd-pilot/audit-*.md 2>/dev/null | sort | tail -1
```
If empty → STOP: `❌ 未找到 audit 报告。请先运行 prd:audit。`
If found → load, extract CONFLICT/WARNING/GAP items. Record commit hash.

#### Plan Step 2 — WARNING Decision Collection

Present WARNINGs to user:
```
以下 WARNING 需要你的决策：
W1: {description} → [处理/跳过/延后]
```

If user says "全部处理", display:
```
⚠️ 部分 WARNING 可能是合理的间接实现方式，全部处理可能导致不必要的代码修改。建议逐条确认。仍要全部处理吗？
```
Options: ["继续全部处理", "逐条确认"]

#### Plan Step 3 — Generate Coding Plan

For each actionable item (CONFLICTs + GAPs + confirmed WARNINGs):
1. Determine affected files (from audit evidence)
2. Determine change direction (file-level, NOT function-level — CC decides implementation)
3. Determine dependencies (topological sort)
4. Estimate scope: small (1 file) / medium (2-5 files) / large (6+ files)

#### Plan Step 4 — Write Plan File

Write to: `{project_dir}/.prd-pilot/plan-{YYYY-MM-DD}.md`
Read `references/plan-output-format.md` if it exists; otherwise use inline format.

## Phase 3: Code Review against Plan (prd:review)

Review a PR/branch diff against the Coding Plan.

### Trigger

Trigger words: "prd:review", "审查 PR", "代码审查", "review PR", "覆盖率"
Prerequisite: A plan file at `{project_dir}/.prd-pilot/plan-*.md`

### Process

1. Load latest plan + git diff (`git diff main...HEAD --name-only`)
2. Build Expected_Change_List from plan tasks
3. Build Actual_Change_List from git diff
4. Three-way cross check:
   - 🔴 Out-of-scope: `Actual - Expected - Exempted`
   - 🟡 Missing: `Expected - Actual`
   - 🟢 Coverage: per-task file coverage percentage
5. Write report to `{project_dir}/.prd-pilot/review-{YYYY-MM-DD}.md`

### Relationship with Sigma

| Gate | Tool | Focus |
|------|------|-------|
| **1st** | prd:review | Compliance — right files changed? |
| **2nd** | Sigma | Functionality — code actually works? |

## Future Phases

- **Phase 4** — Remote Repository Support
- **Phase 5** — Feishu PRD Native Support via MCP
- **Parallel Code Search** — Multi-agent concurrent requirement scanning
- **Incremental Audit** — PRD diff → partial re-scan

## Infrastructure Improvements

For checkpoint/resume, parallel search, graceful degradation, code map reuse, and context window management, read `references/infrastructure.md`.
