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

If user provides a Feishu doc URL, use the `feishu-doc` skill to extract content first,
then save to a temp file and proceed.

## Phase 1: Conflict Detection (PRD vs Code)

Execute these stages sequentially. Do not skip stages.

### Stage 1 — Requirement Extraction

Read the PRD document. Extract a structured requirement list:

```
For each requirement, extract:
- req_id: Sequential identifier (R1, R2, R3...)
- summary: One-line description of what the requirement demands
- keywords: 3-8 search terms for locating related code (function names, API endpoints,
  DB table names, module names, UI component names, config keys)
- type: FEATURE_NEW | FEATURE_MODIFY | FEATURE_REMOVE | CONSTRAINT | NON_FUNCTIONAL
```

For keyword extraction guidance, read `references/requirement-taxonomy.md`.

Present the extracted list to the user for confirmation before proceeding.

### Stage 2 — Project Reconnaissance

Before searching for specific requirements, build a project context snapshot:

1. Read the project's top-level structure: `find <dir> -maxdepth 2 -type f | head -80`
2. Read key metadata files (if they exist): README.md, package.json, pyproject.toml,
   Cargo.toml, go.mod, Makefile, docker-compose.yml
3. Read the directory tree of `src/` or main source folder: `find <src> -type f | head -120`

Produce a ≤300-word **Project Profile** containing:
- Language/framework
- Main source directories
- Key modules/packages
- Database (if detectable)
- API layer (REST/GraphQL/gRPC, if detectable)

### Stage 2.5 — Documentation Health Check (Trust But Verify)

Project documentation may be stale, incomplete, or misleading. Before relying on it for analysis,
verify its trustworthiness:

**Existence check:**
- Run `find <project_dir> -maxdepth 2 -name "*.md" -not -path "*/node_modules/*" | head -20`
- Check for: README.md, ARCHITECTURE.md, docs/, api-docs/, CONTRIBUTING.md
- If no documentation found → flag `⚠️ DOC_MISSING` in report, increase Stage 3 search breadth

**Freshness check:**
- Run `stat -f "%Sm" <file>` (macOS) or `stat -c "%y" <file>` (Linux) for each doc file
- If last modified > 90 days ago → flag `⚠️ DOC_STALE: {filename} last updated {date}`
- Stale docs are still useful as hints, but never as authoritative evidence

**Accuracy verification (critical):**
For each factual claim in project docs, verify against actual code:
- Doc says "module X is at path/to/X" → `ls path/to/X` — does it exist?
- Doc says "uses Redis for caching" → `rg -l "redis" <project>` — is Redis actually imported?
- Doc says "API defined in routes/" → `ls routes/` — does this directory exist?
- Record each claim as: ✅ VERIFIED / ❌ CONTRADICTED / ⚠️ UNVERIFIABLE

**Output: Documentation Trust Score**
```
📋 Documentation Health
- Files found: {n} docs ({list})
- Freshness: {n} current / {n} stale (>90d) / {n} very stale (>180d)
- Accuracy: {n} verified / {n} contradicted / {n} unverifiable
- Trust Level: HIGH (>80% verified) / MEDIUM (50-80%) / LOW (<50%) / NONE (no docs)
```

**Impact on subsequent stages:**
- Trust HIGH → Stage 3 can use doc-suggested paths as primary search targets
- Trust MEDIUM → Stage 3 uses docs as hints but also does broad `rg` search
- Trust LOW/NONE → Stage 3 ignores docs entirely, relies only on `rg/find` discovery
- Any CONTRADICTED claims must be flagged in the final audit report as a separate finding

### Stage 2.8 — Auto-Generate Code Map (when docs insufficient)

**Trigger**: Documentation Trust Level is MEDIUM, LOW, or NONE.
Skip this stage if Trust Level is HIGH.

README is usually about installation, not code logic. When project docs are insufficient,
generate a structured code map by reading the actual codebase:

**Step 1: Service/Module Discovery**
```bash
# Find all entry points, routers, handlers, controllers
rg -l "func main\b|app\.listen|router\.|@Controller|@RestController|func.*Handler" <project> -t code | head -30
# Find all model/entity definitions
rg -l "type.*struct|class.*Model|@Entity|schema\.|CREATE TABLE" <project> -t code | head -30
# Find all API route definitions
rg -n "GET\|POST\|PUT\|DELETE\|@Get\|@Post\|router\.\|HandleFunc\|app\.get\|app\.post" <project> -t code | head -50
```

**Step 2: Dependency Graph (lightweight)**
```bash
# Internal imports between modules
rg -n "import.*internal/|from \.\./|require\('\.\." <project> -t code | head -40
```

**Step 3: Generate Code Map Document**
Write to `{project_dir}/.prd-pilot/code-map-{date}.md`:

```markdown
# Code Map (Auto-Generated by PRD Pilot)
Generated: {date} | Trust: derived from code analysis, not documentation

## Services & Entry Points
- {service_name}: {file_path} — {one-line description based on code inspection}

## API Endpoints
| Method | Path | Handler | File |
|--------|------|---------|------|
| GET | /api/xxx | XxxHandler | {file}:{line} |

## Data Models
| Model | File | Key Fields |
|-------|------|------------|
| User | {file} | id, email, name... |

## Module Dependencies
- {module_A} → imports → {module_B}

## Key Observations
- {architectural patterns noticed: DDD layers, microservice boundaries, etc.}
```

**This code map becomes the authoritative reference for Stage 3 and Stage 4.**
It replaces README as the primary project understanding source.

Note: The code map is a best-effort analysis. Mark any uncertain entries with `(?)`.
Save it to `.prd-pilot/` so it can be reused in future audits and incrementally updated.

### Stage 3 — Targeted Code Search

For each requirement from Stage 1:

1. Run `rg -l "<keyword>" <project_dir> --type-add 'code:*.{ts,tsx,js,jsx,py,go,rs,java,rb,vue,svelte}' -t code`
   for each keyword. Collect matching file paths.
2. If a requirement has 0 matching files across all keywords → mark as `UNLOCATED`
3. For located requirements, read the most relevant file sections (rg with context: `rg -n -C 5 "<keyword>" <file>`)
4. Cap at **2000 lines of code context per requirement**. If more, prioritize files with
   the most keyword hits.

This stage is tool-driven (rg/grep/find). Do not rely on LLM memory of the codebase.

### Stage 4 — Cross Analysis

For each requirement, with its associated code context loaded:

Analyze and classify into one of:

| Verdict | Meaning | Action Required |
|---------|---------|-----------------|
| **CONFLICT** | PRD demands X, code does Y (contradiction) | Must resolve before coding |
| **WARNING** | Possible mismatch, but could be indirect implementation | Human review needed |
| **PASS** | Requirement appears satisfied or compatible | No action |
| **GAP** | No existing code found (new feature needed) | Expected if PRD adds new features |
| **UNKNOWN** | Cannot determine (code too complex, metaprogramming, etc.) | Human review needed |

**Rules for reliable classification:**
- Every CONFLICT and WARNING must include `evidence`:
  - `prd_excerpt`: The exact PRD text
  - `code_file`: File path
  - `code_lines`: Line numbers and snippet (≤20 lines)
  - `reasoning`: Why this is a conflict (2-3 sentences)
- If you cannot cite specific code evidence → classify as UNKNOWN, never as CONFLICT
- Err on the side of WARNING over CONFLICT when uncertain
- PASS requires no evidence (but can include it)
- Analyze each requirement independently; do not carry assumptions between requirements

**False positive prevention (critical):**
- Before marking CONFLICT, ask: "Could a competent developer reasonably handle this without code changes?"
  - HTTP status codes can convey success/failure → front-end can display corresponding text
  - Empty/nil fields that get populated at runtime are NOT conflicts
  - Standard framework conventions (Gin's c.Success/c.JSON, GORM's auto-migration) count as implementation
  - Missing explicit string literals doesn't mean "cannot display" — UI layers routinely map codes to text
- If the "conflict" is really just "code does it differently than PRD literally describes but achieves the same outcome" → classify as PASS with a note, NOT as CONFLICT
- When uncertain whether something is a real conflict or just a different implementation approach → classify as WARNING, explain both interpretations, let human decide

### Stage 5 — Report Assembly

Produce the final audit report using the format in `references/audit-output-format.md`.

Write the report to the project directory:
- Output path: `{project_dir}/.prd-pilot/audit-{YYYY-MM-DD}.md`
- Create `.prd-pilot/` directory if it doesn't exist
- If a report for today already exists, append a suffix: `audit-{YYYY-MM-DD}-2.md`
- Additionally, if running within taskforce, copy to `blackboard/active/{task_id}_prd_audit.md` for Neko Spec integration
- Print a summary to conversation (verdict counts + top 3 findings) regardless of file output

## Integration with Taskforce (Spec Coding Flow)

When used as a pre-step before `taskforce_act`:

1. PRD Pilot writes audit report to `blackboard/active/{task_id}_prd_audit.md`
2. In the subsequent `taskforce_plan`, Neko should read this file to inform Spec generation
3. CONFLICTs should become explicit resolution items in the Spec
4. GAPs should become new implementation items in the Spec
5. PRD Pilot does NOT generate specs or code — it only detects and reports

## Limitations (Communicate to User)

- Cannot trace through highly dynamic dispatch (eval, reflection, complex DI containers)
- May miss implementations behind multiple layers of abstraction (3+ levels of indirection)
- Non-functional requirements (performance, scalability) cannot be verified by static analysis
- Best suited for: API contracts, data models, feature flags, UI routes, config schemas
- Least suited for: cross-service interactions, runtime behavior, timing constraints

## Phase 2: Coding Plan Generation (prd:plan)

Generate a structured, file-level coding plan based on the audit report.
The plan tells CC "which files to change and in what order" while leaving implementation details to CC.

### Trigger

Trigger words: "生成 coding plan", "prd:plan", "执行计划", "怎么改"
Prerequisite: A `prd:audit` report must exist at `{project_dir}/.prd-pilot/audit-*.md`

### Input

1. Latest audit report from `.prd-pilot/` (auto-detect newest `audit-*.md`)
2. Project directory (defaults to cwd)
3. (Optional) Commander's decisions on WARNING items

### Process

#### Plan Step 1 — Load Audit Report

- Read the latest `.prd-pilot/audit-*.md` file
- Extract all CONFLICT, WARNING, and GAP items
- If no audit report exists → prompt user to run `prd:audit` first
- Record current commit hash: `git rev-parse --short HEAD`

#### Plan Step 2 — WARNING Decision Collection

Present all WARNING items to the user for decision:

```
以下 WARNING 需要你的决策：
W1: {description} → [处理/跳过/延后]
W2: {description} → [处理/跳过/延后]
```

Wait for user response before proceeding. Map decisions:
- "处理" → Include in plan
- "跳过" → Exclude from plan
- "延后" → Mark as DEFERRED in plan

If user says "全部处理" or "all" → include all WARNINGs.
If user says "全部跳过" → exclude all WARNINGs.

#### Plan Step 3 — Generate Coding Plan

For each actionable item (all CONFLICTs + all GAPs + confirmed WARNINGs):

1. **Determine affected files** — from audit report evidence (file paths already known)
2. **Determine change direction** — what needs to change (file-level, NOT function-level)
   - CC decides the implementation details; plan only provides direction
3. **Determine dependencies** — which tasks must complete before others
   - e.g., "proto changes before handler changes", "DB migration before service logic"
4. **Topological sort** — order tasks by dependency graph
5. **Estimate scope** — small (1 file) / medium (2-5 files) / large (6+ files)

#### Plan Step 4 — Write Plan File

Write to: `{project_dir}/.prd-pilot/plan-{YYYY-MM-DD}.md`
Also copy to blackboard if within taskforce: `blackboard/active/{task_id}_prd_plan.md`

Use the format defined in `references/plan-output-format.md`.

Print summary to conversation:
```
📋 Coding Plan 已生成
{n} 个任务 | {n} 个文件 | 执行顺序: T1 → T2 → [T3 ∥ T4] → T5
⚠️ {n} 个延后项
基于 commit: {hash}
```

### Integration with taskforce_act

When `prd:plan` output exists, Luna should:
1. Include the plan file path in CODING-001 gate check (alongside Spec/Review files)
2. Inject into CC prompt: "请先读取 {plan_path}，按任务清单顺序执行。每完成一个任务 git commit。"
3. CC should follow task order but has freedom in implementation approach
4. If CC discovers the code has changed since plan's base commit → flag and continue cautiously

### Key Design Principles

- **File-level, not function-level**: CC may find better implementation approaches
- **Evidence-based**: Every task traces back to audit report findings with code references
- **Two human checkpoints**: WARNING decisions + Plan authorization
- **Commit-hash stamped**: Plan expires if code changes significantly
- **Incrementally updatable**: Re-run `prd:audit` + `prd:plan` after code changes

## Phase 3: Code Review against Plan (prd:review)

Review a PR/branch diff against the Coding Plan to detect out-of-scope changes,
missing implementations, and requirement coverage.

### Trigger

Trigger words: "prd:review", "审查 PR", "代码审查", "review PR", "覆盖率"
Prerequisite: A plan file must exist at `{project_dir}/.prd-pilot/plan-*.md`

### Input

1. Latest plan from `.prd-pilot/plan-*.md` (auto-detect newest)
2. Git diff: `git diff main...HEAD --name-only` (or user-specified base branch)
3. Project directory (defaults to cwd)

### Process

#### Review Step 1 — Load Plan + Diff

- Read the latest `.prd-pilot/plan-*.md`
- Extract plan's base commit hash
- Run `git diff main...HEAD --name-only` to get actual changed files
- Run `git diff main...HEAD --stat` for change magnitude
- If no plan exists → prompt user to run `prd:plan` first

#### Review Step 2 — Build Expected Change Whitelist

From each task `[T{n}]` in the plan, extract all listed file paths under "涉及文件".
Build the **Expected_Change_List** (set of file paths the plan says should change).

#### Review Step 3 — Parse Actual Changes

From git diff output, build the **Actual_Change_List**.
Also build an **Exempted_Files** list (changes that are always acceptable):

```
Exempted patterns (regex):
- .*\.(test|spec|_test)\.(js|ts|py|go|rs|java)$    # test files
- package-lock\.json|yarn\.lock|go\.sum|Cargo\.lock  # dependency locks
- \.github/workflows/.*                               # CI config
- docs/.*|\.md$                                       # documentation
- \.prd-pilot/.*                                      # prd-pilot output
- \.gitignore|\.env\.example|Makefile                 # project config
- .*\.generated\.|.*\.pb\.go$                         # generated files
```

#### Review Step 4 — Three-Way Cross Check

**🔴 Out-of-Scope Detection (越界检测)**
```
out_of_scope = Actual_Change_List - Expected_Change_List - Exempted_Files
```
For each out-of-scope file:
- Read `git diff main...HEAD -- {file}` (first 30 lines)
- Determine if it's a bug fix, refactor, or unrelated change
- Classify: 🔴 UNRELATED (different module) / 🟡 RELATED (same module, plausible side-effect)

**🟡 Missing Implementation Detection (遗漏检测)**
```
missing = Expected_Change_List - Actual_Change_List
```
For each missing file:
- Check if the task could have been implemented differently (different file, same logic)
- Classify: 🔴 MISSING (task not done) / 🟡 ALTERNATIVE (possibly done via different file)

**🟢 Requirement Coverage Mapping (需求覆盖)**
For each task T{n} in the plan:
- Check if ALL its listed files appear in Actual_Change_List
- Status: ✅ COVERED / ⚠️ PARTIAL / ❌ UNCOVERED
- Calculate overall coverage: covered_tasks / total_tasks * 100

#### Review Step 5 — Generate Report

Write to `{project_dir}/.prd-pilot/review-{YYYY-MM-DD}.md`
Use the format in `references/review-output-format.md`

Also output a compact summary suitable for GitHub PR comment.

### Integration with CI/CD

**As GitHub Action (Phase 2 CLI needed):**
```yaml
- name: PRD Review
  run: npx prd-pilot review --base main --plan .prd-pilot/plan-*.md
```

**As Sigma verification step (current, within OpenClaw):**
prd:review runs as part of Sigma's verification suite in taskforce_act Step 5.

### Relationship with Sigma

| Gate | Tool | Focus |
|------|------|-------|
| **1st gate** | prd:review | Compliance — did they change the right files? |
| **2nd gate** | Sigma | Functionality — does the code actually work? |

prd:review catches "wrong scope" problems that Sigma cannot detect.
Sigma catches "broken code" problems that prd:review cannot detect.
Both are needed.

## Future Phases (Not Yet Implemented)

- **Phase 4 — Remote Repository Support**: Clone and analyze remote git repos.
- **Phase 5 — Feishu PRD Native Support**: Read PRDs directly from Feishu doc URLs via MCP.

## Infrastructure Improvements

These improvements enhance reliability and performance without changing user-facing commands or interaction patterns.

### Checkpoint & Resume

Long audits (10+ requirements, large codebases) may fail mid-process due to context limits, tool errors, or session interruption. Implement save/resume to avoid losing progress.

**Protocol:**
1. After completing each requirement's code search (Stage 3), save intermediate results to `.prd-pilot/checkpoint-{date}.json`
2. Checkpoint format:
   ```json
   {
     "audit_date": "2026-03-28",
     "base_commit": "abc123",
     "prd_source": "./docs/prd-v1.md",
     "completed_requirements": ["R1", "R2", "R3"],
     "pending_requirements": ["R4", "R5"],
     "stage": "3-code-search",
     "results": { "R1": { "verdict": "CONFLICT", "files": [...] }, ... }
   }
   ```
3. On resume: detect existing checkpoint → ask user "Resume from checkpoint (3/5 requirements done)?" → skip completed requirements
4. Checkpoint is deleted after successful report generation

### Parallel Code Search

Stage 3 currently searches requirements sequentially. Since requirements are independent, they can be searched in parallel for significant speedup.

**Protocol:**
1. After Stage 1 (requirement extraction), group requirements into independent batches
2. In Stage 3, instruct the agent to search multiple requirements simultaneously rather than one-by-one
3. Use parallel subagent spawns when available (e.g., within OpenClaw taskforce, spawn parallel searchers)
4. Merge results after all searches complete
5. Expected speedup: 3-5x for audits with 8+ requirements

**Constraint:** Parallel search must not compromise evidence quality. Each requirement still needs full `rg` search with context lines.

### Graceful Degradation & Error Recovery

Tool commands may fail due to missing dependencies or environment issues. Implement fallback chains instead of aborting.

**Fallback chains:**

| Tool | Primary | Fallback 1 | Fallback 2 |
|------|---------|------------|------------|
| Code search | `rg -n -C 5` | `grep -rn` | `find + cat` |
| Git operations | `git diff`, `git log` | `diff` on files | Skip git-dependent features, note in report |
| Feishu doc read | `feishu_doc` API | `feishu_wiki` API | Prompt user to paste content manually |
| Project structure | `find -maxdepth 3` | `ls -R` | `tree` (if available) |

**Error reporting:** When a fallback is activated, include a note in the audit report:
```
⚠️ DEGRADED: rg not available, fell back to grep. Search results may be less precise.
```

### Code Map Persistence & Reuse

Stage 2.8 generates a code map when documentation is insufficient. Currently regenerated every audit. Enable reuse across sessions.

**Protocol:**
1. After generating code map, save to `.prd-pilot/code-map-{date}.md`
2. On subsequent audits, check for existing code map:
   - If exists and less than 7 days old → load and reuse (skip Stage 2.8)
   - If exists but older than 7 days → regenerate and replace
   - If codebase has changed significantly (>20% files modified since map date via `git diff --stat`) → regenerate
3. Support explicit refresh: when user says "prd:audit --refresh-map" or "重新生成代码地图", force regeneration
4. Code map file includes generation metadata:
   ```markdown
   <!-- Generated: 2026-03-28 | Commit: abc123 | Files analyzed: 142 -->
   ```

### Context Window Management

For large monorepos (100k+ LOC), the 2000-line-per-requirement cap in Stage 3 may be insufficient or wasteful. Adapt based on project scale.

**Protocol:**
1. During Stage 2 (Project Reconnaissance), estimate project scale:
   - Small (<10k LOC): 2000 lines/requirement (default)
   - Medium (10k-50k LOC): 1500 lines/requirement
   - Large (50k-100k LOC): 1000 lines/requirement, prioritize by keyword hit density
   - Very large (100k+ LOC): 800 lines/requirement, use file-level summaries for low-relevance matches
2. For files exceeding the per-requirement budget:
   - Extract only the functions/classes containing keyword hits (not entire file)
   - Include surrounding context (10 lines before/after the match)
3. Report the context budget used in the audit summary:
   ```
   📊 Context budget: 1000 lines/requirement (large project, 85k LOC)
   Total context consumed: 8,420 lines across 8 requirements
   ```
