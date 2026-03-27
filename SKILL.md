# PRD Pilot

## Metadata

- **name**: prd-pilot
- **version**: 0.1.0
- **author**: openclaw
- **category**: quality
- **tags**: prd, requirements, linter, review, feishu

## Description

需求驱动的开发质量守护系统。从飞书/Markdown PRD 文档中提取结构化需求，执行质量扫描，自动拆分为开发任务，并在 PR 阶段追踪需求覆盖率。

## Capabilities

### prd:parse

从文档来源获取并解析 PRD 为结构化数据。

```
prd:parse <url|filepath>
```

**参数:**
- `url|filepath` — 飞书文档 URL 或本地 Markdown 文件路径

**输出:** 标准化的 PRDDocument JSON

---

### prd:lint

对 PRD 执行质量扫描，检测缺陷和改进点。

```
prd:lint <url|filepath> [--rules <rule-ids>] [--severity <error|warning|info>]
```

**参数:**
- `url|filepath` — 文档来源
- `--rules` — 仅执行指定规则（逗号分隔）
- `--severity` — 仅输出指定严重程度及以上的问题

**输出:** LintIssue 列表 + 可读摘要

---

### prd:split

将 PRD 需求拆分为 GitHub Issues。

```
prd:split <url|filepath> [--repo <owner/repo>] [--dry-run]
```

**参数:**
- `url|filepath` — 文档来源
- `--repo` — 目标 GitHub 仓库
- `--dry-run` — 仅预览，不创建 Issue

**输出:** TaskItem 列表，dry-run 模式下仅输出预览

---

### prd:clarify

基于 lint 结果生成反向澄清问题。

```
prd:clarify <url|filepath> [--format <markdown|json>]
```

**参数:**
- `url|filepath` — 文档来源
- `--format` — 输出格式

**输出:** 澄清问题列表

---

### prd:review

审查 PR 对 PRD 需求的覆盖率。

```
prd:review <pr-url> --prd <url|filepath> [--threshold <number>]
```

**参数:**
- `pr-url` — GitHub PR URL
- `--prd` — 关联的 PRD 文档来源
- `--threshold` — 覆盖率阈值（默认 80%）

**输出:** CoverageReport + 审查建议

## Dependencies

- `@larksuiteoapi/node-sdk` — 飞书开放平台 SDK
- `openai` — OpenAI API 调用
- `@octokit/rest` — GitHub API
- `zod` — 运行时类型校验

## Configuration

```json
{
  "openai_api_key": "环境变量 OPENAI_API_KEY",
  "feishu_app_id": "环境变量 FEISHU_APP_ID",
  "feishu_app_secret": "环境变量 FEISHU_APP_SECRET",
  "github_token": "环境变量 GITHUB_TOKEN",
  "default_model": "gpt-4o",
  "coverage_threshold": 80
}
```
